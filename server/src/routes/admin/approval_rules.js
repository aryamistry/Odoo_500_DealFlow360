// src/routes/admin/approval_rules.js
const express = require('express');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate, requireRole('admin'));

// GET all approval rules (low/medium/high — pre-seeded)
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM approval_rules ORDER BY CASE risk_level WHEN 'low' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH update a rule (edit only — rows are pre-seeded)
router.patch('/:id', async (req, res) => {
  const { requires_manager_approval, requires_finance_approval } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE approval_rules
       SET requires_manager_approval = COALESCE($1, requires_manager_approval),
           requires_finance_approval = COALESCE($2, requires_finance_approval)
       WHERE id = $3 RETURNING *`,
      [requires_manager_approval, requires_finance_approval, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
