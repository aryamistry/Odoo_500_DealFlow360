// src/routes/admin/customers.js
// Customer CRUD — Phase 12 (Customer Management)
//
// Accessible to admin, sales_manager, and sales_rep so that reps can
// create customers inline while building quotations.

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin', 'sales_manager', 'sales_rep'));

// ── GET /api/admin/customers ──────────────────────────────────────────────────
// Returns all customers joined with their tier's max_discount_pct.
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.company_name, c.email, c.tier,
             c.tier AS tier_name, c.tier AS tier_id,
             c.created_at,
             ct.max_discount_pct AS tier_max_discount_pct
      FROM customers c
      JOIN customer_tiers ct ON ct.tier = c.tier
      ORDER BY c.company_name
    `);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── POST /api/admin/customers ─────────────────────────────────────────────────
// Create a new customer.
// Body: { company_name, email, tier (or tier_name / tier_id), password }
// password is optional — if omitted the customer can still log in via
// admin-issued credentials later (password_hash will be null).
router.post('/', async (req, res) => {
  const { company_name, email, password } = req.body;
  const tier = req.body.tier || req.body.tier_name || req.body.tier_id;

  if (!company_name || !company_name.trim())
    return res.status(400).json({ error: 'company_name is required' });
  if (!email || !email.trim())
    return res.status(400).json({ error: 'email is required' });
  if (!tier)
    return res.status(400).json({ error: 'tier is required' });

  try {
    // Validate tier exists in customer_tiers
    const { rows: tierRows } = await pool.query(
      'SELECT tier FROM customer_tiers WHERE tier = $1',
      [tier]
    );
    if (!tierRows.length)
      return res.status(400).json({ error: `Tier '${tier}' does not exist` });

    // Hash password if supplied; otherwise store null (portal login will fail gracefully)
    const password_hash = password ? await bcrypt.hash(password, 12) : null;

    const { rows } = await pool.query(
      `INSERT INTO customers (company_name, email, password_hash, tier)
       VALUES ($1, $2, $3, $4)
       RETURNING id, company_name, email, tier, created_at`,
      [company_name.trim(), email.trim().toLowerCase(), password_hash, tier]
    );

    // Enrich with tier metadata for immediate UI use
    const { rows: [ct] } = await pool.query(
      'SELECT max_discount_pct AS tier_max_discount_pct FROM customer_tiers WHERE tier=$1',
      [tier]
    );
    res.status(201).json({
      ...rows[0],
      tier_name: rows[0].tier,
      tier_id: rows[0].tier,
      tier_max_discount_pct: ct.tier_max_discount_pct
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error(err); res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/customers/:id ───────────────────────────────────────────
// Edit company_name and/or tier only.
// (Email changes are intentionally blocked — email is used for portal login identity.)
router.patch('/:id', async (req, res) => {
  const { company_name } = req.body;
  const tier = req.body.tier || req.body.tier_name || req.body.tier_id;
  if (!company_name && !tier)
    return res.status(400).json({ error: 'Provide company_name or tier to update' });

  try {
    // Validate tier if provided
    if (tier) {
      const { rows: tierRows } = await pool.query(
        'SELECT tier FROM customer_tiers WHERE tier = $1', [tier]
      );
      if (!tierRows.length)
        return res.status(400).json({ error: `Tier '${tier}' does not exist` });
    }

    const updates = [];
    const params = [];
    let i = 1;
    if (company_name) { updates.push(`company_name = $${i++}`); params.push(company_name.trim()); }
    if (tier)         { updates.push(`tier = $${i++}`); params.push(tier); }
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE customers SET ${updates.join(', ')} WHERE id = $${i}
       RETURNING id, company_name, email, tier, created_at`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });

    // Enrich with tier metadata
    const { rows: [ct] } = await pool.query(
      'SELECT max_discount_pct AS tier_max_discount_pct FROM customer_tiers WHERE tier=$1',
      [rows[0].tier]
    );
    res.json({
      ...rows[0],
      tier_name: rows[0].tier,
      tier_id: rows[0].tier,
      tier_max_discount_pct: ct.tier_max_discount_pct
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
