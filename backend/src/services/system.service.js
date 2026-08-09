// Real server/system information (no fabricated data). Uses the
// `systeminformation` library plus a couple of lightweight direct reads.
const os = require('os');
const si = require('systeminformation');
const { execFile } = require('child_process');
const env = require('../config/env');
const settings = require('./settings.service');
const xrayProcess = require('./xrayProcess.service');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (error, stdout) => {
      resolve(error ? null : stdout.trim());
    });
  });
}

async function getServerInfo() {
  const [cpuLoad, mem, fsSize, time, osInfo] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    Promise.resolve(si.time()),
    si.osInfo(),
  ]);

  const rootFs = fsSize.find((f) => f.mount === '/') || fsSize[0] || {};
  const xrayStatus = await xrayProcess.status().catch(() => ({ active: false, state: 'unknown' }));

  return {
    hostname: os.hostname(),
    platform: `${osInfo.distro || osInfo.platform} ${osInfo.release || ''}`.trim(),
    kernel: osInfo.kernel,
    arch: osInfo.arch,
    cpuUsagePercent: Math.round(cpuLoad.currentLoad * 10) / 10,
    cpuCount: os.cpus().length,
    memory: {
      total: mem.total,
      used: mem.active,
      free: mem.available,
      usedPercent: Math.round((mem.active / mem.total) * 1000) / 10,
    },
    disk: {
      total: rootFs.size || 0,
      used: rootFs.used || 0,
      usedPercent: rootFs.use || 0,
    },
    uptimeSeconds: time.uptime,
    publicIp: settings.get('server_address', env.SERVER_ADDRESS),
    xray: xrayStatus,
  };
}

async function getNetworkThroughput() {
  const stats = await si.networkStats();
  const total = stats.reduce(
    (acc, s) => {
      acc.rxSec += s.rx_sec || 0;
      acc.txSec += s.tx_sec || 0;
      acc.rxBytes += s.rx_bytes || 0;
      acc.txBytes += s.tx_bytes || 0;
      return acc;
    },
    { rxSec: 0, txSec: 0, rxBytes: 0, txBytes: 0 }
  );
  return total;
}

// Counts established TCP connections to a given local port using `ss`.
// Real, system-derived data - not per-client, but an honest system-wide
// "active connections" figure for the given inbound port.
async function countEstablishedConnections(port) {
  if (!port) return 0;
  const output = await run('ss', ['-tn', 'state', 'established', `( sport = :${port} or dport = :${port} )`]);
  if (!output) return 0;
  const lines = output.split('\n').filter((l) => l.trim().length > 0);
  // First line is the header ("Recv-Q Send-Q ...") when there is output.
  return Math.max(0, lines.length - 1);
}

module.exports = { getServerInfo, getNetworkThroughput, countEstablishedConnections };
