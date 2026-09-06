// src/routes/approvals.js
// Phase 5 — Approval Workflow + Negotiation Resolution

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { reEvaluateAfterNegotiation } = require('../services/governance');
const { getPaginationParams, sendPaginated } = require('../utils/paginate');

const router = express.Router();
router.use(authenticate);

// ── Approvals List (manager/finance view) ─────────────────────────────────────
router.get('/', requireRole('sales_manager', 'finance', 'admin'), async (req, res) => {
  try {
    const { search } = req.query;
    const { page, limit, offset, isPaginated } = getPaginationParams(req);

    let where = ["aps.status='pending'"];
    let params = [];
    let i = 1;

    if (req.user.role !== 'admin') {
      where.push(`aps.approver_role = $${i++}`);
      params.push(req.user.role);
    }

    if (search && search.trim()) {
      where.push(`(q.quote_number ILIKE $${i} OR c.company_name ILIKE $${i} OR u.name ILIKE $${i})`);
      params.push(`%${search.trim()}%`);
      i++;
    }

    const whereClause = 'WHERE ' + where.join(' AND ');
    const limitClause  = isPaginated ? `LIMIT $${i++}`  : '';
    const offsetClause = isPaginated ? `OFFSET $${i++}` : '';
    if (isPaginated) { params.push(limit); params.push(offset); }

    const { rows } = await pool.query(`
      SELECT aps.*, q.quote_number, q.status AS quote_status, q.risk_level,
             c.company_name AS customer_name, u.name AS rep_name,
             COALESCE(
               (SELECT SUM((ql.unit_price*(1-ql.discount_pct/100.0))*ql.quantity) FROM quotation_lines ql WHERE ql.quotation_id=q.id), 0
             ) AS total_amount,
             COUNT(*) OVER() AS total_count
      FROM approval_steps aps
      JOIN quotations q ON q.id=aps.quotation_id
      JOIN customers c ON c.id=q.customer_id
      JOIN users u ON u.id=q.sales_rep_id
      ${whereClause}
      ORDER BY aps.created_at DESC
      ${limitClause} ${offsetClause}
    `, params);
    const total = parseInt(rows[0]?.total_count ?? rows.length, 10);
    const clean = rows.map(({ total_count, ...r }) => r);
    sendPaginated(res, clean, { page, limit, total, isPaginated });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Approval Detail with activity ─────────────────────────────────────────────
router.get('/:quotationId', requireRole('sales_rep', 'sales_manager', 'finance', 'admin'), async (req, res) => {
  try {
    const { rows: [q] } = await pool.query(`
      SELECT q.*, c.company_name AS customer_name, u.name AS rep_name
      FROM quotations q
      JOIN customers c ON c.id=q.customer_id
      JOIN users u ON u.id=q.sales_rep_id
      WHERE q.id=$1
    `, [req.params.quotationId]);
    if (!q) return res.status(404).json({ error: 'Not found' });

    const { rows: steps } = await pool.query(
      `SELECT aps.*, u.name AS assigned_to_name FROM approval_steps aps
       LEFT JOIN users u ON u.id=aps.assigned_to_user_id
       WHERE aps.quotation_id=$1 ORDER BY aps.step_order`,
      [req.params.quotationId]
    );

    const { rows: activity } = await pool.query(`
      SELECT al.*, u.name AS actor_name, cu.company_name AS actor_company
      FROM quotation_activity_log al
      LEFT JOIN users u ON u.id=al.actor_user_id
      LEFT JOIN customers cu ON cu.id=al.actor_customer_id
      WHERE al.quotation_id=$1 ORDER BY al.created_at
    `, [req.params.quotationId]);

    const { rows: lines } = await pool.query(`
      SELECT ql.*, p.name AS product_name, c.name AS category_name,
             c.max_discount_pct AS category_ceiling, ct.max_discount_pct AS tier_ceiling
      FROM quotation_lines ql
      JOIN products p ON p.id=ql.product_id
      JOIN categories c ON c.id=p.category_id
      JOIN customers cu ON cu.id=$2
      JOIN customer_tiers ct ON ct.tier=cu.tier
      WHERE ql.quotation_id=$1
    `, [req.params.quotationId, q.customer_id]);

    res.json({ ...q, steps, activity, lines });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Approve a step ────────────────────────────────────────────────────────────
router.post('/steps/:stepId/approve', requireRole('sales_manager', 'finance', 'admin'), async (req, res) => {
  const { note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [step] } = await client.query('SELECT * FROM approval_steps WHERE id=$1', [req.params.stepId]);
    if (!step) return res.status(404).json({ error: 'Step not found' });

    await client.query("UPDATE approval_steps SET status='approved' WHERE id=$1", [step.id]);

    await client.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, approval_step_id, note)
       VALUES ($1,'approved',$2,$3,$4)`,
      [step.quotation_id, req.user.id, step.id, note]
    );

    // Check if all pending steps for this quotation are now done
    const { rows: pending } = await client.query(
      "SELECT id FROM approval_steps WHERE quotation_id=$1 AND status='pending'",
      [step.quotation_id]
    );

    if (pending.length === 0) {
      await client.query(
        "UPDATE quotations SET status='approved', approved_at=now() WHERE id=$1",
        [step.quotation_id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Approved' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Reject a step ─────────────────────────────────────────────────────────────
router.post('/steps/:stepId/reject', requireRole('sales_manager', 'finance', 'admin'), async (req, res) => {
  const { note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [step] } = await client.query('SELECT * FROM approval_steps WHERE id=$1', [req.params.stepId]);
    if (!step) return res.status(404).json({ error: 'Step not found' });

    await client.query("UPDATE approval_steps SET status='rejected' WHERE id=$1", [step.id]);
    await client.query("UPDATE quotations SET status='rejected' WHERE id=$1", [step.quotation_id]);

    await client.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, approval_step_id, note)
       VALUES ($1,'rejected',$2,$3,$4)`,
      [step.quotation_id, req.user.id, step.id, note]
    );

    await client.query('COMMIT');
    res.json({ message: 'Rejected' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Return for revision ───────────────────────────────────────────────────────
router.post('/steps/:stepId/return', requireRole('sales_manager', 'finance', 'admin'), async (req, res) => {
  const { note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [step] } = await client.query('SELECT * FROM approval_steps WHERE id=$1', [req.params.stepId]);
    if (!step) return res.status(404).json({ error: 'Step not found' });

    await client.query("UPDATE approval_steps SET status='returned' WHERE id=$1", [step.id]);
    await client.query("UPDATE quotations SET status='draft' WHERE id=$1", [step.quotation_id]);

    await client.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, approval_step_id, note)
       VALUES ($1,'returned_for_revision',$2,$3,$4)`,
      [step.quotation_id, req.user.id, step.id, note]
    );

    await client.query('COMMIT');
    res.json({ message: 'Returned for revision' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Resolve Negotiation (Phase 9) ─────────────────────────────────────────────
router.post('/negotiations/:negotiationId/resolve', requireRole('sales_rep', 'sales_manager', 'admin'), async (req, res) => {
  const { accept_counter_discount } = req.body; // true/false
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [neg] } = await client.query('SELECT * FROM negotiation_requests WHERE id=$1', [req.params.negotiationId]);
    if (!neg) return res.status(404).json({ error: 'Not found' });

    if (accept_counter_discount && neg.counter_discount_pct !== null && neg.quotation_line_id) {
      await client.query(
        'UPDATE quotation_lines SET discount_pct=$1 WHERE id=$2',
        [neg.counter_discount_pct, neg.quotation_line_id]
      );
    }

    await client.query(
      "UPDATE negotiation_requests SET status='resolved', resolved_at=now() WHERE id=$1",
      [neg.id]
    );

    await client.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, negotiation_request_id, note)
       VALUES ($1,'negotiation_resolved',$2,$3,$4)`,
      [neg.quotation_id, req.user.id, neg.id, accept_counter_discount ? 'Counter-discount accepted' : 'Negotiation resolved without discount change']
    );

    await client.query('COMMIT');

    // Re-run governance after commit so evaluateRisk sees the updated discount_pct on quotation_lines
    const govResult = await reEvaluateAfterNegotiation(neg.quotation_id, req.user.id);

    const { rows: [updatedQuote] } = await pool.query('SELECT * FROM quotations WHERE id=$1', [neg.quotation_id]);

    res.json({ message: 'Resolved', quotation: updatedQuote, governance: govResult });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
