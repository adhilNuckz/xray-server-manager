const db = require('../database/db');
const trafficService = require('./traffic.service');
const settingsService = require('./settings.service');
const env = require('../config/env');

const GET_CLIENT_BY_ID = db.prepare(`
  SELECT id, name, email, enabled, expires_at, created_at, sni
  FROM clients
  WHERE id = ?
`);

function getCountryFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function getClientUsage(clientId) {
  if (!clientId || typeof clientId !== 'string') return null;

  const client = GET_CLIENT_BY_ID.get(clientId.trim());
  if (!client) return null;

  const now = Date.now();
  let status = 'active';
  if (!client.enabled) {
    status = 'disabled';
  } else if (client.expires_at && new Date(client.expires_at).getTime() < now) {
    status = 'expired';
  }

  const traffic = trafficService.getClientTraffic(client.email);
  const serverAddress = settingsService.get('server_address', env.SERVER_ADDRESS || 'noisp.solitways.online');
  const serverCountry = settingsService.get('server_country', 'United States');
  const serverCountryCode = settingsService.get('server_country_code', 'US');
  const serverCity = settingsService.get('server_city', 'Los Angeles');
  const flag = settingsService.get('server_flag', getCountryFlag(serverCountryCode));

  return {
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      status,
      sni: client.sni || null,
      expires_at: client.expires_at,
      created_at: client.created_at,
    },
    server: {
      address: serverAddress,
      country: serverCountry,
      countryCode: serverCountryCode,
      city: serverCity,
      flag,
      status: 'online',
    },
    traffic: {
      uplink: traffic.uplink || 0,
      downlink: traffic.downlink || 0,
      total: traffic.total || 0,
      upSpeed: traffic.upSpeed || 0,
      downSpeed: traffic.downSpeed || 0,
      speedHistory: traffic.speedHistory || [],
      lastSeen: traffic.lastSeen,
    },
  };
}

module.exports = {
  getClientUsage,
};
