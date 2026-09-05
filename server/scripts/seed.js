// scripts/seed.js — Full seed for DealFlow360
//
// Run:            node scripts/seed.js
// Reset + reseed: node scripts/seed.js --reset
//
// Architecture: Node.js + Express + PostgreSQL + `pg` (NOT Prisma).
// Uses the existing pool from src/db and a single client/transaction for
// all generated relational data, so a failure rolls back cleanly.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

// ============================================================================
// Config — tune volumes here
// ============================================================================
const RESET = process.argv.includes('--reset');

const CONFIG = {
  NUM_CUSTOMERS: 150,
  NUM_SALES_MANAGERS_EXTRA: 3,   // + 1 original (manager@dealflow.com) = 4
  NUM_SALES_REPS_EXTRA: 11,      // + 1 original (rep@dealflow.com)     = 12
  NUM_FINANCE_EXTRA: 3,          // + 1 original (finance@dealflow.com) = 4
  NUM_QUOTATIONS: 280,
};

// ============================================================================
// Deterministic PRNG (mulberry32) — reruns without --reset regenerate the
// same values, which combined with ON CONFLICT DO NOTHING makes the script
// safely idempotent (no duplicate rows on a second run).
// ============================================================================
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260101);
const randInt = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const randFloat = (min, max, decimals = 2) => {
  const v = rnd() * (max - min) + min;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pickWeighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
};
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
const pad = (n, len) => String(n).padStart(len, '0');

// ============================================================================
// Name pools
// ============================================================================
const COMPANY_PREFIXES = ['Acme', 'Nova', 'BlueWave', 'Vertex', 'GlobalTech', 'Zenith', 'CloudCore',
  'NextGen', 'Quantum', 'Summit', 'Pioneer', 'Redwood', 'Silverline', 'Ironclad', 'Brightpath', 'Meridian',
  'Northstar', 'Crestview', 'Lighthouse', 'Fusion', 'Apex', 'Catalyst', 'Horizon', 'Bedrock', 'Skyline',
  'Anchor', 'Pinnacle', 'Cobalt', 'Granite', 'Evergreen', 'Frontier', 'Beacon', 'Compass', 'Elevate',
  'Momentum', 'Precision', 'Sterling', 'Vantage', 'Wavelength', 'Keystone', 'Outrider'];
const COMPANY_SUFFIXES = ['Technologies', 'Solutions', 'Systems', 'Industries', 'Enterprises', 'Corp',
  'Group', 'Labs', 'Holdings', 'Partners', 'Networks', 'Dynamics', 'Logistics', 'Ventures', 'Digital'];
const genCompanyName = (i) => `${pick(COMPANY_PREFIXES)} ${pick(COMPANY_SUFFIXES)} ${i}`;

const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Cameron',
  'Drew', 'Elliot', 'Harper', 'Reese', 'Sawyer', 'Quinn', 'Rowan', 'Skyler', 'Emerson', 'Finley', 'Hayden',
  'Priya', 'Wei', 'Fatima', 'Diego', 'Sven', 'Amara', 'Noor', 'Kenji', 'Ines', 'Lucas'];
const LAST_NAMES = ['Nguyen', 'Patel', 'Kim', 'Garcia', 'Muller', 'Rossi', 'Kowalski', 'Andersen', 'Silva',
  'Tanaka', 'Okafor', 'Petrov', 'Haddad', 'Chen', 'Fernandez', 'Bakker', 'Novak', 'Larsen', 'Costa', 'Yilmaz'];
const genPersonName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

const NEGOTIATION_COMMENTS = [
  'Could we get a better price if we increase the order quantity?',
  'Our budget is tighter this quarter, any room on the discount?',
  'We need delivery moved up by two weeks, is that possible?',
  'A competitor quoted lower, can you match or beat it?',
  'Happy to sign today if we can adjust the payment terms.',
  'Can we swap in a longer warranty instead of the discount?',
];

// ============================================================================
// Small helpers for idempotent inserts
// ============================================================================
async function upsertReturningId(client, insertSql, params) {
  // Uses an ON CONFLICT ... DO UPDATE ... RETURNING id pattern so we always
  // get an id back, whether the row is new or already existed.
  const { rows } = await client.query(insertSql, params);
  return rows[0].id;
}

