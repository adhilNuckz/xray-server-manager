const express = require('express');
const ctrl = require('../controllers/stats.controller');
const { requireCsrf } = require('../middleware/auth');

const router = express.Router();

router.get('/', ctrl.overview);
router.get('/traffic', ctrl.trafficHistory);
router.get('/stream', ctrl.stream);
router.post('/enable-stats-api', requireCsrf, ctrl.enableStatsApi);

module.exports = router;
