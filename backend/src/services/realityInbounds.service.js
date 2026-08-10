// Manages separate Reality VLESS inbounds ("data packs") in the live Xray
// config. Each pack has its own port + matching dest/serverNames so client
// SNIs stay consistent with the Reality destination (required for stable
// connections). All packs share the same Reality privateKey/shortIds and
// the same client UUID list.
const crypto = require('crypto');
const xrayConfig = require('./xrayConfig.service');
const { isValidSni } = require('../utils/validators');
const settingsStore = require('./settings.service');

const TAG_PREFIX = 'vless-reality-';
const SETTINGS_KEY = 'reality_inbounds';

const PRESETS = [
  {
    id: 'zoom',
    label: 'Zoom',
    port: 443,
    dest: 'support.zoom.us:443',
    serverNames: ['support.zoom.us'],
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    port: 8444,
    dest: 'www.microsoft.com:443',
    serverNames: ['www.microsoft.com', 'aka.ms'],
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    port: 2053,
    dest: 'www.cloudflare.com:443',
    serverNames: ['www.cloudflare.com'],
  },
];

function isRealityVless(ib) {
  return (
    ib &&
    ib.protocol === 'vless' &&
    ib.streamSettings &&
    ib.streamSettings.security === 'reality' &&
    ib.streamSettings.realitySettings
  );
}

function slugify(label) {
  const base = String(label || 'pack')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return base || `pack-${crypto.randomBytes(3).toString('hex')}`;
}

function normalizeDest(dest) {
  const d = String(dest || '').trim().toLowerCase();
  if (!d) throw new Error('Destination (dest) is required');
  // host or host:port
  const host = d.replace(/:\d+$/, '');
  if (!isValidSni(host)) throw new Error(`Invalid destination host: ${dest}`);
  if (/:\d+$/.test(d)) return d;
  return `${host}:443`;
}

