// src/routes/billing.js
// Phase 7 & 8 — Subscriptions, Invoices, Payments

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { createInvoices } = require('../services/billing');
const { getPaginationParams, sendPaginated } = require('../utils/paginate');

const router = express.Router();
router.use(['/subscriptions', '/invoices'], authenticate, requireRole('sales_rep', 'sales_manager', 'finance', 'admin'));

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

// Helper: calculate days remaining and cycle fraction
function cycleDaysRemaining(nextBillDate, billingCycle) {
  const now = new Date();
  const nextBill = new Date(nextBillDate);
  let cycleDays = 30; // default monthly
  if (billingCycle === 'quarterly') cycleDays = 90;
  else if (billingCycle === 'yearly') cycleDays = 365;
  const daysRemaining = Math.max(0, Math.round((nextBill - now) / (1000 * 60 * 60 * 24)));
  const fraction = cycleDays > 0 ? daysRemaining / cycleDays : 0;
  return { daysRemaining, cycleDays, fraction };
}

// Mid-cycle subscription modification with proration
router.patch('/subscriptions/:id', requireRole('admin', 'finance', 'sales_manager'), async (req, res) => {
  const { next_bill_date, quantity_override, reason } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch subscription with plan details (proration_rule, unit_price)
    const { rows: [sub] } = await client.query(`
      SELECT s.*, ql.unit_price, ql.quantity AS original_quantity, ql.discount_pct,
             sp.billing_cycle, sp.proration_rule, sp.cancellation_rule, sp.refund_rule
      FROM subscriptions s
      JOIN quotation_lines ql ON ql.id = s.quotation_line_id
      JOIN products p ON p.id = ql.product_id
      LEFT JOIN subscription_plans sp ON sp.id = p.subscription_plan_id
      WHERE s.id=$1
    `, [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Not found' });
    if (sub.status === 'cancelled') return res.status(400).json({ error: 'Cannot modify a cancelled subscription' });

    const updates = [];
    const params = [];
    let i = 1;

    let prorationApplied = false;
    let proratedAmount = 0;
    const prorationRule = (sub.proration_rule || 'prorated').toLowerCase().trim();

    // ── Mid-cycle proration on quantity_override ───────────────────────────
    if (quantity_override !== undefined && quantity_override !== null) {
      const newQty = parseInt(quantity_override);
      if (isNaN(newQty) || newQty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'quantity_override must be a positive integer' });
      }
      const oldQty = parseInt(sub.quantity_override || sub.original_quantity) || 1;
      const unitPrice = parseFloat(sub.unit_price) || 0;
      const discountPct = parseFloat(sub.discount_pct) || 0;
      const effectiveUnitPrice = unitPrice * (1 - discountPct / 100);

      const { daysRemaining, cycleDays, fraction } = cycleDaysRemaining(sub.next_bill_date, sub.billing_cycle);
      const qtyDelta = newQty - oldQty;

      if (qtyDelta !== 0) {
        if (prorationRule === 'prorated') {
          proratedAmount = Math.abs(qtyDelta) * effectiveUnitPrice * fraction;
        } else if (prorationRule === 'full_charge') {
          proratedAmount = Math.abs(qtyDelta) * effectiveUnitPrice;
        } else if (prorationRule === 'no_proration') {
          proratedAmount = 0;
        }
      }

      if (proratedAmount > 0.005) {
        prorationApplied = true;
        const txType = qtyDelta > 0 ? 'payment' : 'credit_note';
        const txReason = reason ||
          `Mid-cycle ${qtyDelta > 0 ? 'upgrade' : 'downgrade'} (${prorationRule}): qty ${oldQty} → ${newQty} (${daysRemaining}/${cycleDays} days remaining)`;
        await client.query(
          `INSERT INTO payment_transactions (type, subscription_id, amount, reason)
           VALUES ($1, $2, $3, $4)`,
          [txType, req.params.id, proratedAmount.toFixed(2), txReason]
        );
      }

      // Store updated quantity on subscription row
      updates.push(`quantity_override=$${i++}`);
      params.push(newQty);
    }

    if (next_bill_date) {
      const today = new Date().toISOString().slice(0, 10);
      if (next_bill_date < today) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Next bill date cannot be in the past' });
      }
      updates.push(`next_bill_date=$${i++}`); params.push(next_bill_date);
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Provide next_bill_date or quantity_override to update' });
    }
    params.push(req.params.id);
    await client.query(`UPDATE subscriptions SET ${updates.join(',')} WHERE id=$${i}`, params);

    // Legacy explicit credit_amount (kept for backward compat)
    if (req.body.credit_amount && parseFloat(req.body.credit_amount) > 0 && quantity_override === undefined) {
      await client.query(
        `INSERT INTO payment_transactions (type, subscription_id, amount, reason)
         VALUES ('credit_note', $1, $2, $3)`,
        [req.params.id, parseFloat(req.body.credit_amount), reason || 'Subscription reschedule credit']
      );
    }

    await client.query('COMMIT');
    res.json({
      message: 'Subscription updated',
      proration_applied: prorationApplied,
      prorated_amount: parseFloat(proratedAmount.toFixed(2)),
      rule_used: prorationRule,
      proration: prorationApplied ? 'applied' : 'none'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Cancel subscription — auto-compute refund from refund_rule
router.post('/subscriptions/:id/cancel', requireRole('admin', 'finance', 'sales_manager'), async (req, res) => {
  const { reason } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch subscription with plan refund_rule and last invoice amount
    const { rows: [sub] } = await client.query(`
      SELECT s.*, sp.refund_rule, sp.cancellation_rule, sp.billing_cycle
      FROM subscriptions s
      JOIN quotation_lines ql ON ql.id = s.quotation_line_id
      JOIN products p ON p.id = ql.product_id
      LEFT JOIN subscription_plans sp ON sp.id = p.subscription_plan_id
      WHERE s.id=$1
    `, [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Not found' });
    if (sub.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });

    await client.query(
      "UPDATE subscriptions SET status='cancelled', cancelled_at=now() WHERE id=$1",
      [req.params.id]
    );

    // Auto-compute refund/credit from refund_rule
    const { rows: [lastInvoice] } = await client.query(
      'SELECT * FROM invoices WHERE subscription_id=$1 ORDER BY issued_at DESC LIMIT 1',
      [req.params.id]
    );

    const refundRule = (sub.refund_rule || 'none').toLowerCase().trim();
    let creditAmount = 0;
    let creditTxReason = null;

    if (lastInvoice) {
      const invoiceAmount = parseFloat(lastInvoice.amount) || 0;

      if (refundRule === 'full') {
        creditAmount = invoiceAmount;
      } else if (refundRule === 'prorated') {
        const { fraction } = cycleDaysRemaining(sub.next_bill_date, sub.billing_cycle);
        creditAmount = invoiceAmount * fraction;
      }
      // 'none' or unknown → creditAmount stays 0

      if (creditAmount > 0.01) {
        creditTxReason = reason || `Cancellation refund (${refundRule} rule)`;
        await client.query(
          `INSERT INTO payment_transactions (type, subscription_id, amount, reason)
           VALUES ('credit_note', $1, $2, $3)`,
          [req.params.id, creditAmount.toFixed(2), creditTxReason]
        );
      }
    }

    await client.query('COMMIT');
    res.json({
      message: 'Cancelled',
      refund_issued: creditAmount > 0.01,
      refund_amount: parseFloat(creditAmount.toFixed(2)),
      rule_used: refundRule,
      cancellation_rule: sub.cancellation_rule || 'end_of_cycle',
      credit_note: creditAmount > 0.01 ? { amount: creditAmount.toFixed(2), reason: creditTxReason } : null
    });
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
