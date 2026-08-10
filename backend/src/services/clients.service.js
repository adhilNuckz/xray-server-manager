const crypto = require('crypto');
const db = require('../database/db');
const env = require('../config/env');
const xrayConfig = require('./xrayConfig.service');
const { findVlessInbounds, supportsFlow, describeInbound, buildVlessLink } = require('../utils/vlessLink');
const { isValidEmail, isValidDate, isValidUUID, isValidSni } = require('../utils/validators');
const settingsService = require('./settings.service');

const nowIso = () => new Date().toISOString();

const stmts = {
  insert: db.prepare(`
    INSERT INTO clients (id, name, email, flow, notes, sni, enabled, expires_at, created_at, updated_at, imported)
    VALUES (@id, @name, @email, @flow, @notes, @sni, @enabled, @expires_at, @created_at, @updated_at, @imported)
  `),
  update: db.prepare(`
    UPDATE clients SET name=@name, email=@email, flow=@flow, notes=@notes, sni=@sni,
      expires_at=@expires_at, updated_at=@updated_at WHERE id=@id
  `),
  setEnabled: db.prepare(`UPDATE clients SET enabled=@enabled, updated_at=@updated_at WHERE id=@id`),
  delete: db.prepare(`DELETE FROM clients WHERE id=?`),
  getById: db.prepare(`SELECT * FROM clients WHERE id=?`),
  getByEmail: db.prepare(`SELECT * FROM clients WHERE email=?`),
  all: db.prepare(`SELECT * FROM clients ORDER BY created_at DESC`),
};

function normalizeClientSni(sni) {
  if (sni === undefined || sni === null || sni === '') return '';
  if (!isValidSni(sni)) throw Object.assign(new Error('Invalid data pack / server name (SNI)'), { status: 400 });
  const cleaned = String(sni).trim().toLowerCase().replace(/:\d+$/, '');
  const allowed = settingsService.getRealityServerNames();
  if (cleaned && !allowed.includes(cleaned)) {
    throw Object.assign(
      new Error(`SNI "${cleaned}" is not in the allowed Reality server names. Add it in Settings first.`),
      { status: 400 }
    );
  }
  return cleaned;
}

function computeStatus(client) {
  if (!client.enabled) return 'DISABLED';
  if (client.expires_at) {
    const exp = new Date(client.expires_at + 'T23:59:59');
    const now = new Date();
    if (exp.getTime() < now.getTime()) return 'EXPIRED';
    const daysLeft = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 3) return 'EXPIRING_SOON';
  }
  return 'ACTIVE';
}

function isEffectivelyActive(client) {
  const status = computeStatus(client);
  return status === 'ACTIVE' || status === 'EXPIRING_SOON';
}

function toApiShape(row) {
  return { ...row, enabled: !!row.enabled, imported: !!row.imported, status: computeStatus(row) };
}

// Merges the `clients` arrays of every VLESS inbound into a single map
// keyed by UUID (a client sharing the same UUID across multiple inbounds -
// e.g. a Reality inbound + a WS+TLS fallback - is one logical client).
// Prefers whichever entry has an email/flow set if entries disagree.
function collectLiveClients(config) {
  const byId = new Map();
  for (const inbound of findVlessInbounds(config)) {
    for (const c of inbound.settings.clients || []) {
      if (!c.id) continue;
      const existing = byId.get(c.id);
      if (!existing) {
        byId.set(c.id, { id: c.id, email: c.email || null, flow: c.flow || null });
      } else {
        if (!existing.email && c.email) existing.email = c.email;
        if (!existing.flow && c.flow) existing.flow = c.flow;
      }
    }
  }
  return byId;
}

