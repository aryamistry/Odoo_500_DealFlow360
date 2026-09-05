# DealFlow360 — PRD & Phased Build Plan

**Source of truth:** DealFlow360 requirements doc + Excalidraw mockups + `dealflow360_schema_v2.sql`
**Stack:** PostgreSQL, Express (Node.js), React (PERN)
**Build strategy:** vertical slices — each phase ships a demoable piece of the Quick Test
Flow (§9 of the requirements), not a horizontal layer (e.g. "all models" then "all APIs").

---

## Audit Note (repo `Odoo_500_DealFlow360-main` checked against this PRD)

The submitted repo's own `implementation_plan.md` claims **100% complete, 33/33 tests
passed**. Code review found that claim is **not accurate** — most of Phases 0–8 are
genuinely solid and match this PRD's design closely (governance risk engine, fulfillment
split/override/consolidate, hybrid invoice split, and payment recompute are all correctly
implemented), but four real problems were found by reading the actual route/service code,
not just the summary docs:

| # | Phase | File | Problem | Impact |
|---|---|---|---|---|
| 1 | 1 | *(missing entirely)* | No `POST /customers` / `admin/customers` route or UI anywhere. `QuotationsList.jsx` populates its customer picker by scraping unique `customer_id`/`customer_name` pairs out of **existing quotations** (commented in the code itself as `// Simple hack: get customers via quotations context`) | You are limited to the 3 seeded customers forever — cannot onboard a new company or move one to a different tier |
| 2 | 9 | `server/src/routes/approvals.js` (`/negotiations/:id/resolve`) | When a negotiation is resolved and governance finds no reapproval is needed (`stepsCreated === 0`), the code never moves `quotations.status` back to `'approved'` — it stays `'under_negotiation'` | The customer's `/confirm` endpoint requires `status='approved'`, so **any negotiation that doesn't breach a threshold permanently blocks the deal** — the customer can never confirm |
| 3 | 7 | `server/src/routes/billing.js` (`PATCH /subscriptions/:id`) | Inserts `payment_transactions (type='credit_note', amount=0, ...)` whenever a reschedule includes a `reason` | Violates the schema's own `CHECK (amount > 0)` — this call **throws and rolls back**, so rescheduling a subscription with a reason always fails |
| 4 | 6 → 10 | `server/src/services/fulfillment.js` + `analytics.js` | `fulfillment_lines.shipped_at` is read in 3 places (including the Delivery Slippage query) but **written nowhere** in the entire codebase — no "mark shipped" action exists | The Delivery Slippage tile on the Deal Health dashboard is dead code: it always returns zero rows, regardless of real lateness |

Phase statuses below are corrected from the repo's own claims to reflect what was
actually verified in code. **Phase 12** below is the concrete, prioritized fix list —
that's the efficient next step, not new feature work.

---


## 0. Goal

Ship a working quotation-to-cash engine where every rule in the requirements
(discount governance, warehouse splitting, hybrid billing, negotiation, deal health) is
enforced in application logic against the v2 schema — not hardcoded for the demo.

**Definition of done for the whole project:** the 8-step Quick Test Flow (§9) runs
start to finish without manual data patching, plus the two live demo flows required in
Deliverables (§8).

---

## Phase 0 — Foundation

**Status:** ✅ Done, verified

**Goal:** empty app boots, schema is live, seed data exists.

- Init repo: `/server` (Express + pg), `/client` (React)
- Run `dealflow360_schema_v2.sql` against Postgres
- Seed script: 1 admin, 1 sales rep, 1 sales manager, 1 finance user; 2 warehouses;
  3 categories with ceilings (Hardware 15%, Services 10%, Subscriptions 10%); a handful
  of products (incl. one subscription-linked product); one customer per tier (Bronze,
  Silver, Gold) — just enough to exercise every tier immediately; Phase 1 adds the
  ability to create more
- `customer_tiers` and `approval_rules` already seeded by the schema itself

**Exit criteria:** `SELECT` against every table returns seed rows; server + client run locally.

---

## Phase 1 — Auth & Roles & Customer Management

