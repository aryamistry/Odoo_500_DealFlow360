# DealFlow360 — Phase 13: Performance & Scalability Plan

**Status of prior work:** Phases 0–12 functionally complete and verified (see
`dealflow360_prd.md`). This phase does not add features — it makes the existing
behavior hold up at **500–1,000 seeded rows per table**, which is the target load.

**Method:** every item below was found by reading the actual route/service code and
schema, the same way Phase 12's bugs were found — not generic best-practice advice.
Each item names the exact file and the exact fix.

---

## A. Database — real gaps found

### A1. Missing indexes for access patterns the app actually uses

The v2 schema indexed what Phases 0–11 were designed around. Four query patterns exist
in the shipped code that the schema doesn't have an index for:

| Table | Missing index | Used by |
|---|---|---|
| `approval_steps` | `(assigned_to_user_id, status)` | Manager/finance "my pending approvals" queue — currently a full-table scan filtered by role at 500+ quotations × ~2 steps each |
| `subscriptions` | `(status, next_bill_date)` composite (currently only `next_bill_date` alone) | Billing schedule queries filter both; the single-column index can't serve the `status='active'` half |
| `quotations` | `(created_at)` | The Period reporting filter (Admin Reporting screen) has no index to use — only `updated_at` is indexed, which serves stalled-deal detection, not date-range reporting |
| `negotiation_requests` | `(status)` partial index `WHERE status='open'` | Rep/portal views filtering open requests across all quotations |

```sql
CREATE INDEX idx_approval_steps_assigned ON approval_steps(assigned_to_user_id, status);
DROP INDEX IF EXISTS idx_subscriptions_next_bill_date;
CREATE INDEX idx_subscriptions_billing_due ON subscriptions(status, next_bill_date);
CREATE INDEX idx_quotations_created_at ON quotations(created_at);
CREATE INDEX idx_negotiation_open ON negotiation_requests(status) WHERE status = 'open';
```

### A2. Dead CTE + redundant correlated subquery in `analytics.js` (discount anomalies)

`server/src/routes/analytics.js`, `/deal-health/discount-anomalies`: the query defines a
`rep_avg` CTE using a window function (`AVG(...) OVER (PARTITION BY sales_rep_id)`) —
correct and efficient — but **never references it**. The actual average used in the
final `SELECT`/`WHERE` comes from a separate `LEFT JOIN LATERAL` that re-scans
`quotation_lines JOIN quotations` **once per active line**, recomputing the same
per-rep average the CTE already computed once for the whole rep.

