// src/services/billing.js
// Phase 7 — Hybrid Billing: one-time + recurring invoices

const pool = require('../db');

/**
 * Create invoices when a quotation is confirmed.
 * - Non-subscription lines → one combined invoice (subscription_id = NULL)
 * - Subscription lines → one subscription row + first invoice (subscription_id set)
 *
 * @param {number} quotationId
 * @param {number} customerId
 */
async function createInvoices(quotationId, customerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all lines with product subscription plan info
    const { rows: lines } = await client.query(
      `SELECT ql.*, p.subscription_plan_id, p.name AS product_name,
              sp.billing_cycle,
              (ql.unit_price * (1 - ql.discount_pct / 100.0) * ql.quantity) AS line_total
       FROM quotation_lines ql
       JOIN products p ON p.id = ql.product_id
       LEFT JOIN subscription_plans sp ON sp.id = p.subscription_plan_id
       WHERE ql.quotation_id = $1`,
      [quotationId]
    );

    const oneTimeLines = lines.filter(l => !l.subscription_plan_id);
    const subscriptionLines = lines.filter(l => l.subscription_plan_id);

    // ── One-time invoice ────────────────────────────────────────────────────
    if (oneTimeLines.length > 0) {
      const total = oneTimeLines.reduce((sum, l) => sum + parseFloat(l.line_total), 0);
      const invNum = `INV-${Date.now()}-OT`;
      await client.query(
        `INSERT INTO invoices (invoice_number, quotation_id, customer_id, subscription_id, amount, status, due_date)
         VALUES ($1,$2,$3,NULL,$4,'unpaid', NOW() + INTERVAL '30 days')`,
        [invNum, quotationId, customerId, total.toFixed(2)]
      );
    }

    // ── Subscription invoices ───────────────────────────────────────────────
    for (const line of subscriptionLines) {
      // Determine next_bill_date from billing_cycle
      let interval = '1 month';
      if (line.billing_cycle === 'quarterly') interval = '3 months';
      else if (line.billing_cycle === 'yearly') interval = '1 year';

      // Create subscription row
      const { rows: subRows } = await client.query(
        `INSERT INTO subscriptions (quotation_line_id, customer_id, status, next_bill_date)
         VALUES ($1,$2,'active', (NOW() + INTERVAL '${interval}')::date)
         RETURNING id, next_bill_date`,
        [line.id, customerId]
      );
      const sub = subRows[0];

      // Create first invoice for this subscription
      const invNum = `INV-${Date.now()}-SUB-${sub.id}`;
      await client.query(
        `INSERT INTO invoices (invoice_number, quotation_id, customer_id, subscription_id, amount, status, due_date)
         VALUES ($1,$2,$3,$4,$5,'unpaid', $6)`,
        [invNum, quotationId, customerId, sub.id, parseFloat(line.line_total).toFixed(2), sub.next_bill_date]
      );
    }

    await client.query('COMMIT');
    return { success: true, oneTimeLines: oneTimeLines.length, subscriptionLines: subscriptionLines.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createInvoices };
