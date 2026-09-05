-- ============================================================================
-- DealFlow360 — PostgreSQL Schema (v2, rechecked)
-- ============================================================================

CREATE TYPE user_role              AS ENUM ('sales_rep', 'sales_manager', 'finance', 'admin');
CREATE TYPE product_status         AS ENUM ('active', 'archived');
CREATE TYPE billing_cycle          AS ENUM ('monthly', 'quarterly', 'yearly');
CREATE TYPE adjustment_type        AS ENUM ('none', 'percentage');
CREATE TYPE risk_level             AS ENUM ('low', 'medium', 'high');
CREATE TYPE quotation_status       AS ENUM ('draft', 'pending_approval', 'approved', 'under_negotiation', 'confirmed', 'rejected');
CREATE TYPE approver_role          AS ENUM ('sales_manager', 'finance');
CREATE TYPE approval_status        AS ENUM ('pending', 'approved', 'rejected', 'returned');
CREATE TYPE negotiation_status     AS ENUM ('open', 'resolved');
CREATE TYPE subscription_status    AS ENUM ('active', 'paused', 'cancelled');
CREATE TYPE invoice_status         AS ENUM ('unpaid', 'partially_paid', 'paid');
CREATE TYPE transaction_type       AS ENUM ('payment', 'credit_note');
CREATE TYPE activity_action        AS ENUM (
    'submitted', 'approved', 'rejected', 'returned_for_revision', 'resubmitted',
    'escalated', 'nudge_sent', 'negotiation_submitted', 'negotiation_resolved', 'confirmed'
);

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- customer_tiers
-- ----------------------------------------------------------------------------
CREATE TABLE customer_tiers (
    tier                VARCHAR(30) PRIMARY KEY,
    max_discount_pct    NUMERIC(5,2) NOT NULL CHECK (max_discount_pct BETWEEN 0 AND 100)
);

-- ----------------------------------------------------------------------------
-- customers
-- ----------------------------------------------------------------------------
CREATE TABLE customers (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_name    VARCHAR(200) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT,                          -- nullable: portal also supports magic-link auth
    tier            VARCHAR(30) NOT NULL REFERENCES customer_tiers(tier),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_tier ON customers(tier);

-- ----------------------------------------------------------------------------
-- categories
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                VARCHAR(100) NOT NULL UNIQUE,
    max_discount_pct    NUMERIC(5,2) NOT NULL CHECK (max_discount_pct BETWEEN 0 AND 100)
);

-- ----------------------------------------------------------------------------
-- subscription_plans
-- ----------------------------------------------------------------------------
CREATE TABLE subscription_plans (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                VARCHAR(120) NOT NULL,
    billing_cycle       billing_cycle NOT NULL,
    proration_rule      TEXT DEFAULT 'prorated' CHECK (proration_rule IN ('prorated', 'full_charge', 'no_proration')),
    cancellation_rule   TEXT DEFAULT 'end_of_cycle' CHECK (cancellation_rule IN ('immediate', 'end_of_cycle')),
    refund_rule         TEXT DEFAULT 'none' CHECK (refund_rule IN ('full', 'prorated', 'none'))
);

-- ----------------------------------------------------------------------------
-- products
-- ----------------------------------------------------------------------------
CREATE TABLE products (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                    VARCHAR(200) NOT NULL,
    category_id             BIGINT NOT NULL REFERENCES categories(id),
    unit                    VARCHAR(30) NOT NULL DEFAULT 'Each',
    price                   NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    cost_price              NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
    tax_pct                 NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_pct BETWEEN 0 AND 100),
    description             TEXT,
    subscription_plan_id    BIGINT REFERENCES subscription_plans(id), -- non-null => recurring product
    status                  product_status NOT NULL DEFAULT 'active',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_subscription_plan ON products(subscription_plan_id);

-- ----------------------------------------------------------------------------
-- product_variant_values
-- ----------------------------------------------------------------------------
CREATE TABLE product_variant_values (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute_name  VARCHAR(60) NOT NULL,
    value           VARCHAR(60) NOT NULL,
    extra_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE (product_id, attribute_name, value)
);

