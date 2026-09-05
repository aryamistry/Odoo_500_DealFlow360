// src/routes/billing.js
// Phase 7 & 8 — Subscriptions, Invoices, Payments

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { createInvoices } = require('../services/billing');
const { getPaginationParams, sendPaginated } = require('../utils/paginate');

const router = express.Router();
router.use(authenticate);

// ══ Subscriptions ════════════════════════════════════════════════════════════

router.get('/subscriptions', async (req, res) => {
  try {
    const { page, limit, offset, isPaginated } = getPaginationParams(req);
    const limitClause  = isPaginated ? `LIMIT ${limit}` : '';
    const offsetClause = isPaginated ? `OFFSET ${offset}` : '';

    const { rows } = await pool.query(`
      SELECT s.*, c.company_name AS customer_name,
             p.name AS product_name, sp.billing_cycle, sp.name AS plan_name,
             COUNT(*) OVER() AS total_count
      FROM subscriptions s
      JOIN customers c ON c.id=s.customer_id
      JOIN quotation_lines ql ON ql.id=s.quotation_line_id
      JOIN products p ON p.id=ql.product_id
      LEFT JOIN subscription_plans sp ON sp.id=p.subscription_plan_id
      ORDER BY s.next_bill_date
      ${limitClause} ${offsetClause}
    `);
    const total = parseInt(rows[0]?.total_count ?? rows.length, 10);
    const clean = rows.map(({ total_count, ...r }) => r);
    sendPaginated(res, clean, { page, limit, total, isPaginated });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});


router.get('/subscriptions/:id', async (req, res) => {
  try {
    const { rows: [sub] } = await pool.query(`
      SELECT s.*, c.company_name AS customer_name,
             p.name AS product_name, sp.billing_cycle, sp.name AS plan_name,
             sp.proration_rule, sp.cancellation_rule, sp.refund_rule
      FROM subscriptions s
      JOIN customers c ON c.id=s.customer_id
      JOIN quotation_lines ql ON ql.id=s.quotation_line_id
      JOIN products p ON p.id=ql.product_id
      LEFT JOIN subscription_plans sp ON sp.id=p.subscription_plan_id
      WHERE s.id=$1
    `, [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Not found' });

    const { rows: invoices } = await pool.query(
      'SELECT * FROM invoices WHERE subscription_id=$1 ORDER BY issued_at DESC',
      [req.params.id]
    );
    res.json({ ...sub, invoices });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// Mid-cycle subscription modification
router.patch('/subscriptions/:id', requireRole('admin', 'finance', 'sales_manager'), async (req, res) => {
  const { next_bill_date, quantity_override, reason } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [sub] } = await client.query('SELECT * FROM subscriptions WHERE id=$1', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Not found' });
    if (sub.status === 'cancelled') return res.status(400).json({ error: 'Cannot modify a cancelled subscription' });

    const updates = [];
    const params = [];
    let i = 1;
    if (next_bill_date) { updates.push(`next_bill_date=$${i++}`); params.push(next_bill_date); }
    if (updates.length === 0) return res.status(400).json({ error: 'Provide next_bill_date to update' });
    params.push(req.params.id);
    await client.query(`UPDATE subscriptions SET ${updates.join(',')} WHERE id=$${i}`, params);

    // Bug 2 fix: Do NOT insert a payment_transaction with amount=0 — schema enforces amount > 0.
    // A reschedule with a reason is informational only. No financial record is created unless
    // a real non-zero credit_amount is explicitly specified by the caller.
    if (req.body.credit_amount && parseFloat(req.body.credit_amount) > 0) {
      await client.query(
        `INSERT INTO payment_transactions (type, subscription_id, amount, reason)
         VALUES ('credit_note', $1, $2, $3)`,
        [req.params.id, parseFloat(req.body.credit_amount), reason || 'Subscription reschedule credit']
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Subscription updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Cancel subscription

router.post('/subscriptions/:id/cancel', requireRole('admin', 'finance', 'sales_manager'), async (req, res) => {
  const { reason } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [sub] } = await client.query('SELECT * FROM subscriptions WHERE id=$1', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Not found' });

    await client.query(
      "UPDATE subscriptions SET status='cancelled', cancelled_at=now() WHERE id=$1",
      [req.params.id]
    );

    // Insert credit note if applicable (per cancellation_rule — simplified: always create if reason given)
    if (reason) {
      const { rows: [lastInvoice] } = await client.query(
        'SELECT * FROM invoices WHERE subscription_id=$1 ORDER BY issued_at DESC LIMIT 1',
        [req.params.id]
      );
      if (lastInvoice) {
        await client.query(
          `INSERT INTO payment_transactions (type, subscription_id, amount, reason)
           VALUES ('credit_note',$1,$2,$3)`,
          [req.params.id, lastInvoice.amount, reason]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Cancelled' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ══ Invoices ═════════════════════════════════════════════════════════════════

router.get('/invoices', async (req, res) => {
  try {
    const { status, customer_id } = req.query;
    const { page, limit, offset, isPaginated } = getPaginationParams(req);

    let where = [];
    let params = [];
    let i = 1;
    if (status) { where.push(`i.status=$${i++}::invoice_status`); params.push(status); }
    if (customer_id) { where.push(`i.customer_id=$${i++}`); params.push(customer_id); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const limitClause  = isPaginated ? `LIMIT $${i++}`  : '';
    const offsetClause = isPaginated ? `OFFSET $${i++}` : '';
    if (isPaginated) { params.push(limit); params.push(offset); }

    const { rows } = await pool.query(`
      SELECT i.*, c.company_name AS customer_name, q.quote_number,
             COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt WHERE pt.invoice_id=i.id AND pt.type='payment'),0) AS paid_amount,
             COUNT(*) OVER() AS total_count
      FROM invoices i
      JOIN customers c ON c.id=i.customer_id
      JOIN quotations q ON q.id=i.quotation_id
      ${whereClause}
      ORDER BY i.issued_at DESC
      ${limitClause} ${offsetClause}
    `, params);

    const total = parseInt(rows[0]?.total_count ?? rows.length, 10);
    const clean = rows.map(({ total_count, ...r }) => r);
    sendPaginated(res, clean, { page, limit, total, isPaginated });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});


router.get('/invoices/:id', async (req, res) => {
  try {
    const { rows: [inv] } = await pool.query(`
      SELECT i.*, c.company_name AS customer_name, q.quote_number
      FROM invoices i
      JOIN customers c ON c.id=i.customer_id
      JOIN quotations q ON q.id=i.quotation_id
      WHERE i.id=$1
    `, [req.params.id]);
    if (!inv) return res.status(404).json({ error: 'Not found' });

    const { rows: transactions } = await pool.query(
      'SELECT * FROM payment_transactions WHERE invoice_id=$1 ORDER BY created_at DESC',
      [req.params.id]
    );
    const paidAmount = transactions.filter(t => t.type === 'payment').reduce((s, t) => s + parseFloat(t.amount), 0);

    res.json({ ...inv, transactions, paid_amount: paidAmount });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// Record payment (Phase 8)
router.post('/invoices/:id/pay', requireRole('finance', 'admin'), async (req, res) => {
  const { amount } = req.body;
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Positive amount required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [inv] } = await client.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    await client.query(
      "INSERT INTO payment_transactions (type, invoice_id, amount) VALUES ('payment',$1,$2)",
      [inv.id, amount]
    );

    // Recompute invoice status
    const { rows: [{ total_paid }] } = await client.query(
      "SELECT COALESCE(SUM(amount),0) AS total_paid FROM payment_transactions WHERE invoice_id=$1 AND type='payment'",
      [inv.id]
    );

    let newStatus;
    if (parseFloat(total_paid) >= parseFloat(inv.amount)) newStatus = 'paid';
    else if (parseFloat(total_paid) > 0) newStatus = 'partially_paid';
    else newStatus = 'unpaid';

    await client.query('UPDATE invoices SET status=$1 WHERE id=$2', [newStatus, inv.id]);
    await client.query('COMMIT');

    res.json({ message: 'Payment recorded', status: newStatus, total_paid });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ══ Trigger Billing (called after quotation confirmed) ════════════════════════

router.post('/trigger/:quotationId', requireRole('admin', 'sales_manager', 'finance'), async (req, res) => {
  try {
    const { rows: [q] } = await pool.query('SELECT customer_id FROM quotations WHERE id=$1', [req.params.quotationId]);
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    const result = await createInvoices(parseInt(req.params.quotationId), q.customer_id);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
