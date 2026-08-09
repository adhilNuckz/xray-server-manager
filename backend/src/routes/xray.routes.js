const express = require('express');
const ctrl = require('../controllers/xray.controller');
const { requireCsrf } = require('../middleware/auth');

const router = express.Router();

router.get('/status', ctrl.status);
router.post('/start', requireCsrf, ctrl.start);
router.post('/stop', requireCsrf, ctrl.stop);
router.post('/restart', requireCsrf, ctrl.restart);
router.post('/reload', requireCsrf, ctrl.reload);
router.post('/validate', requireCsrf, ctrl.validate);
router.get('/config', ctrl.getConfig);
router.put('/config', requireCsrf, ctrl.saveConfig);
router.post('/enable-access-log', requireCsrf, ctrl.enableAccessLog);

module.exports = router;
