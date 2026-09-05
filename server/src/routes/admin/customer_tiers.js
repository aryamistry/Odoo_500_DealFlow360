// src/routes/admin/customer_tiers.js
const express = require('express');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const router = express.Router();
router.use(authenticate, requireRole('admin', 'sales_manager', 'sales_rep', 'finance'));

// GET all tiers (pre-seeded: Bronze, Silver, Gold)
// Accessible by any internal user — reps need this to populate the customer-create form.
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customer_tiers ORDER BY max_discount_pct');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH update a tier's ceiling (edit only — rows are pre-seeded, admin-only)
router.patch('/:tier', requireRole('admin'), async (req, res) => {
  const { max_discount_pct } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE customer_tiers SET max_discount_pct=$1 WHERE tier=$2 RETURNING *',
      [max_discount_pct, req.params.tier]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tier not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
