// src/services/governance.js
// Phase 5 — Discount Governance & Approval Routing
// Called on every quote submission and after every negotiation resolution.

const pool = require('../db');

/**
 * Compute risk level for a quotation.
 * Per-line: compare discount_pct against MIN(category.max_discount_pct, tier.max_discount_pct)
 * Blended breach score determines low/medium/high.
 *
 * Returns: { risk_level: 'low'|'medium'|'high', totalBreachPct: Number }
 */
async function evaluateRisk(quotationId) {
  // Get all lines with their category ceiling and tier ceiling
  const { rows: lines } = await pool.query(
    `SELECT
        ql.id,
        ql.discount_pct,
        c.max_discount_pct  AS category_ceiling,
        ct.max_discount_pct AS tier_ceiling
     FROM quotation_lines ql
     JOIN products p ON p.id = ql.product_id
     JOIN categories c ON c.id = p.category_id
     JOIN quotations q ON q.id = ql.quotation_id
     JOIN customers cu ON cu.id = q.customer_id
     JOIN customer_tiers ct ON ct.tier = cu.tier
     WHERE ql.quotation_id = $1`,
    [quotationId]
  );

  let totalBreachPct = 0;
  for (const line of lines) {
    const ceiling = Math.min(
      parseFloat(line.category_ceiling),
      parseFloat(line.tier_ceiling)
    );
    const breach = Math.max(0, parseFloat(line.discount_pct) - ceiling);
    totalBreachPct += breach;
  }

  let risk_level;
  if (totalBreachPct === 0) risk_level = 'low';
  else if (totalBreachPct <= 10) risk_level = 'medium';
  else risk_level = 'high';

  // Freeze the risk_level snapshot on the quotation
  await pool.query('UPDATE quotations SET risk_level=$1 WHERE id=$2', [risk_level, quotationId]);

  return { risk_level, totalBreachPct };
}

/**
 * Create approval steps based on the quotation's risk_level.
 * Looks up approval_rules, inserts approval_steps rows.
 *
 * Returns: { stepsCreated: Number }
 */
async function routeApproval(quotationId, risk_level) {
  const { rows: rules } = await pool.query(
    'SELECT * FROM approval_rules WHERE risk_level=$1',
    [risk_level]
  );
  const rule = rules[0];
  if (!rule) return { stepsCreated: 0 };

  // Get the max current step_order for this quotation (supports resubmissions)
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(step_order), 0) AS max_order FROM approval_steps WHERE quotation_id=$1',
    [quotationId]
  );
  let stepOrder = parseInt(maxRows[0].max_order);

  const stepsToCreate = [];
  if (rule.requires_manager_approval) {
    stepsToCreate.push({ role: 'sales_manager', order: ++stepOrder });
  }
  if (rule.requires_finance_approval) {
    stepsToCreate.push({ role: 'finance', order: ++stepOrder });
  }

  for (const step of stepsToCreate) {
    await pool.query(
      'INSERT INTO approval_steps (quotation_id, step_order, approver_role, status) VALUES ($1,$2,$3,$4)',
      [quotationId, step.order, step.role, 'pending']
    );
  }

  return { stepsCreated: stepsToCreate.length };
}

/**
 * Full submission pipeline:
 *  1. evaluateRisk → determine risk_level
 *  2. routeApproval → create approval_steps
 *  3. Update quotations.status appropriately
 *  4. Insert quotation_activity_log row
 *
 * @param {number} quotationId
 * @param {number} actorUserId - the rep submitting
 */
async function submitForApproval(quotationId, actorUserId) {
  const { risk_level } = await evaluateRisk(quotationId);
  const { stepsCreated } = await routeApproval(quotationId, risk_level);

  const newStatus = stepsCreated > 0 ? 'pending_approval' : 'approved';
  const approvedAt = stepsCreated === 0 ? new Date() : null;

  await pool.query(
    `UPDATE quotations SET status=$1, submitted_at=now() ${approvedAt ? ', approved_at=now()' : ''} WHERE id=$2`,
    [newStatus, quotationId]
  );

  // Log the submission
  await pool.query(
    `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, note)
     VALUES ($1, 'submitted', $2, $3)`,
    [quotationId, actorUserId, `Risk level: ${risk_level}. Steps created: ${stepsCreated}`]
  );

  return { risk_level, stepsCreated, newStatus };
}

/**
 * Re-run governance after negotiation resolution.
 * If new risk warrants approval → flip status back to pending_approval.
 */
async function reEvaluateAfterNegotiation(quotationId, actorUserId) {
  const { risk_level } = await evaluateRisk(quotationId);
  const { stepsCreated } = await routeApproval(quotationId, risk_level);

  if (stepsCreated > 0) {
    await pool.query(
      "UPDATE quotations SET status='pending_approval' WHERE id=$1",
      [quotationId]
    );
    await pool.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, note)
       VALUES ($1, 'submitted', $2, $3)`,
      [quotationId, actorUserId, `Reapproval triggered after negotiation resolution. Risk: ${risk_level}`]
    );
  } else {
    // Bug 1 fix: no new approval steps needed → quote is now approved.
    // Without this, the quotation stays in 'under_negotiation' forever and
    // the customer can never call POST /portal/quotations/:id/confirm.
    await pool.query(
      "UPDATE quotations SET status='approved', approved_at=now() WHERE id=$1",
      [quotationId]
    );
    await pool.query(
      `INSERT INTO quotation_activity_log (quotation_id, action, actor_user_id, note)
       VALUES ($1, 'approved', $2, $3)`,
      [quotationId, actorUserId, `Auto-approved after negotiation resolution. Risk: ${risk_level}. No ceiling breaches.`]
    );
  }

  return { risk_level, stepsCreated };
}

module.exports = { evaluateRisk, routeApproval, submitForApproval, reEvaluateAfterNegotiation };
