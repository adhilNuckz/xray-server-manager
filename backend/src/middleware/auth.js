function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Authentication required' });
}

// Double-submit CSRF check for state-changing requests. The token is issued
// server-side (stored in the session) after login and must be echoed back
// in the X-CSRF-Token header for POST/PUT/DELETE requests.
function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const header = req.get('x-csrf-token');
  if (!req.session || !req.session.csrfToken || header !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  return next();
}

module.exports = { requireAuth, requireCsrf };
