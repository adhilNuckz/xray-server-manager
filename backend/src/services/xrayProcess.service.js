// Controls the Xray systemd service. Every call uses execFile with a fixed
// argument array - user input is never concatenated into a shell command.
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

module.exports = { status, start, stop, restart, reload, SERVICE };
