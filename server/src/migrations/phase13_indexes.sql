-- ============================================================================
-- DealFlow360 -- Phase 13 performance indexes
-- Apply: psql $DATABASE_URL -f server/src/migrations/phase13_indexes.sql
-- Safe to run on an existing database -- all statements are idempotent.
-- ============================================================================

-- A1-a: approval_steps -- composite index for "my pending approvals" queue.
--       Manager / finance dashboards filter by (assigned_to_user_id, status)
--       simultaneously; a full-table scan at 500+ quotations x ~2 steps each
--       becomes an index seek.
CREATE INDEX IF NOT EXISTS idx_approval_steps_assigned
  ON approval_steps(assigned_to_user_id, status);

-- A1-b: subscriptions -- replace the single-column next_bill_date index with
--       a composite (status, next_bill_date) so billing-schedule queries that
--       filter status='active' can use the index for both predicates.
DROP INDEX IF EXISTS idx_subscriptions_next_bill_date;
CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_due
  ON subscriptions(status, next_bill_date);

-- A1-c: quotations -- add created_at index for the Admin Reporting period
--       filter (from/to date range).  The existing idx_quotations_updated_at
--       serves stalled-deal detection only; created_at was unindexed.
CREATE INDEX IF NOT EXISTS idx_quotations_created_at
  ON quotations(created_at);

-- A1-d: negotiation_requests -- partial index covering only open requests.
--       Rep and portal views that filter status='open' across all quotations
--       can skip resolved rows entirely, keeping the index tiny.
CREATE INDEX IF NOT EXISTS idx_negotiation_open
  ON negotiation_requests(status) WHERE status = 'open';
