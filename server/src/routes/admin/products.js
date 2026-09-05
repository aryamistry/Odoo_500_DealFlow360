// src/routes/admin/products.js
const express = require('express');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate, requireRole('admin', 'sales_rep', 'sales_manager', 'finance'));

// GET all products (with variants and category name)
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, c.name AS category_name, sp.name AS subscription_plan_name,
        COALESCE(json_agg(
          json_build_object('id',pv.id,'attribute_name',pv.attribute_name,'value',pv.value,'extra_price',pv.extra_price)
        ) FILTER (WHERE pv.id IS NOT NULL), '[]') AS variants
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN subscription_plans sp ON sp.id = p.subscription_plan_id
      LEFT JOIN product_variant_values pv ON pv.product_id = p.id
      GROUP BY p.id, c.name, sp.name
      ORDER BY p.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single product
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, c.name AS category_name, sp.name AS subscription_plan_name,
        COALESCE(json_agg(
          json_build_object('id',pv.id,'attribute_name',pv.attribute_name,'value',pv.value,'extra_price',pv.extra_price)
        ) FILTER (WHERE pv.id IS NOT NULL), '[]') AS variants
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN subscription_plans sp ON sp.id = p.subscription_plan_id
      LEFT JOIN product_variant_values pv ON pv.product_id = p.id
      WHERE p.id = $1
      GROUP BY p.id, c.name, sp.name
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create product
router.post('/', async (req, res) => {
  const { name, category_id, unit = 'Each', price, cost_price, tax_pct = 0, description, subscription_plan_id, status = 'active' } = req.body;
  if (!name || !category_id || price == null || cost_price == null)
    return res.status(400).json({ error: 'name, category_id, price, cost_price required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO products (name,category_id,unit,price,cost_price,tax_pct,description,subscription_plan_id,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, category_id, unit, price, cost_price, tax_pct, description, subscription_plan_id || null, status]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH update product
router.patch('/:id', async (req, res) => {
  const { name, category_id, unit, price, cost_price, tax_pct, description, subscription_plan_id, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE products SET
        name=COALESCE($1,name), category_id=COALESCE($2,category_id), unit=COALESCE($3,unit),
        price=COALESCE($4,price), cost_price=COALESCE($5,cost_price), tax_pct=COALESCE($6,tax_pct),
        description=COALESCE($7,description), subscription_plan_id=COALESCE($8,subscription_plan_id),
        status=COALESCE($9::product_status,status)
       WHERE id=$10 RETURNING *`,
      [name, category_id, unit, price, cost_price, tax_pct, description, subscription_plan_id, status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE product
router.delete('/:id', async (req, res) => {
  try {
    await pool.query("UPDATE products SET status='archived' WHERE id=$1", [req.params.id]);
    res.json({ message: 'Archived' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Variants ─────────────────────────────────────────────────────────────────

router.get('/:id/variants', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM product_variant_values WHERE product_id=$1 ORDER BY attribute_name, value', [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/variants', async (req, res) => {
  const { attribute_name, value, extra_price = 0 } = req.body;
  if (!attribute_name || !value) return res.status(400).json({ error: 'attribute_name and value required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO product_variant_values (product_id,attribute_name,value,extra_price) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, attribute_name, value, extra_price]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/variants/:variantId', async (req, res) => {
  const { attribute_name, value, extra_price } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE product_variant_values SET attribute_name=COALESCE($1,attribute_name), value=COALESCE($2,value), extra_price=COALESCE($3,extra_price) WHERE id=$4 AND product_id=$5 RETURNING *',
      [attribute_name, value, extra_price, req.params.variantId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/variants/:variantId', async (req, res) => {
  try {
    await pool.query('DELETE FROM product_variant_values WHERE id=$1 AND product_id=$2', [req.params.variantId, req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
