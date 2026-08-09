const lockfile = require('proper-lockfile');

// Wraps proper-lockfile with sane defaults for guarding concurrent admin
// operations against the same Xray config file (requirement #12).
async function withFileLock(filePath, fn) {
  const release = await lockfile.lock(filePath, {
    retries: { retries: 10, factor: 1.5, minTimeout: 100, maxTimeout: 2000 },
    stale: 15000,
    realpath: true,
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}

module.exports = { withFileLock };
