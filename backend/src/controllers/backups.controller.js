const asyncHandler = require('../utils/asyncHandler');
const xrayConfig = require('../services/xrayConfig.service');
const clientsService = require('../services/clients.service');
const audit = require('../services/audit.service');

function actor(req) {
  return req.session.user.username;
}

const list = asyncHandler(async (req, res) => {
  res.json({ backups: xrayConfig.listBackups() });
});

const create = asyncHandler(async (req, res) => {
  const backup = xrayConfig.createBackup();
  audit.log(actor(req), 'backup_created', backup, req.ip);
  res.status(201).json({ backup });
});

const view = asyncHandler(async (req, res) => {
  try {
    const content = xrayConfig.readBackup(req.params.id);
    res.json({ id: req.params.id, content });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

const restore = asyncHandler(async (req, res) => {
  try {
    const result = await xrayConfig.restoreBackup(req.params.id);
    clientsService.reconcileFromConfig();
    audit.log(actor(req), 'backup_restored', { id: req.params.id, newBackup: result.backup }, req.ip);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.validation) return res.status(422).json({ error: err.message, validation: err.validation });
    res.status(500).json({ error: err.message });
  }
});

const remove = asyncHandler(async (req, res) => {
  try {
    xrayConfig.deleteBackup(req.params.id);
    audit.log(actor(req), 'backup_deleted', { id: req.params.id }, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = { list, create, view, restore, remove };
