// src/routes/portal.js
// Phase 9 — Customer Portal: view quotes, submit negotiation, confirm

const express = require('express');
const pool = require('../db');
const { authenticate, requireCustomer } = require('../middleware/auth');
const { splitFulfillment } = require('../services/fulfillment');
const { createInvoices } = require('../services/billing');
const { getPaginationParams, sendPaginated } = require('../utils/paginate');

const router = express.Router();
router.use(authenticate, requireCustomer);


// ── List customer's quotations ────────────────────────────────────────────────
router.get('/quotations', async (req, res) => {
  try {
    const { page, limit, offset, isPaginated } = getPaginationParams(req);
    const limitClause  = isPaginated ? `LIMIT ${limit}`  : '';
    const offsetClause = isPaginated ? `OFFSET ${offset}` : '';

    const { rows } = await pool.query(`
      SELECT q.*, u.name AS rep_name,
        COALESCE(
          (SELECT SUM((ql.unit_price*(1-ql.discount_pct/100.0))*ql.quantity) FROM quotation_lines ql WHERE ql.quotation_id=q.id), 0
        ) AS total_amount,
        COUNT(*) OVER() AS total_count
      FROM quotations q
      JOIN users u ON u.id=q.sales_rep_id
      WHERE q.customer_id=$1
      ORDER BY q.updated_at DESC
      ${limitClause} ${offsetClause}
    `, [req.user.customerId]);

    const total = parseInt(rows[0]?.total_count ?? rows.length, 10);
    const clean = rows.map(({ total_count, ...r }) => r);
    sendPaginated(res, clean, { page, limit, total, isPaginated });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});


// ── Get single quotation (read-only) ─────────────────────────────────────────
router.get('/quotations/:id', async (req, res) => {
  try {
    const { rows: [q] } = await pool.query(`
      SELECT q.*, u.name AS rep_name FROM quotations q JOIN users u ON u.id=q.sales_rep_id
      WHERE q.id=$1 AND q.customer_id=$2
    `, [req.params.id, req.user.customerId]);
    if (!q) return res.status(404).json({ error: 'Not found' });

    const { rows: lines } = await pool.query(
      `SELECT ql.*, p.name AS product_name FROM quotation_lines ql JOIN products p ON p.id=ql.product_id WHERE ql.quotation_id=$1`,
      [req.params.id]
    );

    const { rows: negotiations } = await pool.query(
      'SELECT * FROM negotiation_requests WHERE quotation_id=$1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({ ...q, lines, negotiations });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Submit negotiation request ────────────────────────────────────────────────
router.post('/quotations/:id/negotiate', async (req, res) => {
  const { quotation_line_id, customer_comment, counter_discount_pct, requested_delivery_date } = req.body;
  if (!customer_comment) return res.status(400).json({ error: 'customer_comment required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify ownership
    const { rows: [q] } = await client.query(
      'SELECT id FROM quotations WHERE id=$1 AND customer_id=$2',
      [req.params.id, req.user.customerId]
    );
    if (!q) return res.status(404).json({ error: 'Not found' });

    const { rows: [neg] } = await client.query(
      `INSERT INTO negotiation_requests (quotation_id, quotation_line_id, customer_comment, counter_discount_pct, requested_delivery_date)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, quotation_line_id || null, customer_comment, counter_discount_pct || null, requested_delivery_date || null]
    );

    await client.query("UPDATE quotations SET status='under_negotiation' WHERE id=$1", [req.params.id]);

    await client.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_customer_id, negotiation_request_id, note)
       VALUES ($1,'negotiation_submitted',$2,$3,$4)`,
      [req.params.id, req.user.customerId, neg.id, customer_comment]
    );

    await client.query('COMMIT');
    res.status(201).json(neg);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Confirm quotation ─────────────────────────────────────────────────────────
router.post('/quotations/:id/confirm', async (req, res) => {
  const { promised_delivery_date } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [q] } = await client.query(
      "SELECT * FROM quotations WHERE id=$1 AND customer_id=$2 AND status='approved'",
      [req.params.id, req.user.customerId]
    );
    if (!q) return res.status(400).json({ error: 'Quotation not found or not in approved state' });

    await client.query(
      "UPDATE quotations SET status='confirmed', confirmed_at=now(), promised_delivery_date=$1 WHERE id=$2",
      [promised_delivery_date || null, req.params.id]
    );

    await client.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_customer_id, note)
       VALUES ($1,'confirmed',$2,'Customer confirmed the quotation')`,
      [req.params.id, req.user.customerId]
    );

    await client.query('COMMIT');

    // Kick off fulfillment + billing synchronously before responding
    try {
      await splitFulfillment(parseInt(req.params.id));
      await createInvoices(parseInt(req.params.id), req.user.customerId);
    } catch (e) {
      console.error('Post-confirmation processing error:', e);
    }

    res.json({ message: 'Quotation confirmed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