async function insertIfNew(client, insertSql, params, selectSql, selectParams) {
  // Uses ON CONFLICT ... DO NOTHING RETURNING id. Tells the caller whether
  // the row was actually created, so expensive child records (lines,
  // invoices, payments...) are only generated once, even on reruns.
  const { rows } = await client.query(insertSql, params);
  if (rows.length) return { id: rows[0].id, isNew: true };
  const sel = await client.query(selectSql, selectParams);
  return { id: sel.rows[0].id, isNew: false };
}

// ============================================================================
// Reset — remove only previously *generated* test data, in FK-safe order.
// Original demo rows (admin/rep/manager/finance @dealflow.com, Acme/Globex/
// Initech @customer.com) are untouched.
// ============================================================================
async function resetGeneratedData(client) {
  console.log('reset: clearing previously generated test data...');
  await client.query(`
    DELETE FROM payment_transactions
    WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_number LIKE 'INV-%')
       OR subscription_id IN (
            SELECT s.id FROM subscriptions s
            JOIN quotation_lines ql ON ql.id = s.quotation_line_id
            JOIN quotations q ON q.id = ql.quotation_id
            WHERE q.quote_number LIKE 'Q-%'
          )
  `);
  await client.query(`DELETE FROM invoices WHERE invoice_number LIKE 'INV-%'`);
  await client.query(`
    DELETE FROM subscriptions
    WHERE quotation_line_id IN (
      SELECT ql.id FROM quotation_lines ql
      JOIN quotations q ON q.id = ql.quotation_id
      WHERE q.quote_number LIKE 'Q-%'
    )
  `);
  // Cascades quotation_lines, fulfillment_lines, approval_steps,
  // negotiation_requests, quotation_activity_log automatically.
  await client.query(`DELETE FROM quotations WHERE quote_number LIKE 'Q-%'`);
  await client.query(`DELETE FROM customers WHERE email LIKE 'customer%@example.com'`);
  await client.query(`DELETE FROM users WHERE email ~ '^(rep|manager|finance)[0-9]+@dealflow\\.com$'`);
  console.log('  cleared.');
}

// ============================================================================
// Fulfillment split helper
// ============================================================================
function splitFulfillment(productId, quantity, stockByProduct) {
  const stocks = (stockByProduct[productId] || [])
    .slice()
    .sort((a, b) => b.quantity_on_hand - a.quantity_on_hand);
  if (!stocks.length) return []; // product isn't a stocked/physical item (service or subscription)

  const results = [];
  let remaining = quantity;
  for (const s of stocks) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, s.quantity_on_hand);
    if (take > 0) {
      results.push({ warehouse_id: s.warehouse_id, quantity_fulfilled: take, is_backorder: false });
      remaining -= take;
    }
  }
  if (remaining > 0) {
    results.push({ warehouse_id: stocks[0].warehouse_id, quantity_fulfilled: remaining, is_backorder: true });
  }
  return results;
}

function pickStatus(rule) {
  if (!rule.requires_manager_approval && !rule.requires_finance_approval) {
    return pickWeighted([['draft', 15], ['approved', 30], ['confirmed', 50], ['rejected', 5]]);
  }
  return pickWeighted([
    ['draft', 10], ['pending_approval', 15], ['approved', 15],
    ['under_negotiation', 10], ['confirmed', 35], ['rejected', 15],
  ]);
}

