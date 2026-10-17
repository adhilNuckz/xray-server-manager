const crypto = require('crypto');
const publicService = require('../services/public.service');
const trafficService = require('../services/traffic.service');
const db = require('../database/db');

const GET_CLIENT_EMAIL = db.prepare('SELECT email FROM clients WHERE id = ?');

// Pre-allocated random buffer for high-throughput speed testing
const CHUNK_SIZE = 64 * 1024; // 64 KB
const SPEEDTEST_CHUNK = crypto.randomBytes(CHUNK_SIZE);

async function getUsage(req, res) {
  const { id } = req.params;
  const data = publicService.getClientUsage(id);
  if (!data) {
    return res.status(404).json({ error: 'Client not found or invalid link' });
  }
  return res.json(data);
}

async function streamUsage(req, res) {
  const { id } = req.params;
  const clientRow = GET_CLIENT_EMAIL.get(id);
  if (!clientRow) {
    return res.status(404).json({ error: 'Client not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Initial event
  const initialData = publicService.getClientUsage(id);
  if (initialData) {
    res.write(`data: ${JSON.stringify(initialData.traffic)}\n\n`);
  }

  trafficService.addClientSse(clientRow.email, res);

  req.on('close', () => {
    trafficService.removeClientSse(clientRow.email, res);
  });
}

function ping(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res.json({ ok: true, ts: Date.now() });
}

function speedtestDownload(req, res) {
  // Query param size in bytes; default 10 MB, clamped between 512 KB and 25 MB
  const requestedSize = parseInt(req.query.bytes, 10);
  const totalBytes = Number.isInteger(requestedSize)
    ? Math.max(512 * 1024, Math.min(requestedSize, 25 * 1024 * 1024))
    : 10 * 1024 * 1024;

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', totalBytes);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  let sent = 0;
  function sendChunk() {
    while (sent < totalBytes) {
      const remaining = totalBytes - sent;
      const chunkSize = Math.min(remaining, CHUNK_SIZE);
      const chunk = chunkSize === CHUNK_SIZE ? SPEEDTEST_CHUNK : SPEEDTEST_CHUNK.subarray(0, chunkSize);
      sent += chunkSize;

      const canContinue = res.write(chunk);
      if (!canContinue) {
        res.once('drain', sendChunk);
        return;
      }
    }
    res.end();
  }

  sendChunk();
}

function speedtestUpload(req, res) {
  const startTime = process.hrtime.bigint();
  let receivedBytes = 0;

  // If body was already consumed and buffered as a Buffer or non-empty string
  if (req.body && (Buffer.isBuffer(req.body) || (typeof req.body === "string" && req.body.length > 0))) {
    receivedBytes = Buffer.isBuffer(req.body) ? req.body.length : Buffer.byteLength(req.body);
    const endTime = process.hrtime.bigint();
    const durationMs = Math.max(1, Number(endTime - startTime) / 1e6);
    const durationSec = durationMs / 1000;
    const speedMbps = (receivedBytes * 8) / (durationSec * 1000 * 1000);
    res.setHeader('Cache-Control', 'no-store, no-cache');
    return res.json({
      receivedBytes,
      durationMs: Math.round(durationMs),
      speedMbps: parseFloat(speedMbps.toFixed(2)),
    });
  }

  // Handle streaming raw body
  req.on('data', (chunk) => {
    receivedBytes += chunk.length;
  });

  req.on('end', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Math.max(1, Number(endTime - startTime) / 1e6);
    const durationSec = durationMs / 1000;
    const speedMbps = durationSec > 0 ? (receivedBytes * 8) / (durationSec * 1000 * 1000) : 0;

    res.setHeader('Cache-Control', 'no-store, no-cache');
    return res.json({
      receivedBytes,
      durationMs: Math.round(durationMs),
      speedMbps: parseFloat(speedMbps.toFixed(2)),
    });
  });

  req.on('error', (err) => {
    return res.status(500).json({ error: err.message });
  });
}

module.exports = {
  getUsage,
  streamUsage,
  ping,
  speedtestDownload,
  speedtestUpload,
};
