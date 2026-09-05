// src/routes/fulfillment.js
// Phase 6 — Fulfillment & Warehouse Split

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { splitFulfillment } = require('../services/fulfillment');
const { getPaginationParams, sendPaginated } = require('../utils/paginate');

const router = express.Router();
router.use(authenticate, requireRole('sales_rep', 'sales_manager', 'finance', 'admin'));

// ── Fulfillment List ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { page, limit, offset, isPaginated } = getPaginationParams(req);
    const limitClause  = isPaginated ? `LIMIT ${limit}`  : '';
    const offsetClause = isPaginated ? `OFFSET ${offset}` : '';

    const { rows } = await pool.query(`
      SELECT q.id AS quotation_id, q.quote_number, c.company_name AS customer_name, q.status,
             CASE
               WHEN EXISTS(SELECT 1 FROM fulfillment_lines fl JOIN quotation_lines ql ON ql.id=fl.quotation_line_id WHERE ql.quotation_id=q.id AND fl.is_backorder=true) THEN 'backordered'
               WHEN COALESCE((SELECT SUM(fl.quantity_fulfilled) FROM fulfillment_lines fl JOIN quotation_lines ql ON ql.id=fl.quotation_line_id WHERE ql.quotation_id=q.id),0) >= COALESCE((SELECT SUM(ql2.quantity) FROM quotation_lines ql2 WHERE ql2.quotation_id=q.id),0) THEN 'fulfilled'
               WHEN EXISTS(SELECT 1 FROM fulfillment_lines fl2 JOIN quotation_lines ql2 ON ql2.id=fl2.quotation_line_id WHERE ql2.quotation_id=q.id) THEN 'partial'
               ELSE 'pending'
             END AS fulfillment_status,
             COUNT(*) OVER() AS total_count
      FROM quotations q
      JOIN customers c ON c.id=q.customer_id
      WHERE q.status IN ('approved','confirmed')
      ORDER BY q.updated_at DESC
      ${limitClause} ${offsetClause}
    `);
    const total = parseInt(rows[0]?.total_count ?? rows.length, 10);
    const clean = rows.map(({ total_count, ...r }) => r);
    sendPaginated(res, clean, { page, limit, total, isPaginated });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});


// ── Fulfillment Detail ────────────────────────────────────────────────────────
router.get('/:quotationId', async (req, res) => {
  const qId = parseInt(req.params.quotationId, 10);
  if (isNaN(qId)) return res.status(400).json({ error: 'Invalid quotation ID' });

  try {
    const { rows: lines } = await pool.query(`
      SELECT ql.id AS line_id, p.name AS product_name, ql.quantity AS ordered_qty,
             COALESCE(json_agg(json_build_object(
               'id', fl.id,
               'fulfillment_id', fl.id,
               'warehouse_id', fl.warehouse_id,
               'warehouse_name', w.name,
               'quantity_fulfilled', fl.quantity_fulfilled,
               'is_backorder', fl.is_backorder,
               'shipped_at', fl.shipped_at
             ) ORDER BY fl.id) FILTER (WHERE fl.id IS NOT NULL), '[]') AS fulfillment_lines,
             COALESCE(SUM(fl.quantity_fulfilled), 0) AS total_fulfilled,
             ql.quantity - COALESCE(SUM(CASE WHEN fl.is_backorder=false THEN fl.quantity_fulfilled ELSE 0 END), 0) AS remaining
      FROM quotation_lines ql
      JOIN products p ON p.id=ql.product_id
      LEFT JOIN fulfillment_lines fl ON fl.quotation_line_id=ql.id
      LEFT JOIN warehouses w ON w.id=fl.warehouse_id
      WHERE ql.quotation_id=$1
      GROUP BY ql.id, p.name, ql.quantity
      ORDER BY ql.id
    `, [qId]);

    res.json({ quotation_id: qId, lines });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Trigger Split ─────────────────────────────────────────────────────────────
router.post('/:quotationId/split', requireRole('admin', 'sales_manager', 'finance'), async (req, res) => {
  const qId = parseInt(req.params.quotationId, 10);
  if (isNaN(qId)) return res.status(400).json({ error: 'Invalid quotation ID' });

  try {
    const result = await splitFulfillment(qId);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Manual Override: delete + re-insert fulfillment lines ─────────────────────
router.put('/:quotationId/override', requireRole('admin', 'sales_manager'), async (req, res) => {
  const { line_id, overrides } = req.body; // overrides: [{warehouse_id, quantity_fulfilled}]
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM fulfillment_lines WHERE quotation_line_id=$1', [line_id]);
    for (const ov of overrides) {
      await client.query(
        'INSERT INTO fulfillment_lines (quotation_line_id, warehouse_id, quantity_fulfilled, is_backorder) VALUES ($1,$2,$3,false)',
        [line_id, ov.warehouse_id, ov.quantity_fulfilled]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Override applied' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Consolidate Backorder ─────────────────────────────────────────────────────
router.post('/:quotationId/consolidate', requireRole('admin', 'sales_manager'), async (req, res) => {
  const { line_id, warehouse_id, quantity } = req.body;
  try {
    await pool.query(
      'INSERT INTO fulfillment_lines (quotation_line_id, warehouse_id, quantity_fulfilled, is_backorder) VALUES ($1,$2,$3,false)',
      [line_id, warehouse_id, quantity]
    );
    res.json({ message: 'Backorder consolidated' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Mark Shipped (Bug 3 fix) ──────────────────────────────────────────────────
// Sets shipped_at = now() on a specific fulfillment_line.
// This is what the Delivery Slippage dashboard tile queries against.
// Only non-backorder lines should be marked as shipped.
router.post('/:quotationId/ship', requireRole('admin', 'sales_manager', 'finance'), async (req, res) => {
  const { fulfillment_line_id } = req.body;
  if (!fulfillment_line_id)
    return res.status(400).json({ error: 'fulfillment_line_id is required' });

  try {
    // Verify the fulfillment line belongs to this quotation and is not a backorder
    const { rows: [fl] } = await pool.query(
      `SELECT fl.id, fl.is_backorder, fl.shipped_at
       FROM fulfillment_lines fl
       JOIN quotation_lines ql ON ql.id = fl.quotation_line_id
       WHERE fl.id = $1 AND ql.quotation_id = $2`,
      [fulfillment_line_id, req.params.quotationId]
    );

    if (!fl) return res.status(404).json({ error: 'Fulfillment line not found for this quotation' });
    if (fl.is_backorder) return res.status(400).json({ error: 'Cannot mark a backorder line as shipped' });
    if (fl.shipped_at) return res.status(400).json({ error: 'Already marked as shipped' });

    const { rows: [updated] } = await pool.query(
      'UPDATE fulfillment_lines SET shipped_at = now() WHERE id = $1 RETURNING *',
      [fulfillment_line_id]
    );
    res.json({ message: 'Marked as shipped', fulfillment_line: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
