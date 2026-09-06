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

    // Invoices for this quotation — filtered by customer_id so a customer can
    // never see another customer's billing data even if they guess a quotation id.
    const { rows: invoices } = await pool.query(`
      SELECT i.*,
        COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt
                  WHERE pt.invoice_id=i.id AND pt.type='payment'), 0) AS paid_amount
      FROM invoices i
      WHERE i.quotation_id=$1 AND i.customer_id=$2
      ORDER BY i.issued_at DESC
    `, [req.params.id, req.user.customerId]);

    const invoiceIds = invoices.map(i => i.id);
    let txByInvoice = {};
    if (invoiceIds.length) {
      const { rows: txs } = await pool.query(
        `SELECT * FROM payment_transactions WHERE invoice_id = ANY($1) AND type='payment' ORDER BY created_at DESC`,
        [invoiceIds]
      );
      txs.forEach(t => { (txByInvoice[t.invoice_id] ||= []).push(t); });
    }

    const invoicesWithBalance = invoices.map(inv => {
      const paid = parseFloat(inv.paid_amount);
      const total = parseFloat(inv.amount);
      return {
        ...inv,
        paid_amount: paid,
        balance_remaining: Math.max(0, total - paid),
        transactions: txByInvoice[inv.id] || [],
      };
    });

    res.json({ ...q, lines, negotiations, invoices: invoicesWithBalance });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Submit negotiation request ────────────────────────────────────────────────
router.post('/quotations/:id/negotiate', async (req, res) => {
  const { quotation_line_id, customer_comment, counter_discount_pct, requested_delivery_date } = req.body;
  if (!customer_comment) return res.status(400).json({ error: 'customer_comment required' });
  if (requested_delivery_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (requested_delivery_date < today) {
      return res.status(400).json({ error: 'Requested delivery date cannot be in the past' });
    }
  }

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
  if (promised_delivery_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (promised_delivery_date < today) {
      return res.status(400).json({ error: 'Promised delivery date cannot be in the past' });
    }
  }
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

// ── List customer's invoices ─────────────────────────────────────────────────
router.get('/invoices', async (req, res) => {
  try {
    const { page, limit, offset, isPaginated } = getPaginationParams(req);
    const limitClause  = isPaginated ? `LIMIT ${limit}`  : '';
    const offsetClause = isPaginated ? `OFFSET ${offset}` : '';

    const { rows } = await pool.query(`
      SELECT i.*, q.quote_number,
        COALESCE(
          (SELECT SUM(pt.amount) FROM payment_transactions pt WHERE pt.invoice_id=i.id AND pt.type='payment'), 0
        ) AS paid_amount,
        COUNT(*) OVER() AS total_count
      FROM invoices i
      LEFT JOIN quotations q ON q.id=i.quotation_id
      WHERE i.customer_id=$1
      ORDER BY i.issued_at DESC
      ${limitClause} ${offsetClause}
    `, [req.user.customerId]);

    const total = parseInt(rows[0]?.total_count ?? rows.length, 10);
    const invoiceIds = rows.map(i => i.id);
    let txByInvoice = {};
    if (invoiceIds.length) {
      const { rows: txs } = await pool.query(
        `SELECT * FROM payment_transactions WHERE invoice_id = ANY($1) AND type='payment' ORDER BY created_at DESC`,
        [invoiceIds]
      );
      txs.forEach(t => { (txByInvoice[t.invoice_id] ||= []).push(t); });
    }

    const clean = rows.map(({ total_count, ...inv }) => {
      const paid = parseFloat(inv.paid_amount);
      const totalAmt = parseFloat(inv.amount);
      return {
        ...inv,
        paid_amount: paid,
        balance_remaining: Math.max(0, totalAmt - paid),
        transactions: txByInvoice[inv.id] || [],
      };
    });

    sendPaginated(res, clean, { page, limit, total, isPaginated });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Pay an invoice (Customer Portal Online Payment) ───────────────────────────
router.post('/invoices/:id/pay', async (req, res) => {
  const { amount, payment_method, note } = req.body;
  const numAmount = parseFloat(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'A valid positive payment amount is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch invoice scoped to logged-in customer
    const { rows: [inv] } = await client.query(
      'SELECT * FROM invoices WHERE id=$1 AND customer_id=$2',
      [req.params.id, req.user.customerId]
    );
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (inv.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invoice is already fully paid' });
    }

    // Current total paid so far
    const { rows: [{ total_paid }] } = await client.query(
      "SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payment_transactions WHERE invoice_id=$1 AND type='payment'",
      [inv.id]
    );

    const paidSoFar = parseFloat(total_paid);
    const invoiceTotal = parseFloat(inv.amount);
    const balanceRemaining = Math.max(0, invoiceTotal - paidSoFar);

    if (numAmount > balanceRemaining + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Payment amount (₹${numAmount.toLocaleString('en-IN')}) cannot exceed the remaining balance of ₹${balanceRemaining.toLocaleString('en-IN')}`
      });
    }

    // Insert payment transaction
    const methodStr = payment_method ? ` via ${payment_method}` : '';
    const noteStr = note ? ` (${note})` : '';
    const reason = `Customer Portal Payment${methodStr}${noteStr}`;

    const { rows: [tx] } = await client.query(
      "INSERT INTO payment_transactions (type, invoice_id, amount, reason) VALUES ('payment', $1, $2, $3) RETURNING *",
      [inv.id, numAmount, reason]
    );

    const newTotalPaid = paidSoFar + numAmount;
    let newStatus;
    if (newTotalPaid >= invoiceTotal - 0.01) {
      newStatus = 'paid';
    } else {
      newStatus = 'partially_paid';
    }

    await client.query('UPDATE invoices SET status=$1 WHERE id=$2', [newStatus, inv.id]);

    await client.query('COMMIT');
    res.json({
      message: 'Payment recorded successfully',
      status: newStatus,
      total_paid: newTotalPaid,
      balance_remaining: Math.max(0, invoiceTotal - newTotalPaid),
      transaction: tx,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
