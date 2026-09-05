// src/middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Reads JWT from httpOnly cookie 'token'.
 * Attaches decoded payload to req.user.
 */
function authenticate(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role } for internal users; { customerId } for portal
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Restrict to specific internal roles.
 * Pass one or more roles as strings.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

/**
 * Restrict to authenticated customers (portal).
 */
function requireCustomer(req, res, next) {
  if (!req.user || !req.user.customerId) {
    return res.status(403).json({ error: 'Forbidden: customer access required' });
  }
  next();
}

module.exports = { authenticate, requireRole, requireCustomer };
