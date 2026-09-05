// src/routes/admin/price_lists.js
const express = require('express');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate, requireRole('admin'));

// GET all price lists
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM price_lists ORDER BY tier');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create price list for a tier
router.post('/', async (req, res) => {
  const { tier, adjustment_type = 'none', adjustment_value = 0 } = req.body;
  if (!tier) return res.status(400).json({ error: 'tier required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO price_lists (tier, adjustment_type, adjustment_value) VALUES ($1,$2,$3) ON CONFLICT (tier) DO UPDATE SET adjustment_type=$2, adjustment_value=$3 RETURNING *',
      [tier, adjustment_type, adjustment_value]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH update price list by id
router.patch('/:id', async (req, res) => {
  const { adjustment_type, adjustment_value } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE price_lists SET adjustment_type=COALESCE($1::adjustment_type,adjustment_type), adjustment_value=COALESCE($2,adjustment_value) WHERE id=$3 RETURNING *',
      [adjustment_type, adjustment_value, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
