const express = require('express');
const ctrl = require('../controllers/clients.controller');
const { requireCsrf } = require('../middleware/auth');

const router = express.Router();

router.get('/', ctrl.list);
router.post('/', requireCsrf, ctrl.create);
router.get('/:id', ctrl.getOne);
router.put('/:id', requireCsrf, ctrl.update);
router.delete('/:id', requireCsrf, ctrl.remove);
router.post('/:id/enable', requireCsrf, ctrl.enable);
router.post('/:id/disable', requireCsrf, ctrl.disable);
router.get('/:id/vless', ctrl.vless);

module.exports = router;
