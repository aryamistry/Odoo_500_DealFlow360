// src/routes/admin/categories.js
const express = require('express');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate, requireRole('admin'));

// GET all categories
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create category
router.post('/', async (req, res) => {
  const { name, max_discount_pct } = req.body;
  if (!name || max_discount_pct == null) return res.status(400).json({ error: 'name and max_discount_pct required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO categories (name, max_discount_pct) VALUES ($1,$2) RETURNING *',
      [name, max_discount_pct]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH update category
router.patch('/:id', async (req, res) => {
  const { name, max_discount_pct } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE categories SET name = COALESCE($1,name), max_discount_pct = COALESCE($2,max_discount_pct) WHERE id=$3 RETURNING *',
      [name, max_discount_pct, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE category
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
