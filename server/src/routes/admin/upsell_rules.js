// src/routes/admin/upsell_rules.js
const express = require('express');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ur.*,
        p1.name AS primary_product_name,
        p2.name AS suggested_product_name
      FROM upsell_rules ur
      JOIN products p1 ON p1.id = ur.primary_product_id
      JOIN products p2 ON p2.id = ur.suggested_product_id
      ORDER BY p1.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { primary_product_id, suggested_product_id, is_promoted = false, min_margin_pct } = req.body;
  if (!primary_product_id || !suggested_product_id)
    return res.status(400).json({ error: 'primary_product_id and suggested_product_id required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO upsell_rules (primary_product_id,suggested_product_id,is_promoted,min_margin_pct) VALUES ($1,$2,$3,$4) RETURNING *',
      [primary_product_id, suggested_product_id, is_promoted, min_margin_pct]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', async (req, res) => {
  const { is_promoted, min_margin_pct } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE upsell_rules SET is_promoted=COALESCE($1,is_promoted), min_margin_pct=COALESCE($2,min_margin_pct) WHERE id=$3 RETURNING *',
      [is_promoted, min_margin_pct, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM upsell_rules WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
