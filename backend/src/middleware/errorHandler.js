function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Centralized error handler. Never leaks stack traces to the client.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);
  if (err.stack && process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
}

module.exports = { notFoundHandler, errorHandler };
