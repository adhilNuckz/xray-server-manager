const express = require('express');
const ctrl = require('../controllers/backups.controller');
const { requireCsrf } = require('../middleware/auth');

const router = express.Router();

router.get('/', ctrl.list);
router.post('/', requireCsrf, ctrl.create);
router.get('/:id', ctrl.view);
router.post('/:id/restore', requireCsrf, ctrl.restore);
router.delete('/:id', requireCsrf, ctrl.remove);

module.exports = router;