At 500–1,000 confirmed quotations, this is the single most expensive query in the app:
O(active_lines × that rep's historical line count) instead of one aggregation pass.

**Fix — replace the LATERAL join with a join against the already-computed CTE:**

```sql
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
ORDER BY anomaly_delta DESC;
```

Same result, one aggregation pass over confirmed history instead of one per active line.

### A3. `GET /quotations` — two correlated subqueries per row, no LIMIT

`server/src/routes/quotations.js`, list endpoint: for every quotation row it runs a
`SUM(...)` subquery and a `COUNT(*)` subquery against `quotation_lines`. Both are
index-backed (`idx_quotation_lines_quotation` already covers them) so each one is cheap
— the real problem is there's no `LIMIT`/`OFFSET`, so at 500–1,000 quotations this
endpoint returns every row, every time, fully computed, on every page load. See B1.

### A4. Connection pool has no explicit sizing or statement timeout

`server/src/db.js`: `new Pool({ connectionString })` — no `max`, no
`statement_timeout`. Fine at hackathon-demo concurrency; not fine once reports/analytics
run concurrently with normal traffic at seeded scale. Add:

```js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  statement_timeout: 10000, // fail loud instead of hanging a connection
});
```

---

## B. API — pagination (currently absent everywhere)

Confirmed by code: **no endpoint in the app accepts or applies `limit`/`offset`** —
`quotations`, `customers`, `products`, `invoices`, and `quotation_activity_log` all
return their full result set unconditionally.

### B1. Add cursor-free `limit`/`offset` pagination to the four list endpoints that will
actually hit 500–1,000 rows:

- `GET /quotations` — paginate; keep the two subqueries but add `LIMIT $n OFFSET $m`
  and a separate lightweight `GET /quotations/count` (same `WHERE`, `SELECT COUNT(*)`)
  for the client's page indicator
- `GET /admin/customers` — same pattern
- `GET /invoices` — same pattern
- `GET /quotations/:id/activity` (the activity log) — this one grows unbounded per
  quotation over its lifetime; paginate or cap at the most recent 50 with a "load
  earlier" action

Response shape for all four:
```json
{ "data": [...], "total": 742, "limit": 25, "offset": 0 }
```

Tables that stay unpaginated on purpose (small, config-sized, not user-generated at
volume): `categories`, `customer_tiers`, `approval_rules`, `warehouses`,
`subscription_plans`, `price_lists`, `upsell_rules` — none of these will ever hit
hundreds of rows per the requirements, so paginating them is unnecessary work.

---

## C. Caching — reference/config data re-fetched on every render

`categories`, `customer_tiers`, `approval_rules`, `price_lists`, `subscription_plans`,
and `warehouses` change rarely (admin-edited) but are re-fetched from scratch by every
`AdminSettings.jsx` tab switch, and independently by `Customers.jsx` (tiers) and the
Quotation Builder (categories, price lists, products) every time those pages mount.

- **Client:** move these six read-mostly resources onto a shared fetch-once cache
  (React Query/SWR with a 5-minute `staleTime`, or a simple context-level cache) instead
  of a fresh `api.get()` in every component's `useEffect`. This doesn't change any
  logic — same endpoints, same data — it just stops re-requesting data that hasn't
  changed.
- **Server:** no server-side cache needed for these — they're small (≤ a few dozen rows
  each per the requirements) and the DB already answers them in well under a millisecond
  with existing PKs. The cost being cut is round-trip count on the client, not query cost.

---

## D. Client rendering — unpaginated `.map()` over full result sets

`QuotationsList.jsx`, `Customers.jsx`, and `WarehousesTab`'s stock tables all render
every row returned by their `GET` call directly into a `<table>` via `.map()`, with no
windowing. Once B1's pagination lands, this is solved for free (25–50 rows per page
instead of 500–1,000 in the DOM at once) — no separate virtualization library needed at
this scale. Only wire the client's page controls to B1's `limit`/`offset` params.

---

## E. What was checked and found already fine (no change needed)

- `fulfillment.js`'s split algorithm and `warehouse_stock` lookups — already scoped by
  the existing `(warehouse_id, product_id)` unique index and `idx_warehouse_stock_product`
- `quotation_lines`, `fulfillment_lines`, `invoices`, `payment_transactions` — all FK
  columns used in joins are already indexed per the v2 schema
- `approvals.js`'s approve/reject flow — single-row lookups by PK, no scaling concern
- Governance risk calculation (Phase 5) — operates on one quotation's lines at a time,
  bounded and small regardless of total table size

---

## F. Verification Checklist (exit criteria for Phase 13)

1. Seed 500–1,000 rows into: `customers`, `products`, `quotations` (with realistic
   `quotation_lines` per quote), `invoices`, `payment_transactions`,
   `quotation_activity_log`
2. Run `EXPLAIN ANALYZE` on the four queries in A1/A2/A3 before and after — confirm
   index scans replace sequential scans, and the anomaly query's total cost drops
3. Confirm `GET /quotations`, `/admin/customers`, `/invoices` return `{ data, total,
   limit, offset }` and the client's list pages page correctly (25/page default)
4. Confirm `AdminSettings.jsx` tab-switching and `Customers.jsx` no longer re-fetch
   categories/tiers/rules/warehouses/plans/price-lists on every mount once C is wired
5. Load a Quotations/Customers list page with the full seeded volume and confirm the
   page — not just the API — responds without a perceptible stall
