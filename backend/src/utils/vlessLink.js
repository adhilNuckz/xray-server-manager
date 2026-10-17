// Builds a vless:// share URI purely from data found in the live Xray
// configuration (plus the panel's configured public SERVER_ADDRESS).
// Nothing here is hardcoded - every parameter is read from config.json.
//
// A real-world Xray config commonly defines MULTIPLE VLESS inbounds that
// share the same client list (e.g. a primary TCP+Reality inbound on 443
// plus a WS+TLS fallback on another port for networks that block raw TCP).
// Every function here is inbound-aware / plural-first so the panel keeps
// ALL such inbounds in sync instead of silently only managing the first one.

function findVlessInbounds(config) {
  if (!config || !Array.isArray(config.inbounds)) return [];
  return config.inbounds.filter(
    (ib) => ib.protocol === 'vless' && ib.settings && Array.isArray(ib.settings.clients)
  );
}

// XTLS flow values (e.g. xtls-rprx-vision) are only valid over a raw TCP
// transport. Sending `flow` on a ws/grpc/h2 inbound is invalid and will be
// rejected or ignored inconsistently by clients, so it must be omitted there.
function supportsFlow(inbound) {
  const network = (inbound.streamSettings && inbound.streamSettings.network) || 'tcp';
  return network === 'tcp';
}

function describeInbound(inbound) {
  const stream = inbound.streamSettings || {};
  const rs = stream.realitySettings || {};
  const port = Number(inbound.port) === 10443 ? 443 : inbound.port;
  return {
    port,
    tag: inbound.tag || null,
    network: stream.network || 'tcp',
    security: stream.security || 'none',
    serverNames: Array.isArray(rs.serverNames) ? rs.serverNames : [],
    dest: rs.dest || null,
  };
}

// Fragment label encoding that matches common VLESS share-link style
// (spaces -> %20, keep apostrophes literally like DEVIL'S%20PROXY).
function encodeLinkLabel(label) {
  return encodeURIComponent(label || '').replace(/%27/g, "'");
}

// Build query string manually so param order/encoding matches the exact
// share-link style clients expect (URLSearchParams can rewrite encoding).
function toQuery(parts) {
  return parts
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
    // encodeURIComponent turns nothing unexpected for these keys/values,
    // but keep '~' style unescaped chars that some clients are picky about.
    .replace(/%2D/gi, '-')
    .replace(/%5F/gi, '_')
    .replace(/%2E/gi, '.')
    .replace(/%7E/gi, '~');
}

function buildVlessLink({ client, inbound, serverAddress, publicKey, defaultFlow }) {
  if (!inbound) throw new Error('No VLESS inbound found in Xray configuration');
  if (!serverAddress) throw new Error('SERVER_ADDRESS is not configured - set vpn.solitways.online in Settings');

  const port = Number(inbound.port) === 10443 ? 443 : inbound.port;
  const stream = inbound.streamSettings || {};
  const network = stream.network || 'tcp';
  const security = stream.security || 'none';
  const flowOk = supportsFlow(inbound);

  // Prefer client.flow; for Reality/TCP fall back so the link never loses flow.
  let flow = client.flow || '';
  if (!flow && flowOk) {
    const live = (inbound.settings && inbound.settings.clients || []).find((c) => c.id === client.id);
    flow = (live && live.flow) || defaultFlow || 'xtls-rprx-vision';
  }

  // Exact Reality share-link order clients connect with:
  // encryption / flow / type / headerType / security / fp / sni / pbk / sid
  const parts = [['encryption', 'none']];
  if (flow && flowOk) parts.push(['flow', flow]);
  parts.push(['type', network]);
  if (network === 'tcp') parts.push(['headerType', 'none']);
  parts.push(['security', security]);

  if (security === 'reality') {
    const rs = stream.realitySettings || {};
    parts.push(['fp', rs.fingerprint || 'chrome']);
    const allowed = Array.isArray(rs.serverNames) ? rs.serverNames.map((n) => String(n).replace(/:\d+$/, '')) : [];
    // Prefer the client's chosen data-pack SNI when the server allows it.
    const preferred = client.sni ? String(client.sni).replace(/:\d+$/, '') : '';
    const sni =
      (preferred && allowed.includes(preferred) && preferred) ||
      allowed[0] ||
      (rs.dest ? String(rs.dest).replace(/:\d+$/, '') : '');
    if (sni) parts.push(['sni', sni]);
    if (!publicKey) {
      throw new Error('Failed to derive Reality public key (pbk) from privateKey in config.json');
    }
    parts.push(['pbk', publicKey]);
    const shortId = (Array.isArray(rs.shortIds) && rs.shortIds[0]) || '';
    parts.push(['sid', shortId]);
    if (rs.spiderX && rs.spiderX !== '/') parts.push(['spx', rs.spiderX]);
  } else if (security === 'tls') {
    const ts = stream.tlsSettings || {};
    if (ts.serverName) parts.push(['sni', ts.serverName]);
    parts.push(['fp', ts.fingerprint || 'chrome']);
    if (Array.isArray(ts.alpn) && ts.alpn.length) parts.push(['alpn', ts.alpn.join(',')]);
  }

  if (network === 'ws') {
    const ws = stream.wsSettings || {};
    if (ws.path) parts.push(['path', ws.path]);
    const host = ws.headers && ws.headers.Host;
    if (host) parts.push(['host', host]);
  } else if (network === 'grpc') {
    const grpc = stream.grpcSettings || {};
    if (grpc.serviceName) parts.push(['serviceName', grpc.serviceName]);
  }

  const label = encodeLinkLabel(client.name || client.email || client.id);
  return `vless://${client.id}@${serverAddress}:${port}?${toQuery(parts)}#${label}`;
}

module.exports = { findVlessInbounds, supportsFlow, describeInbound, buildVlessLink };
