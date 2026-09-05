// migrate.js — one-time migration script for gap fixes
const pool = require('./server/src/db');

(async () => {
  try {
    // Gap 1: Add quantity_override column to subscriptions
    await pool.query(`
      ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS quantity_override INTEGER CHECK (quantity_override > 0)
    `);
    console.log('✅ quantity_override column added to subscriptions (or already existed)');

    // Gap 4: Create platform_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key        VARCHAR(100) PRIMARY KEY,
        value      TEXT NOT NULL,
        label      VARCHAR(200),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    console.log('✅ platform_settings table created (or already existed)');

    // Gap 4: Seed default stalled_deal_days setting
    await pool.query(`
      INSERT INTO platform_settings (key, value, label)
      VALUES ('stalled_deal_days', '7', 'Days before a deal is considered stalled')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('✅ platform_settings seeded with stalled_deal_days=7');

    // Update payment_transactions_check constraint to allow subscription_id or invoice_id for payments and credit notes
    await pool.query(`
      ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_check;
      ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_check CHECK (
        (type = 'payment' AND (invoice_id IS NOT NULL OR subscription_id IS NOT NULL)) OR
        (type = 'credit_note' AND (subscription_id IS NOT NULL OR invoice_id IS NOT NULL))
      );
    `);
    console.log('✅ payment_transactions_check constraint updated');

    console.log('\n🎉 All migrations applied successfully!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