-- ----------------------------------------------------------------------------
-- price_lists
-- ----------------------------------------------------------------------------
CREATE TABLE price_lists (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tier                VARCHAR(30) NOT NULL UNIQUE REFERENCES customer_tiers(tier),
    adjustment_type     adjustment_type NOT NULL DEFAULT 'none',
    adjustment_value    NUMERIC(5,2) NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- warehouses
-- ----------------------------------------------------------------------------
CREATE TABLE warehouses (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                VARCHAR(120) NOT NULL UNIQUE,
    ship_cost_weight    NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (ship_cost_weight > 0)
);

-- ----------------------------------------------------------------------------
-- warehouse_stock
-- ----------------------------------------------------------------------------
CREATE TABLE warehouse_stock (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id        BIGINT NOT NULL REFERENCES warehouses(id),
    product_id          BIGINT NOT NULL REFERENCES products(id),
    quantity_on_hand    INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    reorder_threshold   INTEGER CHECK (reorder_threshold >= 0),
    reorder_quantity    INTEGER CHECK (reorder_quantity >= 0),
    UNIQUE (warehouse_id, product_id)
);
CREATE INDEX idx_warehouse_stock_product ON warehouse_stock(product_id);

-- ----------------------------------------------------------------------------
-- upsell_rules
-- ----------------------------------------------------------------------------
CREATE TABLE upsell_rules (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    primary_product_id      BIGINT NOT NULL REFERENCES products(id),
    suggested_product_id    BIGINT NOT NULL REFERENCES products(id),
    is_promoted             BOOLEAN NOT NULL DEFAULT false,
    min_margin_pct          NUMERIC(5,2) CHECK (min_margin_pct BETWEEN 0 AND 100),
    UNIQUE (primary_product_id, suggested_product_id),
    CHECK (primary_product_id <> suggested_product_id)
);
CREATE INDEX idx_upsell_rules_primary ON upsell_rules(primary_product_id);

-- ----------------------------------------------------------------------------
-- approval_rules
-- ----------------------------------------------------------------------------
CREATE TABLE approval_rules (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    risk_level                  risk_level NOT NULL UNIQUE,
    requires_manager_approval   BOOLEAN NOT NULL DEFAULT true,
    requires_finance_approval   BOOLEAN NOT NULL DEFAULT false
);

-- ----------------------------------------------------------------------------
-- quotations — the single negotiable document (quote -> order lifecycle)
-- ----------------------------------------------------------------------------
CREATE TABLE quotations (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quote_number            VARCHAR(30) NOT NULL UNIQUE,
    customer_id             BIGINT NOT NULL REFERENCES customers(id),
    sales_rep_id            BIGINT NOT NULL REFERENCES users(id),
    price_list_id           BIGINT REFERENCES price_lists(id),
    status                  quotation_status NOT NULL DEFAULT 'draft',
    risk_level              risk_level,               -- snapshot as of last approval submission (audit-frozen)
    promised_delivery_date  DATE,                      -- set at confirmation; compared to actuals for slippage
    submitted_at            TIMESTAMPTZ,
    approved_at             TIMESTAMPTZ,
    confirmed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotations_status ON quotations(status);
CREATE INDEX idx_quotations_rep ON quotations(sales_rep_id);
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE INDEX idx_quotations_updated_at ON quotations(updated_at); -- stalled-deal dashboard query

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quotations_updated_at
    BEFORE UPDATE ON quotations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- quotation_lines
-- ----------------------------------------------------------------------------
CREATE TABLE quotation_lines (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quotation_id                BIGINT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    product_id                  BIGINT NOT NULL REFERENCES products(id),
    product_variant_value_id    BIGINT REFERENCES product_variant_values(id),
    quantity                    INTEGER NOT NULL CHECK (quantity > 0),
    unit_price                  NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0), -- snapshot at add-time
    discount_pct                NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotation_lines_quotation ON quotation_lines(quotation_id);
CREATE INDEX idx_quotation_lines_product ON quotation_lines(product_id);

-- ----------------------------------------------------------------------------
-- approval_steps — CURRENT approval stage state only (routing), not history.
-- History of who/when/why lives in quotation_activity_log.
-- ----------------------------------------------------------------------------
CREATE TABLE approval_steps (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quotation_id        BIGINT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    step_order          SMALLINT NOT NULL,
    approver_role       approver_role NOT NULL,
    status              approval_status NOT NULL DEFAULT 'pending',
    assigned_to_user_id BIGINT REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (quotation_id, step_order)
);
CREATE INDEX idx_approval_steps_quotation ON approval_steps(quotation_id);

-- ----------------------------------------------------------------------------
-- negotiation_requests — customer portal requests (B8)
-- ----------------------------------------------------------------------------
CREATE TABLE negotiation_requests (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quotation_id            BIGINT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    quotation_line_id       BIGINT REFERENCES quotation_lines(id),
    customer_comment        TEXT NOT NULL,
    counter_discount_pct    NUMERIC(5,2) CHECK (counter_discount_pct BETWEEN 0 AND 100),
    requested_delivery_date DATE,
    status                  negotiation_status NOT NULL DEFAULT 'open',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at             TIMESTAMPTZ
);
CREATE INDEX idx_negotiation_requests_quotation ON negotiation_requests(quotation_id);

-- ----------------------------------------------------------------------------
-- quotation_activity_log — append-only audit trail. Covers approvals,
-- rejections, edits/resubmissions, escalations, nudges, negotiation events,
-- and confirmation — each with actor, timestamp, and note.
-- ----------------------------------------------------------------------------
CREATE TABLE quotation_activity_log (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quotation_id            BIGINT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    action                  activity_action NOT NULL,
    actor_user_id           BIGINT REFERENCES users(id),      -- internal actor (rep/manager/finance)
    actor_customer_id       BIGINT REFERENCES customers(id),  -- portal actor (customer), if applicable
    approval_step_id        BIGINT REFERENCES approval_steps(id),       -- set for approval-related actions
    negotiation_request_id  BIGINT REFERENCES negotiation_requests(id), -- set for negotiation-related actions
    note                    TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (NOT (actor_user_id IS NOT NULL AND actor_customer_id IS NOT NULL))
);
CREATE INDEX idx_activity_log_quotation ON quotation_activity_log(quotation_id, created_at);
CREATE INDEX idx_activity_log_approval_step ON quotation_activity_log(approval_step_id);

-- ----------------------------------------------------------------------------
-- subscriptions — live recurring billing instance
-- ----------------------------------------------------------------------------
CREATE TABLE subscriptions (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quotation_line_id   BIGINT NOT NULL UNIQUE REFERENCES quotation_lines(id),
    customer_id         BIGINT NOT NULL REFERENCES customers(id),
    status              subscription_status NOT NULL DEFAULT 'active',
    next_bill_date      DATE NOT NULL,
    quantity_override   INTEGER CHECK (quantity_override > 0), -- overrides quotation_lines.quantity for billing after mid-cycle change
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at        TIMESTAMPTZ
);
CREATE INDEX idx_subscriptions_next_bill_date ON subscriptions(next_bill_date);
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);

-- ----------------------------------------------------------------------------
-- fulfillment_lines — warehouse split result per line (B6)
-- ----------------------------------------------------------------------------
CREATE TABLE fulfillment_lines (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quotation_line_id   BIGINT NOT NULL REFERENCES quotation_lines(id) ON DELETE CASCADE,
    warehouse_id        BIGINT NOT NULL REFERENCES warehouses(id),
    quantity_fulfilled  INTEGER NOT NULL CHECK (quantity_fulfilled > 0),
    is_backorder        BOOLEAN NOT NULL DEFAULT false,
    estimated_cost      NUMERIC(12,2),
    shipped_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fulfillment_lines_quotation_line ON fulfillment_lines(quotation_line_id);
CREATE INDEX idx_fulfillment_lines_warehouse ON fulfillment_lines(warehouse_id);
-- Fulfillment status ("split pending" / "backordered" / "fulfilled") is intentionally
-- NOT a stored column — derive it from SUM(quantity_fulfilled) vs quotation_lines.quantity
-- and is_backorder flags. It is current physical reality, always safely re-derivable,
-- unlike quotations.risk_level which must freeze what was true at approval time.

-- ----------------------------------------------------------------------------
-- invoices — invoice type dropped: derivable from subscription_id IS NULL
-- ----------------------------------------------------------------------------
CREATE TABLE invoices (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_number      VARCHAR(30) NOT NULL UNIQUE,
    quotation_id        BIGINT NOT NULL REFERENCES quotations(id),
    customer_id         BIGINT NOT NULL REFERENCES customers(id),
    subscription_id     BIGINT REFERENCES subscriptions(id), -- NULL = one-time invoice, set = recurring
    amount              NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    status              invoice_status NOT NULL DEFAULT 'unpaid',
    due_date            DATE,
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_invoices_quotation ON invoices(quotation_id);

-- ----------------------------------------------------------------------------
-- payment_transactions — merged payments + credit_notes (same shape, differ
-- only by type and target). A "record a payment" action inserts type='payment';
-- an automatic mid-cycle refund trigger inserts type='credit_note'.
-- ----------------------------------------------------------------------------
CREATE TABLE payment_transactions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type            transaction_type NOT NULL,
    invoice_id      BIGINT REFERENCES invoices(id),
    subscription_id BIGINT REFERENCES subscriptions(id),
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason          TEXT,                          -- used for credit_note; typically null for payment
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (type = 'payment' AND (invoice_id IS NOT NULL OR subscription_id IS NOT NULL)) OR
        (type = 'credit_note' AND (subscription_id IS NOT NULL OR invoice_id IS NOT NULL))
    )
);
CREATE INDEX idx_payment_transactions_invoice ON payment_transactions(invoice_id);
CREATE INDEX idx_payment_transactions_subscription ON payment_transactions(subscription_id);

-- ============================================================================
-- Seed the fixed configuration rows implied by the mockups (admin can edit later)
-- ============================================================================
INSERT INTO customer_tiers (tier, max_discount_pct) VALUES
    ('Bronze', 5), ('Silver', 10), ('Gold', 15);

INSERT INTO approval_rules (risk_level, requires_manager_approval, requires_finance_approval) VALUES
    ('low', false, false),
    ('medium', true, false),
    ('high', true, true);

-- ----------------------------------------------------------------------------
-- platform_settings — admin-configurable key/value system settings (Gap 4)
-- ----------------------------------------------------------------------------
CREATE TABLE platform_settings (
    key     VARCHAR(100) PRIMARY KEY,
    value   TEXT NOT NULL,
    label   VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default seed values
INSERT INTO platform_settings (key, value, label) VALUES
    ('stalled_deal_days', '7', 'Days before a deal is considered stalled');

-- ============================================================================
-- Phase 13 — Performance indexes (A1)
-- Applied via server/src/migrations/phase13_indexes.sql for existing DBs.
-- Included here so fresh installs get them automatically.
-- ============================================================================

-- approval_steps: composite for "my pending approvals" queue
CREATE INDEX IF NOT EXISTS idx_approval_steps_assigned
  ON approval_steps(assigned_to_user_id, status);

-- subscriptions: composite replaces single-column next_bill_date
DROP INDEX IF EXISTS idx_subscriptions_next_bill_date;
CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_due
  ON subscriptions(status, next_bill_date);

-- quotations: created_at for period reporting (from/to filter)
CREATE INDEX IF NOT EXISTS idx_quotations_created_at
  ON quotations(created_at);

-- negotiation_requests: partial index — only 'open' requests
CREATE INDEX IF NOT EXISTS idx_negotiation_open
  ON negotiation_requests(status) WHERE status = 'open';
