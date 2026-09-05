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
    // Subscription Rules Validation Constraints (§1 of Subscription_Rules_Implementation_Steps.md)
    await pool.query(`
      UPDATE subscription_plans SET proration_rule = 'prorated' WHERE proration_rule NOT IN ('prorated','full_charge','no_proration') OR proration_rule IS NULL;
      UPDATE subscription_plans SET cancellation_rule = 'end_of_cycle' WHERE cancellation_rule NOT IN ('immediate','end_of_cycle') OR cancellation_rule IS NULL;
      UPDATE subscription_plans SET refund_rule = 'none' WHERE refund_rule NOT IN ('full','prorated','none') OR refund_rule IS NULL;

      ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS proration_rule_valid;
      ALTER TABLE subscription_plans ADD CONSTRAINT proration_rule_valid CHECK (proration_rule IN ('prorated', 'full_charge', 'no_proration'));

      ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS cancellation_rule_valid;
      ALTER TABLE subscription_plans ADD CONSTRAINT cancellation_rule_valid CHECK (cancellation_rule IN ('immediate', 'end_of_cycle'));

      ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS refund_rule_valid;
      ALTER TABLE subscription_plans ADD CONSTRAINT refund_rule_valid CHECK (refund_rule IN ('full', 'prorated', 'none'));
    `);
    console.log('✅ subscription_plans constraints (proration_rule_valid, cancellation_rule_valid, refund_rule_valid) applied');

    console.log('\n🎉 All migrations applied successfully!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
