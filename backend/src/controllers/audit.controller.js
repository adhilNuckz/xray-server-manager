const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/audit.service');

const list = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  res.json({ logs: audit.recent(limit) });
});

module.exports = { list };
