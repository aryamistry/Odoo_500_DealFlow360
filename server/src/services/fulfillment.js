// src/services/fulfillment.js
// Phase 6 — Fulfillment & Warehouse Split Algorithm

const pool = require('../db');

/**
 * Split fulfillment for all lines of an approved quotation.
 * Algorithm: for each line, pick warehouses with available stock,
 * ordered by ship_cost_weight ASC (cheapest first), minimizing shipment count.
 * Writes fulfillment_lines rows and decrements warehouse_stock.
 *
 * @param {number} quotationId
 */
async function splitFulfillment(quotationId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check: prevent duplicate fulfillment splitting and stock decrementing
    const { rows: existingFulfillments } = await client.query(
      `SELECT fl.id FROM fulfillment_lines fl
       JOIN quotation_lines ql ON ql.id = fl.quotation_line_id
       WHERE ql.quotation_id = $1 LIMIT 1`,
      [quotationId]
    );
    if (existingFulfillments.length > 0) {
      await client.query('ROLLBACK');
      return { alreadyExists: true };
    }

    // Get only physical (non-subscription) lines for this quotation.
    // Subscription-linked products are digital and must NOT enter warehouse stock or backorder flows.
    const { rows: lines } = await client.query(
      `SELECT ql.id, ql.product_id, ql.quantity
       FROM quotation_lines ql
       JOIN products p ON p.id = ql.product_id
       WHERE ql.quotation_id = $1
         AND p.subscription_plan_id IS NULL`,
      [quotationId]
    );

    for (const line of lines) {
      let remaining = line.quantity;

      // Get warehouses with stock for this product, ordered by cheapest shipping first
      const { rows: stocks } = await client.query(
        `SELECT ws.id AS stock_id, ws.warehouse_id, ws.quantity_on_hand, w.ship_cost_weight
         FROM warehouse_stock ws
         JOIN warehouses w ON w.id = ws.warehouse_id
         WHERE ws.product_id = $1 AND ws.quantity_on_hand > 0
         ORDER BY w.ship_cost_weight ASC, ws.quantity_on_hand DESC`,
        [line.product_id]
      );

      for (const stock of stocks) {
        if (remaining <= 0) break;

        const fulfillQty = Math.min(remaining, stock.quantity_on_hand);
        remaining -= fulfillQty;

        // Insert fulfillment line
        await client.query(
          `INSERT INTO fulfillment_lines (quotation_line_id, warehouse_id, quantity_fulfilled, is_backorder)
           VALUES ($1,$2,$3,false)`,
          [line.id, stock.warehouse_id, fulfillQty]
        );

        // Decrement stock
        await client.query(
          'UPDATE warehouse_stock SET quantity_on_hand = quantity_on_hand - $1 WHERE id=$2',
          [fulfillQty, stock.stock_id]
        );
      }

      // Any remaining quantity is backordered
      if (remaining > 0) {
        // Find the cheapest warehouse (even if 0 stock) for backorder assignment
        const { rows: anyWh } = await client.query(
          'SELECT id FROM warehouses ORDER BY ship_cost_weight ASC LIMIT 1'
        );
        if (anyWh.length) {
          await client.query(
            `INSERT INTO fulfillment_lines (quotation_line_id, warehouse_id, quantity_fulfilled, is_backorder)
             VALUES ($1,$2,$3,true)`,
            [line.id, anyWh[0].id, remaining]
          );
        }
      }
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { splitFulfillment };
