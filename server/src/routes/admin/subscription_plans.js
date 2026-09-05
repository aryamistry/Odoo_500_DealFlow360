// src/routes/admin/subscription_plans.js
const express = require('express');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM subscription_plans ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { name, billing_cycle, proration_rule, cancellation_rule, refund_rule } = req.body;
  if (!name || !billing_cycle) return res.status(400).json({ error: 'name and billing_cycle required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO subscription_plans (name,billing_cycle,proration_rule,cancellation_rule,refund_rule) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, billing_cycle, proration_rule, cancellation_rule, refund_rule]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', async (req, res) => {
  const { name, billing_cycle, proration_rule, cancellation_rule, refund_rule } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE subscription_plans SET
        name=COALESCE($1,name), billing_cycle=COALESCE($2::billing_cycle,billing_cycle),
        proration_rule=COALESCE($3,proration_rule),
        cancellation_rule=COALESCE($4,cancellation_rule),
        refund_rule=COALESCE($5,refund_rule)
       WHERE id=$6 RETURNING *`,
      [name, billing_cycle, proration_rule, cancellation_rule, refund_rule, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM subscription_plans WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
