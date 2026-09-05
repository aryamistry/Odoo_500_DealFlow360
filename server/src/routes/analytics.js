// src/routes/analytics.js
// Phase 10 — Deal Health & Reporting

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin', 'sales_manager', 'finance'));

const STALLED_DAYS = 7; // App constant — not a DB config row per PRD

// ── Stalled Deals ─────────────────────────────────────────────────────────────
router.get('/deal-health/stalled', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT q.id, q.quote_number, q.status, q.updated_at, q.risk_level,
             c.company_name AS customer_name, u.name AS rep_name,
             EXTRACT(DAY FROM now() - q.updated_at) AS days_stalled,
             COALESCE((SELECT SUM((ql.unit_price*(1-ql.discount_pct/100.0))*ql.quantity) FROM quotation_lines ql WHERE ql.quotation_id=q.id),0) AS total_amount
      FROM quotations q
      JOIN customers c ON c.id=q.customer_id
      JOIN users u ON u.id=q.sales_rep_id
      WHERE q.status NOT IN ('confirmed','rejected')
        AND q.updated_at < now() - INTERVAL '${STALLED_DAYS} days'
      ORDER BY q.updated_at ASC
    `);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Discount Anomalies ────────────────────────────────────────────────────────
router.get('/deal-health/discount-anomalies', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH rep_avg AS (
        SELECT ql.quotation_id, q.sales_rep_id,
               AVG(ql.discount_pct) OVER (PARTITION BY q.sales_rep_id) AS avg_hist_discount
        FROM quotation_lines ql
        JOIN quotations q ON q.id=ql.quotation_id
        WHERE q.status='confirmed'
      ),
      active_lines AS (
        SELECT ql.*, q.sales_rep_id, q.quote_number, u.name AS rep_name,
               p.name AS product_name, c.company_name AS customer_name
        FROM quotation_lines ql
        JOIN quotations q ON q.id=ql.quotation_id
        JOIN users u ON u.id=q.sales_rep_id
        JOIN customers c ON c.id=q.customer_id
        JOIN products p ON p.id=ql.product_id
        WHERE q.status NOT IN ('confirmed','rejected')
      )
      SELECT al.id AS line_id, al.quote_number, al.rep_name, al.product_name, al.customer_name,
             al.discount_pct, ra.avg_hist_discount,
             al.discount_pct - COALESCE(ra.avg_hist_discount, 0) AS anomaly_delta
      FROM active_lines al
      LEFT JOIN LATERAL (
        SELECT AVG(ql2.discount_pct) AS avg_hist_discount
        FROM quotation_lines ql2
        JOIN quotations q2 ON q2.id=ql2.quotation_id
        WHERE q2.sales_rep_id=al.sales_rep_id AND q2.status='confirmed'
      ) ra ON true
      WHERE al.discount_pct > COALESCE(ra.avg_hist_discount, 0) + 5  -- anomaly threshold: 5% above avg
      ORDER BY anomaly_delta DESC
    `);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Delivery Slippage ─────────────────────────────────────────────────────────
router.get('/deal-health/delivery-slippage', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT q.id, q.quote_number, q.promised_delivery_date,
             c.company_name AS customer_name, u.name AS rep_name,
             MAX(fl.shipped_at) AS actual_completion,
             CASE WHEN MAX(fl.shipped_at) > q.promised_delivery_date THEN true ELSE false END AS is_slipped,
             EXTRACT(DAY FROM MAX(fl.shipped_at) - q.promised_delivery_date) AS slippage_days
      FROM quotations q
      JOIN customers c ON c.id=q.customer_id
      JOIN users u ON u.id=q.sales_rep_id
      JOIN quotation_lines ql ON ql.quotation_id=q.id
      JOIN fulfillment_lines fl ON fl.quotation_line_id=ql.id
      WHERE q.promised_delivery_date IS NOT NULL
        AND fl.is_backorder=false AND fl.shipped_at IS NOT NULL
      GROUP BY q.id, q.quote_number, q.promised_delivery_date, c.company_name, u.name
      HAVING MAX(fl.shipped_at) > q.promised_delivery_date
      ORDER BY slippage_days DESC
    `);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Escalate ──────────────────────────────────────────────────────────────────
router.post('/deal-health/escalate/:quotationId', async (req, res) => {
  const { note } = req.body;
  try {
    await pool.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, note)
       VALUES ($1,'escalated',$2,$3)`,
      [req.params.quotationId, req.user.id, note || 'Escalated by manager']
    );
    res.json({ message: 'Escalated' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Nudge Rep ─────────────────────────────────────────────────────────────────
router.post('/deal-health/nudge/:quotationId', async (req, res) => {
  const { note } = req.body;
  try {
    await pool.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, note)
       VALUES ($1,'nudge_sent',$2,$3)`,
      [req.params.quotationId, req.user.id, note || 'Nudge sent to rep']
    );
    res.json({ message: 'Nudge sent' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
  try {
    const { from, to, rep_id, approval_status, category_id, status } = req.query;
    let where = [];
    let params = [];
    let i = 1;

    if (from) { where.push(`q.created_at >= $${i++}`); params.push(from); }
    if (to) { where.push(`q.created_at <= $${i++}`); params.push(to); }
    if (rep_id) { where.push(`q.sales_rep_id = $${i++}`); params.push(rep_id); }
    if (status) { where.push(`q.status = $${i++}::quotation_status`); params.push(status); }
    if (category_id) { where.push(`p.category_id = $${i++}`); params.push(category_id); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await pool.query(`
      SELECT
        q.status,
        q.risk_level,
        COUNT(DISTINCT q.id) AS quote_count,
        COALESCE(SUM(ql.unit_price*(1-ql.discount_pct/100.0)*ql.quantity),0) AS total_revenue,
        COALESCE(SUM((ql.unit_price*(1-ql.discount_pct/100.0) - p.cost_price)*ql.quantity),0) AS total_margin,
        AVG(ql.discount_pct) AS avg_discount_pct
      FROM quotations q
      LEFT JOIN quotation_lines ql ON ql.quotation_id=q.id
      LEFT JOIN products p ON p.id=ql.product_id
      ${whereClause}
      GROUP BY q.status, q.risk_level
      ORDER BY q.status
    `, params);

    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Summary stats for dashboard ───────────────────────────────────────────────
router.get('/reports/summary', async (_req, res) => {
  try {
    const [quotes, invoices, subscriptions] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) FROM quotations GROUP BY status`),
      pool.query(`SELECT status, COUNT(*), SUM(amount) FROM invoices GROUP BY status`),
      pool.query(`SELECT status, COUNT(*) FROM subscriptions GROUP BY status`),
    ]);
    res.json({
      quotations: quotes.rows,
      invoices: invoices.rows,
      subscriptions: subscriptions.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
