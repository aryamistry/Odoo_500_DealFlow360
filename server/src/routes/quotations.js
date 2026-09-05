// src/routes/quotations.js
// Phase 3 (core) + Phase 4 (upsell) + Phase 5 (submit)

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { submitForApproval } = require('../services/governance');

const router = express.Router();
router.use(authenticate);

// Helper: compute unit price with price list adjustment
async function computeUnitPrice(productId, variantId, priceListId) {
  const { rows: [product] } = await pool.query('SELECT price, cost_price FROM products WHERE id=$1', [productId]);
  let base = parseFloat(product.price);

  if (variantId) {
    const { rows: [variant] } = await pool.query('SELECT extra_price FROM product_variant_values WHERE id=$1', [variantId]);
    if (variant) base += parseFloat(variant.extra_price);
  }

  if (priceListId) {
    const { rows: [pl] } = await pool.query('SELECT adjustment_type, adjustment_value FROM price_lists WHERE id=$1', [priceListId]);
    if (pl && pl.adjustment_type === 'percentage') {
      base = base * (1 + parseFloat(pl.adjustment_value) / 100);
    }
  }

  return { unit_price: base, cost_price: parseFloat(product.cost_price) };
}

// ── Quotation List ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, rep_id, customer_id } = req.query;
    let where = [];
    let params = [];
    let i = 1;

    if (status) { where.push(`q.status = $${i++}::quotation_status`); params.push(status); }
    if (rep_id) { where.push(`q.sales_rep_id = $${i++}`); params.push(rep_id); }
    if (customer_id) { where.push(`q.customer_id = $${i++}`); params.push(customer_id); }

    // Reps see only their own quotes
    if (req.user.role === 'sales_rep') {
      where.push(`q.sales_rep_id = $${i++}`); params.push(req.user.id);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await pool.query(`
      SELECT q.*, c.company_name AS customer_name, u.name AS rep_name,
        COALESCE(
          (SELECT SUM((ql.unit_price*(1-ql.discount_pct/100.0))*ql.quantity) FROM quotation_lines ql WHERE ql.quotation_id=q.id), 0
        ) AS total_amount,
        (SELECT COUNT(*) FROM quotation_lines ql WHERE ql.quotation_id=q.id) AS line_count
      FROM quotations q
      JOIN customers c ON c.id=q.customer_id
      JOIN users u ON u.id=q.sales_rep_id
      ${whereClause}
      ORDER BY q.updated_at DESC
    `, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Create Quotation ──────────────────────────────────────────────────────────
router.post('/', requireRole('sales_rep', 'sales_manager', 'admin'), async (req, res) => {
  const { customer_id } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'customer_id required' });

  try {
    // Resolve price_list_id from customer tier
    const { rows: [customer] } = await pool.query('SELECT tier FROM customers WHERE id=$1', [customer_id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const { rows: [priceList] } = await pool.query('SELECT id FROM price_lists WHERE tier=$1', [customer.tier]);
    const price_list_id = priceList?.id || null;

    const quoteNum = `QT-${Date.now()}`;
    const { rows: [q] } = await pool.query(
      `INSERT INTO quotations (quote_number, customer_id, sales_rep_id, price_list_id, status)
       VALUES ($1,$2,$3,$4,'draft') RETURNING *`,
      [quoteNum, customer_id, req.user.id, price_list_id]
    );
    res.status(201).json(q);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Get Quotation Detail ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (isNaN(parseInt(req.params.id, 10))) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const { rows: [q] } = await pool.query(`
      SELECT q.*, c.company_name AS customer_name, c.tier AS customer_tier,
             u.name AS rep_name, pl.adjustment_type, pl.adjustment_value
      FROM quotations q
      JOIN customers c ON c.id=q.customer_id
      JOIN users u ON u.id=q.sales_rep_id
      LEFT JOIN price_lists pl ON pl.id=q.price_list_id
      WHERE q.id=$1
    `, [req.params.id]);
    if (!q) return res.status(404).json({ error: 'Not found' });

    // Lines
    const { rows: lines } = await pool.query(`
      SELECT ql.*, p.name AS product_name, p.cost_price, p.subscription_plan_id,
             pv.attribute_name, pv.value AS variant_value, pv.extra_price,
             c.name AS category_name, c.max_discount_pct AS category_ceiling,
             ct.max_discount_pct AS tier_ceiling
      FROM quotation_lines ql
      JOIN products p ON p.id=ql.product_id
      JOIN categories c ON c.id=p.category_id
      JOIN customers cu ON cu.id=$2
      JOIN customer_tiers ct ON ct.tier=cu.tier
      LEFT JOIN product_variant_values pv ON pv.id=ql.product_variant_value_id
      WHERE ql.quotation_id=$1
      ORDER BY ql.created_at
    `, [req.params.id, q.customer_id]);

    // Activity log
    const { rows: activity } = await pool.query(`
      SELECT al.*, u.name AS actor_name, cu.company_name AS actor_company
      FROM quotation_activity_log al
      LEFT JOIN users u ON u.id=al.actor_user_id
      LEFT JOIN customers cu ON cu.id=al.actor_customer_id
      WHERE al.quotation_id=$1
      ORDER BY al.created_at
    `, [req.params.id]);

    // Approval steps
    const { rows: steps } = await pool.query(`
      SELECT aps.*, u.name AS assigned_to_name
      FROM approval_steps aps
      LEFT JOIN users u ON u.id=aps.assigned_to_user_id
      WHERE aps.quotation_id=$1
      ORDER BY aps.step_order
    `, [req.params.id]);

    // Compute totals
    const totals = lines.reduce((acc, l) => {
      const lineRevenue = parseFloat(l.unit_price) * (1 - parseFloat(l.discount_pct) / 100) * l.quantity;
      const lineCost = parseFloat(l.cost_price) * l.quantity;
      acc.revenue += lineRevenue;
      acc.cost += lineCost;
      return acc;
    }, { revenue: 0, cost: 0 });
    totals.margin = totals.revenue - totals.cost;
    totals.marginPct = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0;

    // Negotiation requests
    const { rows: negotiations } = await pool.query(
      'SELECT * FROM negotiation_requests WHERE quotation_id=$1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({ ...q, lines, activity, steps, totals, negotiations });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Add Line ──────────────────────────────────────────────────────────────────
router.post('/:id/lines', requireRole('sales_rep', 'sales_manager', 'admin'), async (req, res) => {
  const { product_id, product_variant_value_id, quantity = 1, discount_pct = 0 } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });

  try {
    const { rows: [q] } = await pool.query('SELECT price_list_id FROM quotations WHERE id=$1', [req.params.id]);
    const { unit_price } = await computeUnitPrice(product_id, product_variant_value_id, q?.price_list_id);

    const { rows: [line] } = await pool.query(
      `INSERT INTO quotation_lines (quotation_id, product_id, product_variant_value_id, quantity, unit_price, discount_pct)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, product_id, product_variant_value_id || null, quantity, unit_price.toFixed(2), discount_pct]
    );
    res.status(201).json(line);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Update Line ───────────────────────────────────────────────────────────────
router.patch('/:id/lines/:lineId', requireRole('sales_rep', 'sales_manager', 'admin'), async (req, res) => {
  const { quantity, discount_pct } = req.body;
  try {
    const { rows: [line] } = await pool.query(
      `UPDATE quotation_lines SET
        quantity=COALESCE($1,quantity),
        discount_pct=COALESCE($2,discount_pct)
       WHERE id=$3 AND quotation_id=$4 RETURNING *`,
      [quantity, discount_pct, req.params.lineId, req.params.id]
    );
    if (!line) return res.status(404).json({ error: 'Line not found' });
    res.json(line);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Delete Line ───────────────────────────────────────────────────────────────
router.delete('/:id/lines/:lineId', requireRole('sales_rep', 'sales_manager', 'admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM quotation_lines WHERE id=$1 AND quotation_id=$2', [req.params.lineId, req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Upsell Suggestions (Phase 4) ─────────────────────────────────────────────
router.get('/:id/upsell-suggestions', async (req, res) => {
  if (isNaN(parseInt(req.params.id, 10))) return res.json([]);
  try {
    const { rows: cartProductIds } = await pool.query(
      'SELECT DISTINCT product_id FROM quotation_lines WHERE quotation_id=$1',
      [req.params.id]
    );
    if (!cartProductIds.length) return res.json([]);

    const ids = cartProductIds.map(r => r.product_id);
    const { rows: suggestions } = await pool.query(`
      SELECT ur.*, p.name AS suggested_name, p.price AS suggested_price,
             p.cost_price AS suggested_cost, p.description,
             -- Margin delta = (price - cost) / price * 100
             ROUND(((p.price - p.cost_price) / NULLIF(p.price, 0)) * 100, 2) AS margin_pct
      FROM upsell_rules ur
      JOIN products p ON p.id=ur.suggested_product_id
      WHERE ur.primary_product_id = ANY($1::bigint[])
        AND ur.suggested_product_id <> ALL($1::bigint[])
        AND (ur.min_margin_pct IS NULL OR ((p.price - p.cost_price) / NULLIF(p.price, 0)) * 100 >= ur.min_margin_pct)
        AND p.status='active'
      ORDER BY ur.is_promoted DESC, margin_pct DESC
    `, [ids]);

    res.json(suggestions);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Accept Upsell (Phase 4) ───────────────────────────────────────────────────
router.post('/:id/upsell-accept', requireRole('sales_rep', 'sales_manager', 'admin'), async (req, res) => {
  const { suggested_product_id, quantity = 1, discount_pct = 0 } = req.body;
  if (!suggested_product_id) return res.status(400).json({ error: 'suggested_product_id required' });

  try {
    const { rows: [q] } = await pool.query('SELECT price_list_id FROM quotations WHERE id=$1', [req.params.id]);
    const { unit_price } = await computeUnitPrice(suggested_product_id, null, q?.price_list_id);

    const { rows: [line] } = await pool.query(
      `INSERT INTO quotation_lines (quotation_id, product_id, quantity, unit_price, discount_pct)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, suggested_product_id, quantity, unit_price.toFixed(2), discount_pct]
    );
    res.status(201).json(line);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Submit for Approval (Phase 5) ─────────────────────────────────────────────
router.post('/:id/submit', requireRole('sales_rep', 'sales_manager', 'admin'), async (req, res) => {
  try {
    const result = await submitForApproval(parseInt(req.params.id), req.user.id);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
