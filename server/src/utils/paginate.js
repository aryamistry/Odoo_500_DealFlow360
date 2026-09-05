// src/utils/paginate.js
// Shared pagination helper for DealFlow360 list endpoints.
//
// BACKWARD COMPATIBILITY GUARANTEE:
//   - If req.query.page is NOT present  -> returns plain array (tests pass)
//   - If req.query.page IS present       -> returns { data, total, page, totalPages, limit }

function getPaginationParams(req) {
  const rawPage  = req.query.page;
  const rawLimit = req.query.limit;

  const isPaginated = rawPage !== undefined;
  const page  = Math.max(1, parseInt(rawPage, 10)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(rawLimit, 10) || 25));
  const offset = (page - 1) * limit;

  return { page, limit, offset, isPaginated };
}

function sendPaginated(res, rows, { page, limit, total, isPaginated }) {
  if (!isPaginated) {
    return res.json(rows);
  }
  const totalPages = Math.ceil(total / limit) || 1;
  return res.json({ data: rows, total, page, totalPages, limit });
}

module.exports = { getPaginationParams, sendPaginated };
