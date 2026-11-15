// Controls the Xray systemd service. Every call uses execFile with a fixed
// argument array - user input is never concatenated into a shell command.
const fs = require('fs');
const { execFile } = require('child_process');
const env = require('../config/env');

const SERVICE = env.XRAY_SYSTEMD_SERVICE;

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000 }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
        error: error ? error.message : null,
      });
    });
  });
}

async function status() {
  const result = await run('systemctl', ['is-active', SERVICE]);
  const active = result.stdout === 'active';
  const detail = await run('systemctl', ['show', SERVICE, '--no-page', '--property=ActiveState,SubState,MainPID,ExecMainStartTimestamp']);
  const props = {};
  detail.stdout.split('\n').forEach((line) => {
    const idx = line.indexOf('=');
    if (idx > -1) props[line.slice(0, idx)] = line.slice(idx + 1);
  });
  return {
    active,
    state: result.stdout || 'unknown',
    subState: props.SubState || null,
    mainPid: props.MainPID && props.MainPID !== '0' ? props.MainPID : null,
    startedAt: props.ExecMainStartTimestamp || null,
  };
}

async function start() {
  return run('systemctl', ['start', SERVICE]);
}

async function stop() {
  return run('systemctl', ['stop', SERVICE]);
}

async function restart() {
  return run('systemctl', ['restart', SERVICE]);
}

async function reload() {
  // Xray supports SIGHUP-based reload via systemd `reload` if the unit
  // defines ExecReload; fall back to restart if reload is not supported.
  const result = await run('systemctl', ['reload', SERVICE]);
  if (result.code !== 0) {
    return restart();
  }
  return result;
}

async function getLogs({ type = 'service', lines = 100, filter = null } = {}) {
  const safeLines = Math.min(Math.max(parseInt(lines, 10) || 100, 10), 300);
  let rawText = '';

  if (type === 'access') {
    const accessPath = '/var/log/xray/access.log';
    if (fs.existsSync(accessPath)) {
      const res = await run('tail', ['-n', String(safeLines), accessPath]);
      rawText = res.stdout;
    } else {
      rawText = 'Access log file does not exist yet (/var/log/xray/access.log).';
    }
  } else if (type === 'error') {
    const errorPath = '/var/log/xray/error.log';
    if (fs.existsSync(errorPath)) {
      const res = await run('tail', ['-n', String(safeLines), errorPath]);
      rawText = res.stdout;
    } else {
      rawText = 'Error log file does not exist yet (/var/log/xray/error.log).';
    }
  } else {
    // Default: systemd service log via journalctl
    const res = await run('journalctl', ['-u', SERVICE, '-n', String(safeLines), '--no-pager']);
    rawText = res.stdout || res.stderr;
  }

  let lineArray = rawText ? rawText.split('\n') : [];
  if (filter && typeof filter === 'string' && filter.trim()) {
    const q = filter.trim().toLowerCase();
    lineArray = lineArray.filter((l) => l.toLowerCase().includes(q));
  }

  return {
    type,
    lines: lineArray.length,
    requestedLines: safeLines,
    logs: lineArray,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { status, start, stop, restart, reload, getLogs, SERVICE };