**Status:** ⚠️ Auth done; Customer Management NOT built (see Audit Note #1)

**Tables:** `users`, `customers`

- Internal login/signup (email + password) → issue session/JWT with `role`
- Customer portal login (email + password; magic-link is a stretch goal, not blocking)
- Route guards: internal routes require `users.role`; portal routes require a customer session
- **Customer management (internal side):** the requirements never show a dedicated
  "Customers" screen, but a rep/admin must be able to create one before a quotation can
  exist for them (Screen 4's Quotation Detail has a Customer field, and the mockups
  reference multiple named customers — Acme Corp, Beta Industries, Nova Retail, Zenith
  Co, Delta LLC — across different tiers, not just the one seeded Bronze account). Build:
  - `GET /customers` — list, with tier and company name
  - `POST /customers` — create (company name, email, tier)
  - `PATCH /customers/:id` — edit tier / company name
  - Surface this as a small "Customers" list in the admin/rep area, and as an inline
    "+ New Customer" option from the quotation builder's customer picker (Phase 3), so a
    rep isn't blocked mid-quote waiting on an admin screen
- Screens: Login/Signup (Screen 1); Customer list/create is not in the mockup set but is
  required to make every other screen's customer references demonstrable

**Exit criteria:** a rep, a manager, a finance user, and a customer can each log in and
land on the correct home screen (Sales Dashboard vs Customer Portal); a rep can create a
new customer in any tier and immediately build a quotation for them — not limited to the
3 seeded accounts.

---

## Phase 2 — Backend Configuration (Admin)

**Status:** ✅ Done, verified — all 8 tabs present

**Tables:** `categories`, `customer_tiers`, `warehouses`, `warehouse_stock`,
`subscription_plans`, `products`, `product_variant_values`, `price_lists`, `upsell_rules`,
`approval_rules`

Build admin CRUD screens in this order (each is independent, no cross-dependencies except
products depending on categories + subscription_plans):

1. Categories + discount ceilings (Screen 19, left panel)
2. Customer tiers + discount ceilings (Screen 19, left panel) — edit only, rows pre-seeded
3. Approval rules (Screen 19, right panel: risk level → manager/finance required) — edit only
4. Warehouses + stock + reorder rules (implied by A4; no dedicated mockup screen, build a
   simple table CRUD)
5. Subscription plans (billing cycle + proration/cancellation/refund text rules)
6. Products + variants (Screens 16–17), linking to category and optionally a subscription plan
7. Price lists per tier (Screen 17 context) — one row per tier, adjustment type/value
8. Upsell rules (product pairing + promoted flag + min margin) — no dedicated screen shown;
   build a simple table CRUD under Products

**Exit criteria:** every "Quick Test Flow" setup bullet is possible from the UI — "set up
basic backend data: a discount tier[ceiling], a warehouse, and a subscription plan."

---

## Phase 3 — Quotation Builder (core, no governance yet)

**Status:** ✅ Done, verified

**Tables:** `quotations`, `quotation_lines`

- Create quotation: pick an existing customer (from Phase 1's customer list) or create a
  new one inline, then assign rep, resolve `price_list_id` from that customer's tier
- Add/remove/edit lines: product, variant, quantity, discount%
- Compute price per line: `product.price [+ variant.extra_price] × price_list adjustment`
- Live order total + margin indicator: `SUM((unit_price×(1-discount%) - cost_price) × qty)`
- Save Draft / Submit for Approval (status transitions `draft → pending_approval`, or
  straight to `approved`/`confirmed` path if no governance rule fires — wired in Phase 5)
- Screens: Sales Dashboard (2), Quotations List (3), Quotation Detail/Builder (4)

**Exit criteria:** a rep can build a multi-line quote, see live totals and margin, save it,
and see it in the Quotations list by status.

---

## Phase 4 — Upsell & Cross-Sell Panel

**Status:** ✅ Done, verified

**Tables:** `upsell_rules` (read), `quotation_lines` (write)

- While building a quote, look up `upsell_rules` for products already in the cart
  (`primary_product_id` = cart product), filter by `min_margin_pct`
- Show suggestion list with margin delta and promo tag; Add to Quote / Dismiss
- Adding a suggestion inserts a `quotation_lines` row and recomputes totals immediately
- Screen: Quotation Detail upsell panel (Screen 4, B5)

**Exit criteria:** Quick Test Flow step 4 — accept a suggestion, totals/margin update
immediately.

---

## Phase 5 — Discount Governance & Approval Workflow

**Status:** ✅ Done, verified — matches this PRD's algorithm closely

**Tables:** `categories`, `customer_tiers`, `approval_rules`, `approval_steps`,
`quotation_activity_log`, `quotations` (`risk_level`, `submitted_at`, `approved_at`)

This is the core business-logic phase. Implement as a single backend service invoked on
submit and on every negotiation resolution:

1. **Per-line check:** for each `quotation_lines` row, compare `discount_pct` against
   `MIN(category.max_discount_pct, customer_tiers.max_discount_pct)` for that line's category.
2. **Blended risk score:** sum the "points over limit" across all lines (0 over → `low`;
   any single/blended breach past a defined threshold → `medium`; a larger breach →
   `high`). Store the result in `quotations.risk_level` (frozen snapshot).
3. **Route:** look up `approval_rules` for that `risk_level` → create `approval_steps` rows
   (`sales_manager` always if required; `finance` appended if required) with `step_order`
   1, 2. If neither is required, skip straight to `approved`.
4. **Log:** insert a `quotation_activity_log` row (`action = 'submitted'`, actor = rep).
5. **Approve/Reject/Return:** manager/finance UI updates the relevant `approval_steps.status`
   and logs `approved` / `rejected` / `returned_for_revision` with reason. On `returned`,
   rep can edit lines and resubmit — insert a new `approval_steps` row (next `step_order`,
   same role) and log `resubmitted`.
6. On all required steps `approved`: set `quotations.status = 'approved'`,
   `approved_at = now()`.

- Screens: Approval Detail (6, B4), Approvals List (5)

**Exit criteria:** Quick Test Flow steps 2–3 — a line discount above its own category limit
auto-routes to manager approval without the rep requesting it, and the activity feed shows
Submitted/Returned/Resubmitted correctly.

---

## Phase 6 — Fulfillment & Warehouse Split

**Status:** ⚠️ Split/override/consolidate done; `shipped_at` never written (see Audit Note #4)

**Tables:** `warehouse_stock`, `fulfillment_lines`, `quotation_lines`

- On `quotations.status = 'approved'` (or immediately if no approval was needed), run the
  split algorithm per line: pick warehouse(s) with available stock, minimizing shipment
  count using `warehouses.ship_cost_weight`; write one `fulfillment_lines` row per
  warehouse used, decrement `warehouse_stock.quantity_on_hand`
- If stock is insufficient anywhere: mark the shortfall row `is_backorder = true`
- Manual Override: let ops rewrite the split (delete/re-insert `fulfillment_lines` for
  that quotation line)
- "Consolidate Remaining Backorder": when a backordered warehouse's stock is replenished,
  insert a new `fulfillment_lines` row covering the remainder, `is_backorder = false`
- Fulfillment status shown to the user is **computed**, not stored — derive from
  `SUM(fulfillment_lines.quantity_fulfilled)` vs `quotation_lines.quantity` and any
  `is_backorder = true` rows
- Screens: Fulfillment List (7), Fulfillment Detail (8)

**Exit criteria:** Quick Test Flow step 5 — stock pulled from the correct warehouse,
splitting across two warehouses when one alone can't cover it.

---

## Phase 7 — Hybrid Billing (One-Time + Recurring)

**Status:** ⚠️ Invoice split done; mid-cycle reschedule-with-reason crashes (see Audit Note #3)

**Tables:** `subscriptions`, `invoices`

- On `quotations.status = 'confirmed'`:
  - For all non-subscription lines: create **one** `invoices` row
    (`subscription_id = NULL`, `amount = SUM` of those lines after discount)
  - For each line whose product has a `subscription_plan_id`: create a `subscriptions`
    row (`next_bill_date` = today + plan's cycle), then create its first `invoices` row
    (`subscription_id` set)
- Billing schedule display: list upcoming `subscriptions.next_bill_date` per customer
- Mid-cycle quantity/plan change: update the `subscriptions` row and — per the linked
  `subscription_plans.proration_rule` — insert a `payment_transactions` row
  (`type='credit_note'`) if the change reduces the amount owed
- Cancel: `subscriptions.status = 'cancelled'`, `cancelled_at = now()`; if within a
  refundable window per `subscription_plans.cancellation_rule`, insert a
  `payment_transactions` credit_note row
- Screens: Subscriptions List (9), Billing Detail (10)

**Exit criteria:** Quick Test Flow step 6 — a one-time product and a recurring
subscription on the same order are billed correctly and separately (mirrors the
INV-1042/INV-1043 split in the mockup).

---

## Phase 8 — Payments

**Status:** ✅ Done, verified

**Tables:** `payment_transactions`, `invoices`

- "Record a payment": insert `payment_transactions` (`type='payment'`)
- On insert, recompute `invoices.status`: `paid` if `SUM(payments) >= amount`,
  `partially_paid` if `0 < SUM(payments) < amount`, else `unpaid`
- Screens: Invoices List (12), Invoice Detail (13)

**Exit criteria:** Quick Test Flow step 8 — recording a payment updates invoice status
correctly.

---

## Phase 9 — Customer Portal Negotiation & Reapproval

**Status:** ❌ Negotiation submit works; resolve path has a status bug that blocks confirmation (see Audit Note #2)

**Tables:** `negotiation_requests`, `quotation_activity_log`, back into Phase 5's
governance service

- Customer views quotation (read-only line list + status)
- Submit Request: insert `negotiation_requests` (comment, optional counter-discount,
  optional delivery date), log `negotiation_submitted`
- Rep/manager resolves the request: if a counter-discount is accepted, update the
  relevant `quotation_lines.discount_pct`, mark `negotiation_requests.status='resolved'`,
  `resolved_at`, log `negotiation_resolved`
- **Reapproval trigger:** immediately after resolving, re-run the Phase 5 governance
  check. If the new terms exceed thresholds, create new `approval_steps` and flip
  `quotations.status` back to `pending_approval` — automatically, not by rep action
- Confirm Quotation: if no reapproval was triggered, `quotations.status = 'confirmed'`,
  `confirmed_at = now()`, set `promised_delivery_date`, kick off Phase 6/7
- Screens: Customer Portal Negotiation (11)

**Exit criteria:** Quick Test Flow step 7 — a bigger discount requested in the portal
sends the quote back for approval automatically.

---

## Phase 10 — Deal Health & Reporting

**Status:** ⚠️ Stalled + anomaly queries correct; Delivery Slippage is dead code (depends on Phase 6 gap)

**Tables:** all of the above, read-only aggregate queries — **no new tables**

- Stalled deals: `status NOT IN ('confirmed','rejected') AND updated_at < now() - interval '<N> days'`
  (`<N>` is an app config constant, not a DB row)
- Discount anomaly: `quotation_lines.discount_pct` on a rep's active quotes vs that rep's
  historical average (`AVG(discount_pct)` over their past `confirmed` quotations)
- Delivery slippage: `quotations.promised_delivery_date` vs actual fulfillment completion
  (latest `fulfillment_lines.shipped_at` for that quotation)
- Escalate / Nudge Rep buttons: insert `quotation_activity_log` rows (`escalated` /
  `nudge_sent`)
- Reporting filters (Period, Sales Team/Rep, Approval Status, Product/Category): plain
  `WHERE`/`GROUP BY` queries over `quotations`, `quotation_lines`, `approval_steps`
- Export PDF/XLS: generate from the same query results
- Screens: Deal Health Dashboard (14), Admin Reporting (15)

**Exit criteria:** clicking an alert opens the right quotation; Escalate/Nudge visibly
logs an activity row; reporting filters return correct filtered counts.

---

## Phase 11 — Demo & Deliverables

**Status:** ⚠️ Seed/accounts ready; the 2 required demo flows will hit Audit Note #1 and #2 live

- One-page architecture diagram (entities + module boundaries — can be generated
  directly from the v2 schema's table list)
- 5-minute live demo script covering **two full flows end-to-end**:
  1. Quotation → auto-approval routing → manager approval → fulfillment split → hybrid
     invoice → payment
  2. Customer portal negotiation → automatic reapproval → confirm → fulfillment/billing
- "What we'd build next" note (multi-currency, magic-link auth, automated replenishment
  triggers, etc. — everything intentionally deferred per the schema design doc)

**Exit criteria:** all 8 Quick Test Flow steps pass live, back to back, on seed data.

---

## Phase 12 — Stabilization & Gap Closure (the actual next step)

Not new feature work — closing the four gaps found in the Audit Note, in priority order.
Each is small and independently shippable.

### 12.1 Customer Management (was silently missing since Phase 1)
- `server/src/routes/admin/customers.js` (new): `GET /`, `POST /` (company_name, email,
  tier, password_hash), `PATCH /:id` (edit tier/company name) — same pattern as the
  existing 8 admin routers
- Mount at `app.use('/api/admin/customers', require('./routes/admin/customers'))`
- Add a 9th `AdminSettings.jsx` tab, **or** simpler: add a real `GET /admin/customers`
  call + "+ New Customer" inline option to `QuotationsList.jsx`'s create-quote modal,
  replacing the `// Simple hack` comment and its scrape-from-quotations logic entirely
- **Verify:** a brand-new company can be created in any tier and immediately used to
  build a quotation, without any prior quotation existing for it

### 12.2 Fix negotiation-resolve status bug (blocks every no-reapproval negotiation)
- In `approvals.js`'s `/negotiations/:negotiationId/resolve`, after
  `reEvaluateAfterNegotiation` returns, add the missing branch:
  if `stepsCreated === 0`, `UPDATE quotations SET status='approved' WHERE id=$1`
  (mirrors what `submitForApproval` does on first submission)
- **Verify:** submit a negotiation with a counter-discount inside the ceiling → resolve
  it → confirm the quotation status is `'approved'` → customer's `/confirm` succeeds

### 12.3 Fix credit-note CHECK violation on subscription reschedule
- In `billing.js`'s `PATCH /subscriptions/:id`, either drop the `payment_transactions`
  insert when there's no actual amount adjustment (a reschedule alone isn't a financial
  transaction — just log it via `quotation_activity_log` instead, referencing the
  subscription's originating quotation), or require and insert a real non-zero `amount`
  only when the caller explicitly requests a credit
- **Verify:** `PATCH /subscriptions/:id` with `{ next_bill_date, reason }` returns 200,
  not a rolled-back 500

### 12.4 Make Delivery Slippage real
- Add `POST /api/fulfillment/:quotationId/ship` (or a per-`fulfillment_line` variant):
  `UPDATE fulfillment_lines SET shipped_at=now() WHERE id=$1 AND is_backorder=false`
- Add a "Mark Shipped" button to `FulfillmentDetail.jsx` next to each non-backorder line
- **Verify:** mark a line shipped after its `promised_delivery_date` has passed →
  it appears in `GET /deal-health/delivery-slippage`

**Exit criteria for Phase 12:** re-run the two demo flows from Phase 11 end-to-end,
including a negotiation that does *not* breach ceilings, a subscription reschedule with
a reason, and a shipment marked complete — all four should now work without error.

---


| Phase | New tables touched |
|---|---|
| 0 | *(all, via seed)* |
| 1 | `users`, `customers` (auth + full CRUD, not just login) |
| 2 | `categories`, `customer_tiers`, `warehouses`, `warehouse_stock`, `subscription_plans`, `products`, `product_variant_values`, `price_lists`, `upsell_rules`, `approval_rules` |
| 3 | `quotations`, `quotation_lines` |
| 4 | `upsell_rules` (read) |
| 5 | `approval_steps`, `quotation_activity_log` |
| 6 | `fulfillment_lines` |
| 7 | `subscriptions`, `invoices` |
| 8 | `payment_transactions` |
| 9 | `negotiation_requests` |
| 10 | *(read-only, no new tables)* |
| 11 | *(no new tables)* |

Every table in `dealflow360_schema_v2.sql` is claimed by exactly one phase above — nothing
in the schema is unused by the plan, and nothing in the plan needs a table the schema
doesn't have.
