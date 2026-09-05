# DealFlow360 — Schema Recheck (v2)

Rechecked against the six flows you named. Net result: **21 tables again, but three were
wrong** — one genuine gap (no real audit trail existed, just a hope that things were
"computable"), two artifacts of premature splitting that duplicated the same facts in two
places. Fixed both directions.

---

## What was wrong in v1

### 1. Gap: no real audit trail (found while validating "audit")
v1 assumed approval history could be reconstructed from `approval_steps` alone. It can't.
The mockup's Approval Detail activity feed shows **Submitted → Returned → Resubmitted**
as three rows from the *same* approval stage (Sales Manager) — that's a back-and-forth
inside one step, not three steps. A 2-row `approval_steps` table cannot hold that without
either losing history on reset or awkwardly minting a new "step" for every retry.

**Fix:** added `quotation_activity_log` — one append-only row per action (submitted,
approved, rejected, returned_for_revision, resubmitted, escalated, nudge_sent,
negotiation_submitted, negotiation_resolved, confirmed), with actor, timestamp, and note.
This is the literal requirement text: *"All approvals, rejections, and edits must be
logged with user, timestamp, and reason."* It also directly satisfies deal-health's
escalate/nudge actions (B9), which had nowhere to persist before.

Once this log exists, `approval_steps.decision_reason / acted_by / acted_at` became a
**second copy of the same facts**. Trimmed `approval_steps` down to what it's actually
for — current stage + status + assignment, i.e. routing state, not history. The "who
approved, when, why" detail is sourced once, from the log.

### 2. Duplicate columns removed (found while validating "hybrid billing" and "fulfillment")
- `invoices.invoice_type` — fully derivable from `subscription_id IS NULL`. Storing both
  risks the two disagreeing. Dropped the column.
- `quotations.fulfillment_status` — this is current physical reality (is it split, is it
  backordered), always safely re-derivable from `fulfillment_lines` vs `quotation_lines`
  quantities. Unlike `risk_level` (which must freeze what was true *at approval time* for
  audit correctness even if ceilings change later), fulfillment state has no such
  freezing requirement — recomputing it can never be wrong. Dropped the column.
- `payments` + `credit_notes` — both are just financial transactions against an invoice or
  subscription, differing only in direction and reason. Merged into one
  `payment_transactions` table with a `type` column, instead of two tables holding
  near-identical shapes.

### 3. Genuine missing column (found while validating "deal health")
"Delivery promise slippage indicators" cannot be computed from anything in v1 — there was
no promised delivery date stored anywhere to compare actuals against. Added
`quotations.promised_delivery_date`, set at confirmation. Without it, that dashboard tile
is not persistable, let alone demonstrable.

### Confirmed as correctly excluded (re-verified, not changed)
- No stored blended risk *score* — only the resulting `risk_level` category, which is
  what routing and the UI actually use.
- No discount-ceiling snapshot on lines — ceilings rarely change and there's no
  requirement for point-in-time ceiling history; computed live from
  `categories`/`customer_tiers` at query time.
- No stalled-deal threshold-days table — no admin screen configures it; it's an
  application constant, not a persisted business entity.
- No multi-currency columns — explicitly called a bonus, not a requirement, in the spec.
- No `quantity_on_hand` on `products` — stock only ever means something per warehouse.

---

## Final Table List (21)

| Table | Role |
|---|---|
| `users` | Internal accounts |
| `customer_tiers` | Per-tier discount ceiling (admin-configurable) |
| `customers` | Portal accounts |
| `categories` | Per-category discount ceiling (admin-configurable) |
| `subscription_plans` | Reusable recurring plan + proration/cancel/refund rules |
| `products` | Catalog |
| `product_variant_values` | Attribute/value/extra-price rows |
| `price_lists` | Per-tier price adjustment |
| `warehouses` | Warehouse master + shipping weight |
| `warehouse_stock` | Stock + replenishment rule per product per warehouse |
| `upsell_rules` | Product pairing + promo + margin threshold |
| `approval_rules` | Risk level → required approver(s) |
| `quotations` | The single negotiable document (quote→order header) |
| `quotation_lines` | Line items |
| `approval_steps` | Current approval stage state (routing only, no history) |
| `quotation_activity_log` | **New.** Append-only audit trail of every logged action |
| `negotiation_requests` | Customer portal change/counter-discount requests |
| `subscriptions` | Live recurring billing instance |
| `fulfillment_lines` | Warehouse split result per line |
| `invoices` | One-time and recurring invoices |
| `payment_transactions` | **Merged.** Payments and credit notes as one transaction type |

## Six-Flow Validation

1. **Quotation → approval → fulfillment → billing → payment**: `quotations` →
   `approval_steps`(+log) → `fulfillment_lines` → `invoices` → `payment_transactions`.
   Every hop has a FK back to `quotations`/`quotation_lines`; nothing skips a table.
2. **Negotiation → reapproval**: `negotiation_requests` resolved → app updates
   `quotation_lines.discount_pct` → re-evaluates risk → appends new `approval_steps`
   rows (new `step_order`) → both actions logged in `quotation_activity_log` referencing
   the `negotiation_request_id`.
3. **Hybrid one-time + recurring billing**: one lump `invoices` row per confirmed
   quotation for its one-time lines (`subscription_id NULL`); each `subscriptions` row
   generates its own periodic `invoices` rows (`subscription_id` set). Confirmed against
   the mockup's own numbers (INV-1042 = sum of one-time lines, INV-1043 = one
   subscription's cycle amount).
4. **Audit**: `quotation_activity_log` for every submit/approve/reject/return/resubmit/
   escalate/nudge/negotiate/confirm, each with actor + timestamp + note.
5. **Deal health**: stalled (query `quotations.updated_at` + `status`), discount anomaly
   (query rep's historical `quotation_lines.discount_pct` average), delivery slippage
   (`quotations.promised_delivery_date` vs actual fulfillment completion) — all either
   computed or now have the one column they were missing.