function normalizeProfile(raw, { usedPorts = new Set(), usedIds = new Set(), usedSnis = new Set() } = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid Reality inbound profile');

  const label = String(raw.label || '').trim().slice(0, 64);
  if (!label) throw new Error('Each Reality inbound needs a label (e.g. Zoom)');

  let id = String(raw.id || slugify(label)).trim().toLowerCase();
  id = id.replace(/[^a-z0-9-]/g, '').slice(0, 40);
  if (!id) id = `pack-${crypto.randomBytes(3).toString('hex')}`;
  if (usedIds.has(id)) id = `${id}-${crypto.randomBytes(2).toString('hex')}`;
  usedIds.add(id);

  const port = Number(raw.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port for "${label}"`);
  }
  if ([5252, 10085].includes(port)) {
    throw new Error(`Port ${port} is reserved by the panel / Stats API`);
  }
  if (usedPorts.has(port)) {
    throw new Error(`Port ${port} is used by more than one inbound`);
  }
  usedPorts.add(port);

  const dest = normalizeDest(raw.dest);
  const serverNames = settingsStore.normalizeServerNames(raw.serverNames || raw.server_names || []);
  for (const sni of serverNames) {
    if (usedSnis.has(sni)) {
      throw new Error(`SNI "${sni}" is used in more than one Reality inbound — each pack needs unique names`);
    }
    usedSnis.add(sni);
  }

  return { id, label, port, dest, serverNames };
}

function normalizeProfiles(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('Add at least one Reality inbound (data pack)');
  }
  if (input.length > 10) throw new Error('Too many Reality inbounds (max 10)');

  const usedPorts = new Set();
  const usedIds = new Set();
  const usedSnis = new Set();
  return input.map((p) => normalizeProfile(p, { usedPorts, usedIds, usedSnis }));
}

function readProfilesFromLiveConfig() {
  if (!xrayConfig.configExists()) return null;
  const config = xrayConfig.readConfig();
  const reality = (config.inbounds || []).filter(isRealityVless);
  if (!reality.length) return null;

  const usedPorts = new Set();
  const usedIds = new Set();
  const usedSnis = new Set();
  return reality.map((ib, idx) => {
    const rs = ib.streamSettings.realitySettings;
    const tagId =
      ib.tag && String(ib.tag).startsWith(TAG_PREFIX) ? String(ib.tag).slice(TAG_PREFIX.length) : null;
    const firstSni = (rs.serverNames && rs.serverNames[0]) || `pack-${idx + 1}`;
    return normalizeProfile(
      {
        id: tagId || slugify(firstSni),
        label: tagId ? tagId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : firstSni,
        port: ib.port,
        dest: rs.dest || `${firstSni}:443`,
        serverNames: rs.serverNames || [firstSni],
      },
      { usedPorts, usedIds, usedSnis }
    );
  });
}

function getRealityInbounds() {
  const raw = settingsStore.get(SETTINGS_KEY, null);
  if (raw) {
    try {
      return normalizeProfiles(JSON.parse(raw));
    } catch (_) {
      /* fall through */
    }
  }
  const fromConfig = readProfilesFromLiveConfig();
  if (fromConfig && fromConfig.length) {
    settingsStore.set(SETTINGS_KEY, JSON.stringify(fromConfig));
    // Keep flat list in sync for older UI/validation paths.
    settingsStore.set(
      'reality_server_names',
      JSON.stringify(fromConfig.flatMap((p) => p.serverNames))
    );
    return fromConfig;
  }
  return [
    {
      id: 'zoom',
      label: 'Zoom',
      port: 443,
      dest: 'support.zoom.us:443',
      serverNames: ['support.zoom.us'],
    },
  ];
}

function findTemplateRealityKeys(config) {
  const reality = (config.inbounds || []).filter(isRealityVless);
  for (const ib of reality) {
    const rs = ib.streamSettings.realitySettings;
    if (rs && rs.privateKey && Array.isArray(rs.shortIds) && rs.shortIds.length) {
      return {
        privateKey: rs.privateKey,
        shortIds: [...rs.shortIds],
        show: rs.show === true,
        xver: typeof rs.xver === 'number' ? rs.xver : 0,
      };
    }
  }
  return null;
}

function collectAnyVlessClients(config) {
  for (const ib of config.inbounds || []) {
    if (ib.protocol === 'vless' && ib.settings && Array.isArray(ib.settings.clients)) {
      return ib.settings.clients.map((c) => ({ ...c }));
    }
  }
  return [];
}

async function syncRealityInboundsToXray(profiles) {
  if (!xrayConfig.configExists()) {
    throw new Error(`Xray configuration not found at ${xrayConfig.CONFIG_PATH}`);
  }
  const config = xrayConfig.readConfig();
  const keys = findTemplateRealityKeys(config);
  if (!keys) {
    throw new Error(
      'No existing Reality inbound with privateKey/shortIds found — cannot create new packs without Reality keys'
    );
  }

  // Reserved by non-Reality inbounds (WS/TLS, API, etc.)
  const reservedPorts = new Set();
  for (const ib of config.inbounds || []) {
    if (!isRealityVless(ib) && ib.port != null) reservedPorts.add(Number(ib.port));
  }
  for (const p of profiles) {
    if (reservedPorts.has(p.port)) {
      throw new Error(`Port ${p.port} is already used by another (non-Reality) inbound`);
    }
  }

  const clients = collectAnyVlessClients(config);
  const nonReality = (config.inbounds || []).filter((ib) => !isRealityVless(ib));

  const realityInbounds = profiles.map((p) => ({
    listen: '0.0.0.0',
    port: p.port,
    protocol: 'vless',
    tag: `${TAG_PREFIX}${p.id}`,
    settings: {
      clients: clients.map((c) => {
        const entry = { id: c.id };
        if (c.email) entry.email = c.email;
        if (c.flow) entry.flow = c.flow;
        return entry;
      }),
      decryption: 'none',
    },
    streamSettings: {
      network: 'tcp',
      security: 'reality',
      realitySettings: {
        show: keys.show,
        dest: p.dest,
        xver: keys.xver,
        serverNames: [...p.serverNames],
        privateKey: keys.privateKey,
        shortIds: [...keys.shortIds],
      },
    },
  }));

  config.inbounds = [...realityInbounds, ...nonReality];
  return xrayConfig.writeConfigSafely(config);
}

async function setRealityInbounds(input, { syncToXray = true } = {}) {
  const profiles = normalizeProfiles(input);
  settingsStore.set(SETTINGS_KEY, JSON.stringify(profiles));
  settingsStore.set('reality_server_names', JSON.stringify(profiles.flatMap((p) => p.serverNames)));

  if (!syncToXray) return { profiles, synced: false };

  const result = await syncRealityInboundsToXray(profiles);
  return { profiles, synced: true, ...result };
}

function findPackForSni(sni) {
  const cleaned = String(sni || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
  if (!cleaned) return getRealityInbounds()[0] || null;
  return getRealityInbounds().find((p) => p.serverNames.includes(cleaned)) || null;
}

function getAllServerNames() {
  return getRealityInbounds().flatMap((p) => p.serverNames);
}

module.exports = {
  TAG_PREFIX,
  PRESETS,
  getRealityInbounds,
  setRealityInbounds,
  syncRealityInboundsToXray,
  findPackForSni,
  getAllServerNames,
  isRealityVless,
  normalizeProfiles,
};