// Imports any VLESS clients already present in the live Xray config that the
// panel doesn't know about yet. Guarantees existing production clients are
// never lost when the panel takes over management of an existing server.
// Looks across ALL VLESS inbounds (a real deployment often has more than
// one - e.g. a Reality inbound and a WS+TLS fallback - sharing client UUIDs).
function importFromXrayConfig() {
  if (!xrayConfig.configExists()) return { imported: 0 };
  const config = xrayConfig.readConfig();
  const liveClients = collectLiveClients(config);
  let imported = 0;
  const ts = nowIso();
  for (const c of liveClients.values()) {
    const row = stmts.getById.get(c.id);
    if (row) continue;
    stmts.insert.run({
      id: c.id,
      name: c.email || `Imported ${c.id.slice(0, 8)}`,
      email: c.email || `${c.id.slice(0, 8)}@imported.local`,
      flow: c.flow || '',
      notes: 'Auto-imported from existing Xray configuration',
      sni: '',
      enabled: 1,
      expires_at: null,
      created_at: ts,
      updated_at: ts,
      imported: 1,
    });
    imported += 1;
  }
  return { imported };
}

// Reconciles the DB with whatever is actually in the live Xray config.
// Used after backup restore / raw config editor save, where config.json is
// the intentional source of truth for that operation.
function reconcileFromConfig() {
  if (!xrayConfig.configExists()) return;
  const config = xrayConfig.readConfig();
  const liveClients = collectLiveClients(config);
  const ts = nowIso();

  for (const c of liveClients.values()) {
    const row = stmts.getById.get(c.id);
    if (!row) {
      stmts.insert.run({
        id: c.id,
        name: c.email || `Imported ${c.id.slice(0, 8)}`,
        email: c.email || `${c.id.slice(0, 8)}@imported.local`,
        flow: c.flow || '',
        notes: 'Auto-imported after external configuration change',
        sni: '',
        enabled: 1,
        expires_at: null,
        created_at: ts,
        updated_at: ts,
        imported: 1,
      });
    } else if (!row.enabled) {
      stmts.setEnabled.run({ id: c.id, enabled: 1, updated_at: ts });
    }
  }

  for (const row of stmts.all.all()) {
    if (row.enabled && !liveClients.has(row.id)) {
      stmts.setEnabled.run({ id: row.id, enabled: 0, updated_at: ts });
    }
  }
}

// Returns true when every active panel client is present in EVERY VLESS
// inbound's clients array (same UUID set).
function isConfigInSyncWithDb() {
  if (!xrayConfig.configExists()) return true;
  const config = xrayConfig.readConfig();
  const inbounds = findVlessInbounds(config);
  if (inbounds.length === 0) return true;
  const activeIds = new Set(stmts.all.all().filter(isEffectivelyActive).map((c) => c.id));
  for (const inbound of inbounds) {
    const liveIds = new Set((inbound.settings.clients || []).map((c) => c.id).filter(Boolean));
    if (liveIds.size !== activeIds.size) return false;
    for (const id of activeIds) {
      if (!liveIds.has(id)) return false;
    }
  }
  return true;
}

// If the panel DB has active clients that are missing from config.json
// (e.g. after a partial write, or an older panel build that never reloaded
// Xray), push the DB client list into the live config and reload Xray.
async function ensureClientsSynced() {
  if (isConfigInSyncWithDb()) return { synced: true, wrote: false };
  const result = await applyClientsToConfig();
  return { synced: true, wrote: true, ...result };
}

function listClients() {
  return stmts.all.all().map(toApiShape);
}

function getClient(id) {
  const row = stmts.getById.get(id);
  return row ? toApiShape(row) : null;
}

