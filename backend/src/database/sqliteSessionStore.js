// Minimal express-session store backed by the panel's own SQLite database.
// Avoids pulling in an extra dependency just for session persistence, and
// means sessions survive PM2 restarts / server reboots.
const session = require('express-session');
const db = require('./db');

const SELECT = db.prepare('SELECT sess, expires_at FROM sessions WHERE sid = ?');
const UPSERT = db.prepare(`
  INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)
  ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at
`);
const DELETE = db.prepare('DELETE FROM sessions WHERE sid = ?');
const DELETE_EXPIRED = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
const ALL = db.prepare('SELECT sid, sess, expires_at FROM sessions');

class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this._cleanupTimer = setInterval(() => {
      try {
        DELETE_EXPIRED.run(Date.now());
      } catch (_) {
        /* ignore */
      }
    }, 60 * 60 * 1000);
    this._cleanupTimer.unref();
  }

  get(sid, cb) {
    try {
      const row = SELECT.get(sid);
      if (!row) return cb(null, null);
      if (row.expires_at < Date.now()) {
        DELETE.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sessData, cb) {
    try {
      const maxAge = sessData.cookie && sessData.cookie.maxAge ? sessData.cookie.maxAge : 24 * 60 * 60 * 1000;
      const expiresAt = Date.now() + maxAge;
      UPSERT.run(sid, JSON.stringify(sessData), expiresAt);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      DELETE.run(sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  touch(sid, sessData, cb) {
    this.set(sid, sessData, cb);
  }

  all(cb) {
    try {
      const rows = ALL.get ? ALL.all() : [];
      cb(null, rows.map((r) => JSON.parse(r.sess)));
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = SqliteSessionStore;
