// src/routes/analytics.js
// Phase 10 — Deal Health & Reporting

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin', 'sales_manager', 'finance'));

// ── Stalled Deals ─────────────────────────────────────────────────────────────
router.get('/deal-health/stalled', async (_req, res) => {
  try {
    // Gap 4: read stalled_deal_days from platform_settings (admin-configurable)
    let stalledDays = 7;
    try {
      const { rows: setting } = await pool.query(
        "SELECT value FROM platform_settings WHERE key='stalled_deal_days'"
      );
      if (setting.length > 0) stalledDays = Math.max(1, parseInt(setting[0].value) || 7);
    } catch (_) { /* table may not exist in older deploys, fall back to 7 */ }

    const { rows } = await pool.query(`
      SELECT q.id, q.quote_number, q.status, q.updated_at, q.risk_level,
             c.company_name AS customer_name, u.name AS rep_name,
             EXTRACT(DAY FROM now() - q.updated_at) AS days_stalled,
             COALESCE((SELECT SUM((ql.unit_price*(1-ql.discount_pct/100.0))*ql.quantity) FROM quotation_lines ql WHERE ql.quotation_id=q.id),0) AS total_amount
      FROM quotations q
      JOIN customers c ON c.id=q.customer_id
      JOIN users u ON u.id=q.sales_rep_id
      WHERE q.status NOT IN ('confirmed','rejected')
        AND q.updated_at < now() - INTERVAL '${stalledDays} days'
      ORDER BY q.updated_at ASC
    `);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Discount Anomalies ────────────────────────────────────────────────────────
// A2 fix: removed dead rep_avg CTE + LATERAL-per-active-line pattern.
// The CTE now computes one avg_hist_discount per rep (DISTINCT + window AVG),
// and the final SELECT joins against it — one aggregation pass instead of
// one correlated sub-scan per active line.
router.get('/deal-health/discount-anomalies', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH rep_avg AS (
        SELECT DISTINCT q.sales_rep_id,
               AVG(ql.discount_pct) OVER (PARTITION BY q.sales_rep_id) AS avg_hist_discount
        FROM quotation_lines ql
        JOIN quotations q ON q.id = ql.quotation_id
        WHERE q.status = 'confirmed'
      ),
      active_lines AS (
        SELECT ql.*, q.sales_rep_id, q.quote_number, u.name AS rep_name,
               p.name AS product_name, c.company_name AS customer_name
        FROM quotation_lines ql
        JOIN quotations q ON q.id = ql.quotation_id
        JOIN users u ON u.id = q.sales_rep_id
        JOIN customers c ON c.id = q.customer_id
        JOIN products p ON p.id = ql.product_id
        WHERE q.status NOT IN ('confirmed','rejected')
      )
      SELECT al.id AS line_id, al.quote_number, al.rep_name, al.product_name, al.customer_name,
             al.discount_pct, ra.avg_hist_discount,
             al.discount_pct - COALESCE(ra.avg_hist_discount, 0) AS anomaly_delta
      FROM active_lines al
      LEFT JOIN rep_avg ra ON ra.sales_rep_id = al.sales_rep_id
      WHERE al.discount_pct > COALESCE(ra.avg_hist_discount, 0) + 5
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

// ── Report Filter Options ───────────────────────────────────────────────────
router.get('/reports/filter-options', async (_req, res) => {
  try {
    const [reps, categories] = await Promise.all([
      pool.query("SELECT id, name, role FROM users WHERE role IN ('sales_rep', 'sales_manager') ORDER BY name"),
      pool.query('SELECT id, name FROM categories ORDER BY name'),
    ]);
    res.json({
      reps: reps.rows,
      categories: categories.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

// ── Summary stats for dashboard & deal health ────────────────────────────────
const getSummary = async (_req, res) => {
  try {
    const [quotes, invoices, subscriptions] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) FROM quotations GROUP BY status`),
      pool.query(`SELECT status, COUNT(*), COALESCE(SUM(amount),0) AS total, COALESCE(SUM(amount),0) AS sum FROM invoices GROUP BY status`),
      pool.query(`SELECT status, COUNT(*) FROM subscriptions GROUP BY status`),
    ]);
    res.json({
      quotations: quotes.rows,
      invoices: invoices.rows,
      subscriptions: subscriptions.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
};

router.get('/deal-health/summary', getSummary);
router.get('/reports/summary', getSummary);

module.exports = router;