// Rebuilds the `clients` array of EVERY VLESS inbound from the DB (only
// clients that are enabled and not expired are considered "live") and
// writes the result through the safe validate -> backup -> atomic-replace
// pipeline. A client's UUID/email is kept identical across all inbounds;
// the `flow` field is only included on inbounds whose transport supports
// it (raw TCP), since XTLS flow values are invalid over ws/grpc/h2.
async function applyClientsToConfig() {
  if (!xrayConfig.configExists()) {
    throw new Error(`Xray configuration not found at ${xrayConfig.CONFIG_PATH}`);
  }
  const config = xrayConfig.readConfig();
  const inbounds = findVlessInbounds(config);
  if (inbounds.length === 0) {
    throw new Error('No VLESS inbound found in Xray configuration - refusing to modify');
  }
  const activeClients = stmts.all.all().filter(isEffectivelyActive);
  const defaultFlow = settingsService.get('default_flow', 'xtls-rprx-vision');
  for (const inbound of inbounds) {
    const flowOk = supportsFlow(inbound);
    inbound.settings.clients = activeClients.map((c) => {
      // Match the working production shape: id + flow on Reality/TCP,
      // id only (no flow) on WS/TLS. Keep email for Stats API accounting.
      const entry = { id: c.id, email: c.email };
      if (flowOk) {
        entry.flow = c.flow || defaultFlow || 'xtls-rprx-vision';
      }
      return entry;
    });
  }
  // writeConfigSafely validates, backs up, atomically writes, then reloads Xray
  const result = await xrayConfig.writeConfigSafely(config);
  return result;
}

async function createClient({ name, email, expires_at, notes, flow, sni }) {
  if (!isValidEmail(email)) throw Object.assign(new Error('Invalid email/identifier'), { status: 400 });
  if (!isValidDate(expires_at)) throw Object.assign(new Error('Invalid expiration date'), { status: 400 });
  if (stmts.getByEmail.get(email)) throw Object.assign(new Error('A client with this email already exists'), { status: 409 });

  const defaultFlow = settingsService.get('default_flow', 'xtls-rprx-vision');
  const allowed = settingsService.getRealityServerNames();
  const resolvedSni = normalizeClientSni(sni !== undefined ? sni : allowed[0] || '');
  const id = crypto.randomUUID();
  const ts = nowIso();
  const row = {
    id,
    name: name || email,
    email,
    flow: flow !== undefined ? flow : defaultFlow,
    notes: notes || '',
    sni: resolvedSni,
    enabled: 1,
    expires_at: expires_at || null,
    created_at: ts,
    updated_at: ts,
    imported: 0,
  };

  stmts.insert.run(row);
  let applyResult;
  try {
    applyResult = await applyClientsToConfig();
  } catch (err) {
    stmts.delete.run(id); // rollback DB insert since config rejected the change
    throw err;
  }
  return {
    client: toApiShape(row),
    reloaded: applyResult.reloaded !== false,
    reloadError: applyResult.reloadError || null,
  };
}

async function updateClient(id, patch) {
  const existing = stmts.getById.get(id);
  if (!existing) throw Object.assign(new Error('Client not found'), { status: 404 });

  const next = {
    id,
    name: patch.name !== undefined ? patch.name : existing.name,
    email: patch.email !== undefined ? patch.email : existing.email,
    flow: patch.flow !== undefined ? patch.flow : existing.flow,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    sni: patch.sni !== undefined ? normalizeClientSni(patch.sni) : existing.sni || '',
    expires_at: patch.expires_at !== undefined ? patch.expires_at || null : existing.expires_at,
    updated_at: nowIso(),
  };

  if (!isValidEmail(next.email)) throw Object.assign(new Error('Invalid email/identifier'), { status: 400 });
  if (!isValidDate(next.expires_at)) throw Object.assign(new Error('Invalid expiration date'), { status: 400 });
  if (next.email !== existing.email && stmts.getByEmail.get(next.email)) {
    throw Object.assign(new Error('A client with this email already exists'), { status: 409 });
  }

  stmts.update.run(next);
  try {
    await applyClientsToConfig();
  } catch (err) {
    stmts.update.run({
      id: existing.id,
      name: existing.name,
      email: existing.email,
      flow: existing.flow,
      notes: existing.notes,
      sni: existing.sni || '',
      expires_at: existing.expires_at,
      updated_at: existing.updated_at,
    });
    throw err;
  }
  return getClient(id);
}