// ============================================================================
async function seed() {
  console.log('Seeding DealFlow360...');
  const hash = (p) => bcrypt.hash(p, 12);
  const counts = {
    users: 0, customers: 0, quotations: 0, quotationLines: 0, approvalSteps: 0,
    negotiationRequests: 0, activityLog: 0, subscriptions: 0, fulfillmentLines: 0,
    invoices: 0, payments: 0, creditNotes: 0,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (RESET) await resetGeneratedData(client);

    // ── Phase 1: base configuration (existing, kept) ──────────────────────
    const baseUsers = [
      { name: 'Alice Admin', email: 'admin@dealflow.com', password: 'Admin@123', role: 'admin' },
      { name: 'Bob Rep', email: 'rep@dealflow.com', password: 'Rep@123', role: 'sales_rep' },
      { name: 'Carol Manager', email: 'manager@dealflow.com', password: 'Manager@123', role: 'sales_manager' },
      { name: 'Dave Finance', email: 'finance@dealflow.com', password: 'Finance@123', role: 'finance' },
    ];
    for (const u of baseUsers) {
      await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)
         ON CONFLICT (email) DO NOTHING`,
        [u.name, u.email, await hash(u.password), u.role]
      );
    }

    const wh1 = await client.query(
      `INSERT INTO warehouses (name, ship_cost_weight) VALUES ('North Warehouse', 1.0)
       ON CONFLICT (name) DO UPDATE SET ship_cost_weight=1.0 RETURNING id`
    );
    const wh2 = await client.query(
      `INSERT INTO warehouses (name, ship_cost_weight) VALUES ('South Warehouse', 1.5)
       ON CONFLICT (name) DO UPDATE SET ship_cost_weight=1.5 RETURNING id`
    );
    const warehouseId1 = wh1.rows[0].id;
    const warehouseId2 = wh2.rows[0].id;

    const cats = [
      { name: 'Hardware', max_discount_pct: 15 },
      { name: 'Services', max_discount_pct: 10 },
      { name: 'Subscriptions', max_discount_pct: 10 },
    ];
    const catIds = {};
    for (const cat of cats) {
      const { rows } = await client.query(
        `INSERT INTO categories (name, max_discount_pct) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET max_discount_pct=$2 RETURNING id`,
        [cat.name, cat.max_discount_pct]
      );
      catIds[cat.name] = rows[0].id;
    }

    const { rows: [plan] } = await client.query(
      `INSERT INTO subscription_plans (name, billing_cycle, proration_rule, cancellation_rule, refund_rule)
       VALUES ('Standard Monthly', 'monthly',
         'Pro-rate remaining days of current cycle as credit.',
         'Cancel effective end of current billing period.',
         'Refunds issued within 7 days of cancellation for unused full months.')
       ON CONFLICT DO NOTHING RETURNING id`
    );
    const planId = plan?.id || (await client.query(
      `SELECT id FROM subscription_plans WHERE name='Standard Monthly' LIMIT 1`
    )).rows[0].id;

    const productDefs = [
      { name: 'ProLaptop X1', category: 'Hardware', price: 1200, cost: 800, tax: 18, sub: null },
      { name: 'Server Rack Unit', category: 'Hardware', price: 3500, cost: 2200, tax: 18, sub: null },
      { name: 'Setup Service', category: 'Services', price: 500, cost: 200, tax: 18, sub: null },
      { name: 'Annual Maintenance', category: 'Services', price: 800, cost: 300, tax: 18, sub: null },
      { name: 'CloudStorage Pro', category: 'Subscriptions', price: 299, cost: 80, tax: 18, sub: planId },
      { name: 'SecureBackup Suite', category: 'Subscriptions', price: 149, cost: 40, tax: 18, sub: planId },
    ];
    const productIds = {};
    for (const p of productDefs) {
      const { rows } = await client.query(
        `INSERT INTO products (name, category_id, price, cost_price, tax_pct, subscription_plan_id)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
        [p.name, catIds[p.category], p.price, p.cost, p.tax, p.sub]
      );
      const id = rows[0]?.id || (await client.query('SELECT id FROM products WHERE name=$1', [p.name])).rows[0].id;
      productIds[p.name] = id;
    }

    await client.query(
      `INSERT INTO product_variant_values (product_id, attribute_name, value, extra_price)
       VALUES ($1,'RAM','16GB',200), ($1,'RAM','32GB',400), ($1,'Storage','512GB SSD',0), ($1,'Storage','1TB SSD',200)
       ON CONFLICT DO NOTHING`,
      [productIds['ProLaptop X1']]
    );

    const stockData = [
      [warehouseId1, productIds['ProLaptop X1'], 50, 5, 20],
      [warehouseId1, productIds['Server Rack Unit'], 10, 2, 5],
      [warehouseId1, productIds['Setup Service'], 999, 0, 0],
      [warehouseId2, productIds['ProLaptop X1'], 30, 5, 15],
      [warehouseId2, productIds['Server Rack Unit'], 5, 1, 3],
      [warehouseId2, productIds['Annual Maintenance'], 999, 0, 0],
    ];
    for (const [wid, pid, qty, reorder_threshold, reorder_quantity] of stockData) {
      await client.query(
        `INSERT INTO warehouse_stock (warehouse_id, product_id, quantity_on_hand, reorder_threshold, reorder_quantity)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity_on_hand=$3`,
        [wid, pid, qty, reorder_threshold, reorder_quantity]
      );
    }

    const priceLists = [
      { tier: 'Bronze', adjustment_type: 'none', adjustment_value: 0 },
      { tier: 'Silver', adjustment_type: 'percentage', adjustment_value: -5 },
      { tier: 'Gold', adjustment_type: 'percentage', adjustment_value: -10 },
    ];
    for (const pl of priceLists) {
      await client.query(
        `INSERT INTO price_lists (tier, adjustment_type, adjustment_value)
         VALUES ($1,$2::adjustment_type,$3)
         ON CONFLICT (tier) DO UPDATE SET adjustment_type=$2::adjustment_type, adjustment_value=$3`,
        [pl.tier, pl.adjustment_type, pl.adjustment_value]
      );
    }

    const baseCustomers = [
      { company: 'Acme Corp (Bronze)', email: 'acme@customer.com', tier: 'Bronze' },
      { company: 'Globex Corp (Silver)', email: 'globex@customer.com', tier: 'Silver' },
      { company: 'Initech (Gold)', email: 'initech@customer.com', tier: 'Gold' },
    ];
    for (const c of baseCustomers) {
      await client.query(
        `INSERT INTO customers (company_name, email, password_hash, tier) VALUES ($1,$2,$3,$4)
         ON CONFLICT (email) DO NOTHING`,
        [c.company, c.email, await hash('Customer@123'), c.tier]
      );
    }

    const upsellPairs = [
      { primary: 'ProLaptop X1', suggested: 'CloudStorage Pro', promoted: true, min_margin: 20 },
      { primary: 'ProLaptop X1', suggested: 'SecureBackup Suite', promoted: false, min_margin: 15 },
      { primary: 'Server Rack Unit', suggested: 'Annual Maintenance', promoted: true, min_margin: 25 },
      { primary: 'Setup Service', suggested: 'Annual Maintenance', promoted: false, min_margin: null },
    ];
    for (const ur of upsellPairs) {
      await client.query(
        `INSERT INTO upsell_rules (primary_product_id, suggested_product_id, is_promoted, min_margin_pct)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [productIds[ur.primary], productIds[ur.suggested], ur.promoted, ur.min_margin]
      );
    }
    console.log('  Phase 1: base configuration seeded (users, warehouses, categories, plans, products, price lists, base customers, upsell rules)');

    // ── Phase 2: expanded internal users ───────────────────────────────────
    const roleUserIds = { sales_manager: [], sales_rep: [], finance: [] };
    for (const [role, existingEmail] of [['sales_manager', 'manager@dealflow.com'], ['sales_rep', 'rep@dealflow.com'], ['finance', 'finance@dealflow.com']]) {
      const { rows } = await client.query('SELECT id FROM users WHERE email=$1', [existingEmail]);
      roleUserIds[role].push(rows[0].id);
    }
    const extraCounts = { sales_manager: CONFIG.NUM_SALES_MANAGERS_EXTRA, sales_rep: CONFIG.NUM_SALES_REPS_EXTRA, finance: CONFIG.NUM_FINANCE_EXTRA };
    const rolePrefix = { sales_manager: 'manager', sales_rep: 'rep', finance: 'finance' };
    for (const role of ['sales_manager', 'sales_rep', 'finance']) {
      for (let n = 2; n <= extraCounts[role] + 1; n++) {
        const email = `${rolePrefix[role]}${n}@dealflow.com`;
        const id = await upsertReturningId(client,
          `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)
           ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [genPersonName(), email, await hash('Passw0rd!'), role]
        );
        roleUserIds[role].push(id);
        counts.users++;
      }
    }
    console.log(`  Phase 2: users expanded (${roleUserIds.sales_manager.length} managers, ${roleUserIds.sales_rep.length} reps, ${roleUserIds.finance.length} finance)`);

    // ── Phase 3: customers ──────────────────────────────────────────────────
    const tierWeights = [['Bronze', 40], ['Silver', 35], ['Gold', 25]];
    const customers = [];
    for (const c of baseCustomers) {
      const { rows } = await client.query('SELECT id, tier FROM customers WHERE email=$1', [c.email]);
      customers.push(rows[0]);
    }
    for (let i = 1; i <= CONFIG.NUM_CUSTOMERS; i++) {
      const tier = pickWeighted(tierWeights);
      const email = `customer${i}@example.com`;
      const id = await upsertReturningId(client,
        `INSERT INTO customers (company_name, email, password_hash, tier) VALUES ($1,$2,$3,$4)
         ON CONFLICT (email) DO UPDATE SET company_name=EXCLUDED.company_name RETURNING id`,
        [genCompanyName(i), email, await hash('Customer@123'), tier]
      );
      customers.push({ id, tier });
      counts.customers++;
    }
    console.log(`  Phase 3: ${customers.length} customers total (${counts.customers} newly generated)`);

    // ── Reference data needed for the relational tree ──────────────────────
    const { rows: priceListRows } = await client.query('SELECT tier, id FROM price_lists');
    const priceListByTier = Object.fromEntries(priceListRows.map(r => [r.tier, r.id]));

    const { rows: tierRows } = await client.query('SELECT tier, max_discount_pct FROM customer_tiers');
    const tierMaxDiscount = Object.fromEntries(tierRows.map(r => [r.tier, Number(r.max_discount_pct)]));

    const { rows: approvalRuleRows } = await client.query(
      'SELECT risk_level, requires_manager_approval, requires_finance_approval FROM approval_rules'
    );
    const approvalRules = Object.fromEntries(approvalRuleRows.map(r => [r.risk_level, r]));

    const { rows: productRows } = await client.query(`
      SELECT p.id, p.name, p.price, p.cost_price, p.tax_pct, p.subscription_plan_id, c.max_discount_pct AS cat_max_discount
      FROM products p JOIN categories c ON c.id = p.category_id
    `);
    const productByName = Object.fromEntries(productRows.map(p => [p.name, p]));

    const { rows: planRows } = await client.query('SELECT id, billing_cycle FROM subscription_plans');
    const planCycle = Object.fromEntries(planRows.map(r => [r.id, r.billing_cycle]));
    const cycleDays = { monthly: 30, quarterly: 90, yearly: 365 };

    const { rows: laptopVariants } = await client.query(
      'SELECT id, extra_price FROM product_variant_values WHERE product_id=$1',
      [productByName['ProLaptop X1'].id]
    );

    const { rows: stockRows } = await client.query('SELECT warehouse_id, product_id, quantity_on_hand FROM warehouse_stock');
    const stockByProduct = {};
    for (const s of stockRows) {
      (stockByProduct[s.product_id] ||= []).push({ warehouse_id: s.warehouse_id, quantity_on_hand: s.quantity_on_hand });
    }

    let invoiceSeq = 0;

    // ── Phase 4: quotations + full downstream tree ──────────────────────────
    for (let i = 1; i <= CONFIG.NUM_QUOTATIONS; i++) {
      const customer = pick(customers);
      const salesRepId = pick(roleUserIds.sales_rep);
      const priceListId = priceListByTier[customer.tier] || null;
      const riskLevel = pickWeighted([['low', 50], ['medium', 35], ['high', 15]]);
      const rule = approvalRules[riskLevel];
      const status = pickStatus(rule);

      const createdAt = daysAgo(randInt(14, 300));
      let submittedAt = null, approvedAt = null, confirmedAt = null;
      const needsSteps = status !== 'draft' && (rule.requires_manager_approval || rule.requires_finance_approval);
      const stepsNeeded = [];
      if (needsSteps) {
        if (rule.requires_manager_approval) stepsNeeded.push({ role: 'sales_manager' });
        if (rule.requires_finance_approval) stepsNeeded.push({ role: 'finance' });
        submittedAt = addDays(createdAt, randInt(1, 5));
      } else if (status !== 'draft') {
        submittedAt = addDays(createdAt, randInt(1, 5));
      }

      let stepPlan = []; // [{role, status}]
      if (needsSteps) {
        if (status === 'pending_approval') {
          const reached = randInt(0, stepsNeeded.length - 1);
          stepPlan = stepsNeeded.map((s, idx) => ({ role: s.role, status: idx < reached ? 'approved' : 'pending' })).slice(0, reached + 1);
        } else if (['approved', 'confirmed', 'under_negotiation'].includes(status)) {
          stepPlan = stepsNeeded.map(s => ({ role: s.role, status: 'approved' }));
          approvedAt = addDays(submittedAt, randInt(2, 14));
        } else if (status === 'rejected') {
          const reached = randInt(0, stepsNeeded.length - 1);
          stepPlan = stepsNeeded.map((s, idx) => ({ role: s.role, status: idx < reached ? 'approved' : 'rejected' })).slice(0, reached + 1);
        }
      }
      if (status === 'confirmed') confirmedAt = addDays(approvedAt || submittedAt, randInt(1, 10));

      const promisedDeliveryDate = status === 'confirmed' ? addDays(confirmedAt, randInt(7, 30)) : null;
      const quoteNumber = `Q-${createdAt.getFullYear()}-${pad(i, 5)}`;
      const updatedAt = confirmedAt || approvedAt || submittedAt || createdAt;

      const qRes = await insertIfNew(client,
        `INSERT INTO quotations
           (quote_number, customer_id, sales_rep_id, price_list_id, status, risk_level,
            promised_delivery_date, submitted_at, approved_at, confirmed_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (quote_number) DO NOTHING RETURNING id`,
        [quoteNumber, customer.id, salesRepId, priceListId, status, riskLevel,
          promisedDeliveryDate, submittedAt, approvedAt, confirmedAt, createdAt, updatedAt],
        `SELECT id FROM quotations WHERE quote_number=$1`, [quoteNumber]
      );
      if (!qRes.isNew) continue; // already generated in a prior run; skip regenerating children
      counts.quotations++;
      const quotationId = qRes.id;

      // -- quotation_lines --
      const numLines = randInt(2, 5);
      const chosenProducts = shuffle(Object.values(productByName)).slice(0, numLines);
      const lines = [];
      for (const product of chosenProducts) {
        let unitPrice = Number(product.price);
        let variantId = null;
        if (product.name === 'ProLaptop X1' && rnd() < 0.5 && laptopVariants.length) {
          const variant = pick(laptopVariants);
          variantId = variant.id;
          unitPrice += Number(variant.extra_price);
        }
        const maxDisc = Math.min(Number(product.cat_max_discount), tierMaxDiscount[customer.tier] ?? 100);
        const discountPct = randFloat(0, maxDisc, 2);
        const quantity = product.subscription_plan_id
          ? randInt(1, 5)
          : (product.name === 'Server Rack Unit' ? randInt(1, 3) : randInt(1, 10));

        const { rows: [line] } = await client.query(
          `INSERT INTO quotation_lines (quotation_id, product_id, product_variant_value_id, quantity, unit_price, discount_pct, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [quotationId, product.id, variantId, quantity, unitPrice, discountPct, createdAt]
        );
        lines.push({ id: line.id, product, quantity, unitPrice, discountPct });
        counts.quotationLines++;
      }

      // -- approval_steps + activity log for submission/approval/rejection --
      if (submittedAt) {
        await client.query(
          `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, created_at)
           VALUES ($1,'submitted',$2,$3)`,
          [quotationId, salesRepId, submittedAt]
        );
        counts.activityLog++;
      }
      let stepTime = submittedAt;
      for (let idx = 0; idx < stepPlan.length; idx++) {
        const sp = stepPlan[idx];
        const approverRole = sp.role; // 'sales_manager' | 'finance'
        const assignedTo = pick(roleUserIds[approverRole]);
        stepTime = addDays(stepTime, randInt(1, 7));
        const { rows: [step] } = await client.query(
          `INSERT INTO approval_steps (quotation_id, step_order, approver_role, status, assigned_to_user_id, created_at)
           VALUES ($1,$2,$3::approver_role,$4::approval_status,$5,$6) RETURNING id`,
          [quotationId, idx + 1, approverRole, sp.status, assignedTo, stepTime]
        );
        counts.approvalSteps++;
        if (sp.status === 'approved' || sp.status === 'rejected') {
          await client.query(
            `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, approval_step_id, created_at)
             VALUES ($1,$2::activity_action,$3,$4,$5)`,
            [quotationId, sp.status, assignedTo, step.id, stepTime]
          );
          counts.activityLog++;
        }
      }
      if (confirmedAt) {
        await client.query(
          `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, created_at)
           VALUES ($1,'confirmed',$2,$3)`,
          [quotationId, salesRepId, confirmedAt]
        );
        counts.activityLog++;
      }

      // -- negotiation_requests --
      if (status === 'under_negotiation') {
        const targetLine = pick(lines);
        const negOpen = rnd() < 0.7;
        const negCreated = addDays(approvedAt || submittedAt, randInt(1, 5));
        const resolvedAt = negOpen ? null : addDays(negCreated, randInt(1, 6));
        const { rows: [neg] } = await client.query(
          `INSERT INTO negotiation_requests
             (quotation_id, quotation_line_id, customer_comment, counter_discount_pct, requested_delivery_date, status, created_at, resolved_at)
           VALUES ($1,$2,$3,$4,$5,$6::negotiation_status,$7,$8) RETURNING id`,
          [quotationId, targetLine.id, pick(NEGOTIATION_COMMENTS),
            randFloat(0, Math.min(20, tierMaxDiscount[customer.tier] + 10), 2),
            addDays(negCreated, randInt(7, 21)), negOpen ? 'open' : 'resolved', negCreated, resolvedAt]
        );
        counts.negotiationRequests++;
        await client.query(
          `INSERT INTO quotation_activity_log (quotation_id, action, actor_customer_id, negotiation_request_id, created_at)
           VALUES ($1,'negotiation_submitted',$2,$3,$4)`,
          [quotationId, customer.id, neg.id, negCreated]
        );
        counts.activityLog++;
        if (!negOpen) {
          await client.query(
            `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, negotiation_request_id, created_at)
             VALUES ($1,'negotiation_resolved',$2,$3,$4)`,
            [quotationId, salesRepId, neg.id, resolvedAt]
          );
          counts.activityLog++;
        }
      }

      // -- Only confirmed quotations translate into subscriptions, fulfillment, and invoices --
      if (status !== 'confirmed') continue;

      // subscriptions (one per subscription-product line) + fulfillment (hardware lines)
      const lineSubscriptions = []; // { line, subscription }
      let oneTimeTotal = 0;

      for (const line of lines) {
        const lineSubtotal = line.quantity * line.unitPrice * (1 - line.discountPct / 100);
        const lineWithTax = Math.round(lineSubtotal * (1 + Number(line.product.tax_pct) / 100) * 100) / 100;

        if (line.product.subscription_plan_id) {
          const subStatus = pickWeighted([['active', 75], ['paused', 10], ['cancelled', 15]]);
          const cycle = planCycle[line.product.subscription_plan_id] || 'monthly';
          const startedAt = confirmedAt;
          const nextBillDate = addDays(startedAt, cycleDays[cycle] || 30);
          const cancelledAt = subStatus === 'cancelled' ? addDays(startedAt, randInt(5, (cycleDays[cycle] || 30) - 2)) : null;

          const { id: subId } = await insertIfNew(client,
            `INSERT INTO subscriptions (quotation_line_id, customer_id, status, next_bill_date, started_at, cancelled_at)
             VALUES ($1,$2,$3::subscription_status,$4,$5,$6)
             ON CONFLICT (quotation_line_id) DO NOTHING RETURNING id`,
            [line.id, customer.id, subStatus, nextBillDate, startedAt, cancelledAt],
            `SELECT id FROM subscriptions WHERE quotation_line_id=$1`, [line.id]
          );
          counts.subscriptions++;
          lineSubscriptions.push({ line, subId, lineWithTax, subStatus, startedAt, cancelledAt, cycle });
        } else {
          oneTimeTotal += lineWithTax;

          const fulfillments = splitFulfillment(line.product.id, line.quantity, stockByProduct);
          for (const f of fulfillments) {
            const shippedAt = f.is_backorder ? null : addDays(confirmedAt, randInt(1, 7));
            const estimatedCost = Math.round(Number(line.product.cost_price) * f.quantity_fulfilled * 100) / 100;
            await client.query(
              `INSERT INTO fulfillment_lines (quotation_line_id, warehouse_id, quantity_fulfilled, is_backorder, estimated_cost, shipped_at, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [line.id, f.warehouse_id, f.quantity_fulfilled, f.is_backorder, estimatedCost, shippedAt, confirmedAt]
            );
            counts.fulfillmentLines++;
          }
        }
      }

      // -- one-time invoice for non-subscription lines --
      if (oneTimeTotal > 0) {
        invoiceSeq++;
        const issuedAt = addDays(confirmedAt, randInt(0, 3));
        const invStatus = pickWeighted([['paid', 50], ['partially_paid', 20], ['unpaid', 30]]);
        const invNumber = `INV-${issuedAt.getFullYear()}-${pad(invoiceSeq, 5)}`;
        const invRes = await insertIfNew(client,
          `INSERT INTO invoices (invoice_number, quotation_id, customer_id, subscription_id, amount, status, due_date, issued_at)
           VALUES ($1,$2,$3,NULL,$4,$5::invoice_status,$6,$7)
           ON CONFLICT (invoice_number) DO NOTHING RETURNING id`,
          [invNumber, quotationId, customer.id, Math.round(oneTimeTotal * 100) / 100, invStatus, addDays(issuedAt, 30), issuedAt],
          `SELECT id FROM invoices WHERE invoice_number=$1`, [invNumber]
        );
        if (invRes.isNew) {
          counts.invoices++;
          await createPaymentsForInvoice(client, counts, invRes.id, Math.round(oneTimeTotal * 100) / 100, invStatus, issuedAt);
        }
      }

      // -- recurring invoices for subscription lines (1-3 billing cycles) --
      for (const ls of lineSubscriptions) {
        const cycles = randInt(1, 3);
        for (let c = 0; c < cycles; c++) {
          const issuedAt = addDays(ls.startedAt, c * (cycleDays[ls.cycle] || 30));
          if (ls.cancelledAt && issuedAt > ls.cancelledAt) break;
          invoiceSeq++;
          const invStatus = pickWeighted([['paid', 55], ['partially_paid', 15], ['unpaid', 30]]);
          const invNumber = `INV-${issuedAt.getFullYear()}-${pad(invoiceSeq, 5)}`;
          const invRes = await insertIfNew(client,
            `INSERT INTO invoices (invoice_number, quotation_id, customer_id, subscription_id, amount, status, due_date, issued_at)
             VALUES ($1,$2,$3,$4,$5,$6::invoice_status,$7,$8)
             ON CONFLICT (invoice_number) DO NOTHING RETURNING id`,
            [invNumber, quotationId, customer.id, ls.subId, ls.lineWithTax, invStatus, addDays(issuedAt, 15), issuedAt],
            `SELECT id FROM invoices WHERE invoice_number=$1`, [invNumber]
          );
          if (invRes.isNew) {
            counts.invoices++;
            await createPaymentsForInvoice(client, counts, invRes.id, ls.lineWithTax, invStatus, issuedAt);
          }
        }
        // credit note for early cancellations
        if (ls.subStatus === 'cancelled') {
          const refundAmount = Math.round(ls.lineWithTax * randFloat(0.1, 0.3, 2) * 100) / 100;
          await client.query(
            `INSERT INTO payment_transactions (type, invoice_id, subscription_id, amount, reason, created_at)
             VALUES ('credit_note', NULL, $1, $2, $3, $4)`,
            [ls.subId, refundAmount, 'Prorated refund for early cancellation', addDays(ls.cancelledAt, randInt(1, 4))]
          );
          counts.creditNotes++;
        }
      }
    }

    await client.query('COMMIT');
    console.log('\nSeed complete!');
    printSummary(counts);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

