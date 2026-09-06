# Customer Portal — Invoice & Payment Status (Missing Piece)

## The gap

Billing already works correctly on the backend — `invoices` and `payment_transactions`
tables exist, `POST /billing/invoices/:id/pay` records partial payments, and
`status` (`unpaid` / `partially_paid` / `paid`) is computed correctly. But that whole
`invoices` route in `server/src/routes/billing.js` is locked to internal roles:

```js
router.use(['/subscriptions', '/invoices'], authenticate, requireRole('sales_rep', 'sales_manager', 'finance', 'admin'));
```

The customer portal (`server/src/routes/portal.js` + `client/src/pages/Portal.jsx`) never
queries `invoices` at all. So once a quotation is confirmed and billed, the customer sees
the quote lines and status badge — but nothing about what's invoiced, what they've paid,
or what's still owed. That's the bug: paid / partially paid / unpaid is invisible on the
customer side.

Fix is two parts: (1) have the portal's quotation-detail endpoint also return that
quotation's invoices + payment history, scoped to the logged-in customer, and (2) render
that in `Portal.jsx`.

---

## Fix 1 — Backend: `server/src/routes/portal.js`

Find the existing handler:

```js
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
```

Replace the final two lines (the `negotiations` query and `res.json`) with:

```js
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
```

That's the only backend change needed. `status` on each invoice row already comes
straight from the `invoices` table (`unpaid` / `partially_paid` / `paid`), kept correct by
the existing `POST /billing/invoices/:id/pay` handler — nothing to duplicate there.

---

## Fix 2 — Frontend: `client/src/pages/Portal.jsx`

Add a badge-class helper next to the existing `StatusBadge` at the top of the file:

```js
function invoiceBadgeClass(status) {
  if (status === 'paid') return 'badge-approved';
  if (status === 'partially_paid') return 'badge-pending';
  return 'badge-rejected'; // unpaid
}
```

(This mirrors exactly how `InvoiceDetail.jsx` and `InvoicesList.jsx` already color invoice
statuses on the internal side — same three classes, same meaning, so it looks consistent
across the app.)

Then, in the JSX, insert a new card **right after the Line Items card and before the
Negotiation form** — i.e. right after this block:

```jsx
              {/* Lines */}
              <div className="card">
                <h3 className="font-semibold mb-4">Line Items</h3>
                <div className="table-wrap">
                  <table className="table">
                    ...
                  </table>
                </div>
              </div>
```

Insert:

```jsx
              {/* Invoices & Payments */}
              {selected.invoices?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold mb-4">Invoices & Payments</h3>
                  <div className="space-y-4">
                    {selected.invoices.map(inv => (
                      <div key={inv.id} className="card-sm">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-mono text-xs text-indigo-400">{inv.invoice_number}</p>
                            {inv.due_date && <p className="text-xs text-slate-500 mt-1">Due: {inv.due_date}</p>}
                          </div>
                          <span className={`badge ${invoiceBadgeClass(inv.status)}`}>
                            {inv.status?.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-slate-500">Invoice Amount</p>
                            <p className="font-semibold">₹{parseFloat(inv.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Paid</p>
                            <p className="font-semibold text-emerald-400">₹{parseFloat(inv.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Remaining</p>
                            <p className={`font-semibold ${inv.balance_remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              ₹{parseFloat(inv.balance_remaining).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                        </div>
                        {inv.transactions?.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
                            {inv.transactions.map(t => (
                              <div key={t.id} className="flex justify-between text-xs text-slate-500">
                                <span>{new Date(t.created_at).toLocaleDateString()}</span>
                                <span className="text-emerald-400 font-mono">+₹{parseFloat(t.amount).toLocaleString('en-IN')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
```

No new CSS is needed — `badge-approved`, `badge-pending`, `badge-rejected`, and `.card-sm`
already exist in `client/src/index.css`.

Note there is no "Record Payment" control here — that stays finance/admin-only in
`InvoiceDetail.jsx`. The portal is read-only: the customer sees status, amount, paid, and
remaining, nothing they can edit.

---

## Why this location, not a new page

The gap you found is specifically "customer confirms a quote, gets billed, and then can't
tell what they still owe." That lives inside the quotation they're already looking at, so
it's shown inline on the same detail view instead of a separate invoices tab/page — one
less click, and it never shows up for quotes that haven't been billed yet
(`selected.invoices?.length > 0` guards that automatically, since invoices only get
created when `POST /portal/quotations/:id/confirm` runs `createInvoices`).

If you later want a customer-wide "all my invoices across every quote" view, that's a
separate `GET /portal/invoices` list endpoint + a new page — bigger scope, not needed to
close this specific gap.

---

## Verify it works

1. Log in as a customer whose quotation has been confirmed (billing already ran).
2. Open that quotation in the portal → **Invoices & Payments** card should appear showing
   invoice number, amount, ₹0 paid, full amount as remaining, status `unpaid`.
3. As finance/admin, record a partial payment via `POST /billing/invoices/:id/pay`
   (or the internal Invoice Detail screen).
4. Reload the customer portal quotation → paid amount and remaining should update, badge
   should switch to `partially paid`, and the payment should appear in the transaction
   list with its date.
5. Pay the remaining balance → status flips to `paid`, remaining shows ₹0 in green.
6. Open a quotation that has **not** been confirmed/billed yet → confirm the card does not
   render at all (no empty "Invoices & Payments" section).
7. Log in as a *different* customer and try loading the first customer's quotation id
   directly → should still 404 (existing `WHERE q.customer_id=$2` check), confirming the
   new invoice query can't leak another customer's billing data either.
