// scripts/seed.js — Full seed for DealFlow360
// Run: node scripts/seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

async function seed() {
  console.log('🌱 Seeding DealFlow360...');

  // ── Users ───────────────────────────────────────────────────────────────────
  const hash = async (p) => bcrypt.hash(p, 12);

  const users = [
    { name: 'Alice Admin',    email: 'admin@dealflow.com',    password: 'Admin@123',   role: 'admin' },
    { name: 'Bob Rep',        email: 'rep@dealflow.com',      password: 'Rep@123',     role: 'sales_rep' },
    { name: 'Carol Manager',  email: 'manager@dealflow.com',  password: 'Manager@123', role: 'sales_manager' },
    { name: 'Dave Finance',   email: 'finance@dealflow.com',  password: 'Finance@123', role: 'finance' },
  ];

  for (const u of users) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
      [u.name, u.email, await hash(u.password), u.role]
    );
  }
  console.log('  ✓ Users seeded');

  // ── Warehouses ──────────────────────────────────────────────────────────────
  const wh1 = await pool.query(
    `INSERT INTO warehouses (name, ship_cost_weight) VALUES ('North Warehouse', 1.0)
     ON CONFLICT (name) DO UPDATE SET ship_cost_weight=1.0 RETURNING id`
  );
  const wh2 = await pool.query(
    `INSERT INTO warehouses (name, ship_cost_weight) VALUES ('South Warehouse', 1.5)
     ON CONFLICT (name) DO UPDATE SET ship_cost_weight=1.5 RETURNING id`
  );
  const warehouseId1 = wh1.rows[0].id;
  const warehouseId2 = wh2.rows[0].id;
  console.log('  ✓ Warehouses seeded');

  // ── Categories ──────────────────────────────────────────────────────────────
  const cats = [
    { name: 'Hardware',      max_discount_pct: 15 },
    { name: 'Services',      max_discount_pct: 10 },
    { name: 'Subscriptions', max_discount_pct: 10 },
  ];
  const catIds = {};
  for (const cat of cats) {
    const { rows } = await pool.query(
      `INSERT INTO categories (name, max_discount_pct) VALUES ($1,$2)
       ON CONFLICT (name) DO UPDATE SET max_discount_pct=$2 RETURNING id`,
      [cat.name, cat.max_discount_pct]
    );
    catIds[cat.name] = rows[0].id;
  }
  console.log('  ✓ Categories seeded');

  // ── Subscription Plans ──────────────────────────────────────────────────────
  const { rows: [plan] } = await pool.query(
    `INSERT INTO subscription_plans (name, billing_cycle, proration_rule, cancellation_rule, refund_rule)
     VALUES ('Standard Monthly', 'monthly',
       'Pro-rate remaining days of current cycle as credit.',
       'Cancel effective end of current billing period.',
       'Refunds issued within 7 days of cancellation for unused full months.')
     ON CONFLICT DO NOTHING RETURNING id`
  );
  const planId = plan?.id || (await pool.query("SELECT id FROM subscription_plans WHERE name='Standard Monthly' LIMIT 1")).rows[0].id;
  console.log('  ✓ Subscription plans seeded');

  // ── Products ────────────────────────────────────────────────────────────────
  const products = [
    { name: 'ProLaptop X1',      category: 'Hardware',      price: 1200, cost: 800,  tax: 18, sub: null },
    { name: 'Server Rack Unit',  category: 'Hardware',      price: 3500, cost: 2200, tax: 18, sub: null },
    { name: 'Setup Service',     category: 'Services',      price: 500,  cost: 200,  tax: 18, sub: null },
    { name: 'Annual Maintenance',category: 'Services',      price: 800,  cost: 300,  tax: 18, sub: null },
    { name: 'CloudStorage Pro',  category: 'Subscriptions', price: 299,  cost: 80,   tax: 18, sub: planId },
    { name: 'SecureBackup Suite',category: 'Subscriptions', price: 149,  cost: 40,   tax: 18, sub: planId },
  ];
  const productIds = {};
  for (const p of products) {
    const { rows } = await pool.query(
      `INSERT INTO products (name, category_id, price, cost_price, tax_pct, subscription_plan_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING RETURNING id`,
      [p.name, catIds[p.category], p.price, p.cost, p.tax, p.sub]
    );
    const id = rows[0]?.id || (await pool.query('SELECT id FROM products WHERE name=$1', [p.name])).rows[0].id;
    productIds[p.name] = id;
  }
  console.log('  ✓ Products seeded');

  // ── Variants ────────────────────────────────────────────────────────────────
  await pool.query(
    `INSERT INTO product_variant_values (product_id, attribute_name, value, extra_price)
     VALUES ($1,'RAM','16GB',200), ($1,'RAM','32GB',400), ($1,'Storage','512GB SSD',0), ($1,'Storage','1TB SSD',200)
     ON CONFLICT DO NOTHING`,
    [productIds['ProLaptop X1']]
  );
  console.log('  ✓ Variants seeded');

  // ── Warehouse Stock ─────────────────────────────────────────────────────────
  const stockData = [
    [warehouseId1, productIds['ProLaptop X1'],      50, 5, 20],
    [warehouseId1, productIds['Server Rack Unit'],   10, 2,  5],
    [warehouseId1, productIds['Setup Service'],     999, 0,  0],
    [warehouseId2, productIds['ProLaptop X1'],       30, 5, 15],
    [warehouseId2, productIds['Server Rack Unit'],    5, 1,  3],
    [warehouseId2, productIds['Annual Maintenance'], 999, 0,  0],
  ];
  for (const [wid, pid, qty, reorder_threshold, reorder_quantity] of stockData) {
    await pool.query(
      `INSERT INTO warehouse_stock (warehouse_id, product_id, quantity_on_hand, reorder_threshold, reorder_quantity)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity_on_hand=$3`,
      [wid, pid, qty, reorder_threshold, reorder_quantity]
    );
  }
  console.log('  ✓ Warehouse stock seeded');

  // ── Price Lists ─────────────────────────────────────────────────────────────
  const priceLists = [
    { tier: 'Bronze', adjustment_type: 'none',       adjustment_value: 0 },
    { tier: 'Silver', adjustment_type: 'percentage', adjustment_value: -5 },  // 5% discount
    { tier: 'Gold',   adjustment_type: 'percentage', adjustment_value: -10 }, // 10% discount
  ];
  for (const pl of priceLists) {
    await pool.query(
      `INSERT INTO price_lists (tier, adjustment_type, adjustment_value)
       VALUES ($1,$2::adjustment_type,$3) ON CONFLICT (tier) DO UPDATE SET adjustment_type=$2::adjustment_type, adjustment_value=$3`,
      [pl.tier, pl.adjustment_type, pl.adjustment_value]
    );
  }
  console.log('  ✓ Price lists seeded');

  // ── Customers ───────────────────────────────────────────────────────────────
  const customers = [
    { company: 'Acme Corp (Bronze)',  email: 'acme@customer.com',    tier: 'Bronze' },
    { company: 'Globex Corp (Silver)',email: 'globex@customer.com',  tier: 'Silver' },
    { company: 'Initech (Gold)',      email: 'initech@customer.com', tier: 'Gold' },
  ];
  for (const c of customers) {
    await pool.query(
      `INSERT INTO customers (company_name, email, password_hash, tier)
       VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
      [c.company, c.email, await hash('Customer@123'), c.tier]
    );
  }
  console.log('  ✓ Customers seeded');

  // ── Upsell Rules ────────────────────────────────────────────────────────────
  const upsellPairs = [
    { primary: 'ProLaptop X1',      suggested: 'CloudStorage Pro',  promoted: true,  min_margin: 20 },
    { primary: 'ProLaptop X1',      suggested: 'SecureBackup Suite',promoted: false, min_margin: 15 },
    { primary: 'Server Rack Unit',  suggested: 'Annual Maintenance',promoted: true,  min_margin: 25 },
    { primary: 'Setup Service',     suggested: 'Annual Maintenance',promoted: false, min_margin: null },
  ];
  for (const ur of upsellPairs) {
    await pool.query(
      `INSERT INTO upsell_rules (primary_product_id, suggested_product_id, is_promoted, min_margin_pct)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [productIds[ur.primary], productIds[ur.suggested], ur.promoted, ur.min_margin]
    );
  }
  console.log('  ✓ Upsell rules seeded');

  console.log('\n✅ Seed complete!');
  console.log('\nTest credentials:');
  console.log('  Admin:   admin@dealflow.com   / Admin@123');
  console.log('  Rep:     rep@dealflow.com     / Rep@123');
  console.log('  Manager: manager@dealflow.com / Manager@123');
  console.log('  Finance: finance@dealflow.com / Finance@123');
  console.log('  Customer: acme@customer.com   / Customer@123 (Bronze)');
  console.log('  Customer: globex@customer.com / Customer@123 (Silver)');
  console.log('  Customer: initech@customer.com/ Customer@123 (Gold)');
}

seed()
  .catch(err => { console.error('❌ Seed failed:', err); process.exit(1); })
  .finally(() => pool.end());