async function createPaymentsForInvoice(client, counts, invoiceId, amount, status, issuedAt) {
  if (status === 'paid') {
    await client.query(
      `INSERT INTO payment_transactions (type, invoice_id, amount, created_at) VALUES ('payment',$1,$2,$3)`,
      [invoiceId, amount, addDays(issuedAt, randInt(1, 20))]
    );
    counts.payments++;
  } else if (status === 'partially_paid') {
    const partial = Math.round(amount * randFloat(0.3, 0.7, 2) * 100) / 100;
    await client.query(
      `INSERT INTO payment_transactions (type, invoice_id, amount, created_at) VALUES ('payment',$1,$2,$3)`,
      [invoiceId, partial, addDays(issuedAt, randInt(1, 15))]
    );
    counts.payments++;
  }
  // 'unpaid' -> no payment rows
}

function printSummary(counts) {
  console.log('\nRecords generated this run:');
  console.log(`  Users (extra):         ${counts.users}`);
  console.log(`  Customers:             ${counts.customers}`);
  console.log(`  Quotations:            ${counts.quotations}`);
  console.log(`  Quotation lines:       ${counts.quotationLines}`);
  console.log(`  Approval steps:        ${counts.approvalSteps}`);
  console.log(`  Negotiation requests:  ${counts.negotiationRequests}`);
  console.log(`  Activity log entries:  ${counts.activityLog}`);
  console.log(`  Subscriptions:         ${counts.subscriptions}`);
  console.log(`  Fulfillment lines:     ${counts.fulfillmentLines}`);
  console.log(`  Invoices:              ${counts.invoices}`);
  console.log(`  Payments:              ${counts.payments}`);
  console.log(`  Credit notes:          ${counts.creditNotes}`);
  console.log('\nTest credentials:');
  console.log('  Admin:    admin@dealflow.com   / Admin@123');
  console.log('  Rep:      rep@dealflow.com     / Rep@123');
  console.log('  Manager:  manager@dealflow.com / Manager@123');
  console.log('  Finance:  finance@dealflow.com / Finance@123');
  console.log('  Customer: acme@customer.com    / Customer@123 (Bronze)');
  console.log('  Customer: globex@customer.com  / Customer@123 (Silver)');
  console.log('  Customer: initech@customer.com / Customer@123 (Gold)');
  console.log('  Generated customers: customer1@example.com..customerN@example.com / Customer@123');
}

seed().finally(() => pool.end());