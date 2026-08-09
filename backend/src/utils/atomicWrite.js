const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Writes `data` to `filePath` atomically: write to a temp file in the same
// directory (so it's on the same filesystem/volume) then rename() over the
// destination. rename() is atomic on POSIX filesystems, so readers never
// observe a partially written file.
function atomicWriteFileSync(filePath, data, options = {}) {
  const dir = path.dirname(filePath);
  const tmpName = `.${path.basename(filePath)}.tmp-${crypto.randomBytes(6).toString('hex')}`;
  const tmpPath = path.join(dir, tmpName);

  fs.writeFileSync(tmpPath, data, options);
  // fsync the temp file before rename to reduce risk of data loss on crash.
  const fd = fs.openSync(tmpPath, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}

module.exports = { atomicWriteFileSync };
