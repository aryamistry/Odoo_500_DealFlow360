// src/routes/admin/warehouses.js
const express = require('express');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate, requireRole('admin'));

// GET all warehouses with stock
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.*, 
        json_agg(json_build_object(
          'id', ws.id, 'product_id', ws.product_id,
          'product_name', p.name,
          'product_unit', p.unit,
          'product_price', p.price,
          'quantity_on_hand', ws.quantity_on_hand,
          'reorder_threshold', ws.reorder_threshold,
          'reorder_quantity', ws.reorder_quantity
        ) ORDER BY p.name, ws.id) FILTER (WHERE ws.id IS NOT NULL) AS stock
      FROM warehouses w
      LEFT JOIN warehouse_stock ws ON ws.warehouse_id = w.id
      LEFT JOIN products p ON p.id = ws.product_id
      GROUP BY w.id ORDER BY w.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create warehouse
router.post('/', async (req, res) => {
  const { name, ship_cost_weight = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO warehouses (name, ship_cost_weight) VALUES ($1,$2) RETURNING *',
      [name, ship_cost_weight]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH update warehouse
router.patch('/:id', async (req, res) => {
  const { name, ship_cost_weight } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE warehouses SET name=COALESCE($1,name), ship_cost_weight=COALESCE($2,ship_cost_weight) WHERE id=$3 RETURNING *',
      [name, ship_cost_weight, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE warehouse
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM warehouses WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Stock endpoints ──────────────────────────────────────────────────────────

// POST upsert stock for a product in a warehouse
router.post('/:id/stock', async (req, res) => {
  const { product_id, quantity_on_hand = 0, reorder_threshold, reorder_quantity } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO warehouse_stock (warehouse_id, product_id, quantity_on_hand, reorder_threshold, reorder_quantity)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (warehouse_id, product_id)
       DO UPDATE SET quantity_on_hand=$3, reorder_threshold=$4, reorder_quantity=$5
       RETURNING *`,
      [req.params.id, product_id, quantity_on_hand, reorder_threshold, reorder_quantity]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH update stock quantity
router.patch('/:id/stock/:stockId', async (req, res) => {
  const { quantity_on_hand, reorder_threshold, reorder_quantity } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE warehouse_stock SET
        quantity_on_hand=COALESCE($1,quantity_on_hand),
        reorder_threshold=COALESCE($2,reorder_threshold),
        reorder_quantity=COALESCE($3,reorder_quantity)
       WHERE id=$4 AND warehouse_id=$5 RETURNING *`,
      [quantity_on_hand, reorder_threshold, reorder_quantity, req.params.stockId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE stock line
router.delete('/:id/stock/:stockId', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM warehouse_stock WHERE id=$1 AND warehouse_id=$2',
      [req.params.stockId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Stock line not found' });
    res.json({ message: 'Stock line deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
