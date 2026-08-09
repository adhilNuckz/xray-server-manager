// Background jobs:
//  1. Auto-excludes expired clients from the live Xray config once their
//     expiration date passes (requirement #7).
//  2. Detects (but - see README limitations - cannot forcibly enforce)
//     more simultaneous connections per client than the configured maximum
//     (requirement #8), logging an audit warning when it happens.
const clientsService = require('./clients.service');
const xrayConfig = require('./xrayConfig.service');
const { findVlessInbounds } = require('../utils/vlessLink');
const connections = require('./connections.service');
const settings = require('./settings.service');
const audit = require('./audit.service');

const lastViolationNotice = new Map();
const VIOLATION_COOLDOWN_MS = 5 * 60 * 1000;

async function checkExpiredClients() {
  try {
    if (!xrayConfig.configExists()) return;
    const config = xrayConfig.readConfig();
    const inbounds = findVlessInbounds(config);
    if (inbounds.length === 0) return;

    // Union of client ids across all VLESS inbounds - any inbound missing
    // a client that should be active (or still containing one that
    // shouldn't be) triggers a full resync of every inbound.
    const currentIds = new Set();
    inbounds.forEach((inbound) => (inbound.settings.clients || []).forEach((c) => currentIds.add(c.id)));
    const shouldBeActive = clientsService.listClients().filter(clientsService.isEffectivelyActive);
    const shouldBeActiveIds = new Set(shouldBeActive.map((c) => c.id));

    const same =
      currentIds.size === shouldBeActiveIds.size && [...currentIds].every((id) => shouldBeActiveIds.has(id));
    if (same) return;

    const removedIds = [...currentIds].filter((id) => !shouldBeActiveIds.has(id));
    await clientsService.applyClientsToConfig();
    if (removedIds.length) {
      audit.log('system', 'clients_auto_expired', { removedIds }, null);
    }
  } catch (err) {
    console.error('[monitor] failed to sync expired clients:', err.message);
  }
}

function checkConcurrentConnections() {
  try {
    const maxSetting = settings.get('max_connections_per_client', '1');
    if (maxSetting === 'unlimited') return;
    const max = parseInt(maxSetting, 10) || 1;
    const counts = connections.getActiveConnectionCounts();
    const now = Date.now();
    Object.entries(counts).forEach(([email, count]) => {
      if (count > max) {
        const last = lastViolationNotice.get(email) || 0;
        if (now - last > VIOLATION_COOLDOWN_MS) {
          lastViolationNotice.set(email, now);
          audit.log('system', 'multi_device_suspected', { email, activeSources: count, max }, null);
        }
      }
    });
  } catch (err) {
    console.error('[monitor] failed to check concurrent connections:', err.message);
  }
}

function start() {
  checkExpiredClients();
  const t1 = setInterval(checkExpiredClients, 60 * 1000);
  t1.unref();
  const t2 = setInterval(checkConcurrentConnections, 30 * 1000);
  t2.unref();
}

module.exports = { start };
