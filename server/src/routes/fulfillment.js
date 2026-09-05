// src/routes/fulfillment.js
// Phase 6 — Fulfillment & Warehouse Split

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { splitFulfillment } = require('../services/fulfillment');

const router = express.Router();
router.use(authenticate);

// ── Fulfillment List ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT q.id AS quotation_id, q.quote_number, c.company_name AS customer_name, q.status,
             -- Derived fulfillment status (not stored)
             CASE
               WHEN EXISTS(SELECT 1 FROM fulfillment_lines fl JOIN quotation_lines ql ON ql.id=fl.quotation_line_id WHERE ql.quotation_id=q.id AND fl.is_backorder=true) THEN 'backordered'
               WHEN COALESCE((SELECT SUM(fl.quantity_fulfilled) FROM fulfillment_lines fl JOIN quotation_lines ql ON ql.id=fl.quotation_line_id WHERE ql.quotation_id=q.id),0) >= COALESCE((SELECT SUM(ql2.quantity) FROM quotation_lines ql2 WHERE ql2.quotation_id=q.id),0) THEN 'fulfilled'
               WHEN EXISTS(SELECT 1 FROM fulfillment_lines fl2 JOIN quotation_lines ql2 ON ql2.id=fl2.quotation_line_id WHERE ql2.quotation_id=q.id) THEN 'partial'
               ELSE 'pending'
             END AS fulfillment_status
      FROM quotations q
      JOIN customers c ON c.id=q.customer_id
      WHERE q.status IN ('approved','confirmed')
      ORDER BY q.updated_at DESC
    `);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Fulfillment Detail ────────────────────────────────────────────────────────
router.get('/:quotationId', async (req, res) => {
  try {
    const { rows: lines } = await pool.query(`
      SELECT ql.id AS line_id, p.name AS product_name, ql.quantity AS ordered_qty,
             COALESCE(json_agg(json_build_object(
               'fulfillment_id', fl.id,
               'warehouse_id', fl.warehouse_id,
               'warehouse_name', w.name,
               'quantity_fulfilled', fl.quantity_fulfilled,
               'is_backorder', fl.is_backorder,
               'shipped_at', fl.shipped_at
             ) ORDER BY fl.id) FILTER (WHERE fl.id IS NOT NULL), '[]') AS fulfillment_lines,
             COALESCE(SUM(fl.quantity_fulfilled), 0) AS total_fulfilled,
             ql.quantity - COALESCE(SUM(CASE WHEN fl.is_backorder=false THEN fl.quantity_fulfilled ELSE 0 END), 0) AS remaining
      FROM quotation_lines ql
      JOIN products p ON p.id=ql.product_id
      LEFT JOIN fulfillment_lines fl ON fl.quotation_line_id=ql.id
      LEFT JOIN warehouses w ON w.id=fl.warehouse_id
      WHERE ql.quotation_id=$1
      GROUP BY ql.id, p.name, ql.quantity
      ORDER BY ql.id
    `, [req.params.quotationId]);

    res.json({ quotation_id: req.params.quotationId, lines });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Trigger Split ─────────────────────────────────────────────────────────────
router.post('/:quotationId/split', requireRole('admin', 'sales_manager', 'finance'), async (req, res) => {
  try {
    const result = await splitFulfillment(parseInt(req.params.quotationId));
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Manual Override: delete + re-insert fulfillment lines ─────────────────────
router.put('/:quotationId/override', requireRole('admin', 'sales_manager'), async (req, res) => {
  const { line_id, overrides } = req.body; // overrides: [{warehouse_id, quantity_fulfilled}]
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM fulfillment_lines WHERE quotation_line_id=$1', [line_id]);
    for (const ov of overrides) {
      await client.query(
        'INSERT INTO fulfillment_lines (quotation_line_id, warehouse_id, quantity_fulfilled, is_backorder) VALUES ($1,$2,$3,false)',
        [line_id, ov.warehouse_id, ov.quantity_fulfilled]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Override applied' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Consolidate Backorder ─────────────────────────────────────────────────────
router.post('/:quotationId/consolidate', requireRole('admin', 'sales_manager'), async (req, res) => {
  const { line_id, warehouse_id, quantity } = req.body;
  try {
    await pool.query(
      'INSERT INTO fulfillment_lines (quotation_line_id, warehouse_id, quantity_fulfilled, is_backorder) VALUES ($1,$2,$3,false)',
      [line_id, warehouse_id, quantity]
    );
    res.json({ message: 'Backorder consolidated' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