async function setEnabled(id, enabled) {
  const existing = stmts.getById.get(id);
  if (!existing) throw Object.assign(new Error('Client not found'), { status: 404 });
  stmts.setEnabled.run({ id, enabled: enabled ? 1 : 0, updated_at: nowIso() });
  try {
    await applyClientsToConfig();
  } catch (err) {
    stmts.setEnabled.run({ id, enabled: existing.enabled, updated_at: existing.updated_at });
    throw err;
  }
  return getClient(id);
}

async function deleteClient(id) {
  const existing = stmts.getById.get(id);
  if (!existing) throw Object.assign(new Error('Client not found'), { status: 404 });
  stmts.delete.run(id);
  try {
    await applyClientsToConfig();
  } catch (err) {
    stmts.insert.run({ ...existing, sni: existing.sni || '', notes: existing.notes || '' }); // rollback
    throw err;
  }
  return true;
}

// Returns one VLESS link per VLESS inbound defined in the config (a real
// deployment commonly has more than one, e.g. a primary Reality inbound and
// a WS+TLS fallback, sharing the same client UUID).
async function getVlessLink(id) {
  const client = stmts.getById.get(id);
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });

  // Never hand out a share link for a UUID that is not actually loaded in
  // Xray — that was the "link looks fine but does not connect" failure mode.
  await ensureClientsSynced();

  const config = xrayConfig.readConfig();
  const inbounds = findVlessInbounds(config);
  if (inbounds.length === 0) throw new Error('No VLESS inbound found in Xray configuration');

  const liveIds = collectLiveClients(config);
  if (isEffectivelyActive(client) && !liveIds.has(client.id)) {
    throw Object.assign(
      new Error('Client is not present in the live Xray config after sync — check Xray service status'),
      { status: 500 }
    );
  }

  const serverAddress = settingsService.get('server_address', env.SERVER_ADDRESS) || env.SERVER_ADDRESS;
  const defaultFlow = settingsService.get('default_flow', 'xtls-rprx-vision');

  const links = await Promise.all(
    inbounds.map(async (inbound) => {
      let publicKey = null;
      const security = inbound.streamSettings && inbound.streamSettings.security;
      const rs = inbound.streamSettings && inbound.streamSettings.realitySettings;
      const allowed = rs && Array.isArray(rs.serverNames) ? rs.serverNames : [];
      if (security === 'reality') {
        const priv = rs && rs.privateKey;
        publicKey = await xrayConfig.getRealityPublicKey(priv);
      }
      const preferred = client.sni || '';
      const inboundSni =
        security === 'reality'
          ? (preferred && allowed.includes(preferred) ? preferred : allowed[0] || null)
          : null;
      // Build link with an effective client SNI for THIS inbound so each
      // Reality pack link uses a name that belongs to that inbound.
      const linkClient =
        security === 'reality' && inboundSni ? { ...client, sni: inboundSni } : client;
      return {
        ...describeInbound(inbound),
        packMatch: Boolean(preferred && allowed.includes(preferred)),
        link: buildVlessLink({ client: linkClient, inbound, serverAddress, publicKey, defaultFlow }),
        sni: inboundSni,
      };
    })
  );

  // Preferred order: Reality inbound matching the client's data-pack SNI,
  // then other Reality inbounds, then WS/TLS fallbacks.
  links.sort((a, b) => {
    if (a.packMatch && !b.packMatch) return -1;
    if (b.packMatch && !a.packMatch) return 1;
    if (a.security === 'reality' && b.security !== 'reality') return -1;
    if (b.security === 'reality' && a.security !== 'reality') return 1;
    return (a.port || 0) - (b.port || 0);
  });

  return { links, status: computeStatus(client), packSni: client.sni || null };
}

module.exports = {
  computeStatus,
  isEffectivelyActive,
  importFromXrayConfig,
  listClients,
  getClient,
  createClient,
  updateClient,
  setEnabled,
  deleteClient,
  getVlessLink,
  applyClientsToConfig,
  reconcileFromConfig,
  ensureClientsSynced,
  isConfigInSyncWithDb,
};
