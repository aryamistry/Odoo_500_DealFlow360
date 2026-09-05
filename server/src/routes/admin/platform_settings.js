// src/routes/admin/platform_settings.js
// Gap 4: Configurable platform settings (e.g., stalled_deal_days)
const express = require('express');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate, requireRole('admin'));

// GET /admin/platform-settings — list all settings
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM platform_settings ORDER BY key');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /admin/platform-settings/:key — update a setting value
router.patch('/:key', async (req, res) => {
  const { value } = req.body;
  if (value === undefined || value === null || String(value).trim() === '') {
    return res.status(400).json({ error: 'value is required' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE platform_settings SET value=$1, updated_at=now() WHERE key=$2 RETURNING *`,
      [String(value).trim(), req.params.key]
    );
    if (!rows.length) return res.status(404).json({ error: `Setting '${req.params.key}' not found` });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
