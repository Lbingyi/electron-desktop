'use strict';
// 授权码存储（node:sqlite，零依赖）。
// 表 auth_codes：一台机器码对应一个授权码，重复登录会覆盖旧码（旧码随即失效）。
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'auth.db');

let db = null;

function getDb() {
  if (db) return db;
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_codes (
      machine_code TEXT PRIMARY KEY,
      auth_code TEXT NOT NULL,
      expiry_date INTEGER NOT NULL,
      issued_at INTEGER NOT NULL
    )
  `);
  return db;
}

function issueAuthCode(machineCode, authCode, expiryDate) {
  const database = getDb();
  const now = Date.now();
  database
    .prepare(`
      INSERT INTO auth_codes (machine_code, auth_code, expiry_date, issued_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(machine_code) DO UPDATE SET
        auth_code = excluded.auth_code,
        expiry_date = excluded.expiry_date,
        issued_at = excluded.issued_at
    `)
    .run(machineCode, authCode, expiryDate, now);
}

// 校验成功返回 { machineCode, expiryDate }，失败返回 null（不存在或已过期）。
function validateAuthCode(authCode) {
  if (typeof authCode !== 'string' || authCode.length === 0) return null;
  const database = getDb();
  const row = database
    .prepare(
      'SELECT machine_code AS machineCode, expiry_date AS expiryDate FROM auth_codes WHERE auth_code = ?',
    )
    .get(authCode);
  if (!row) return null;
  if (Number(row.expiryDate) <= Date.now()) return null;
  return row;
}

module.exports = { getDb, issueAuthCode, validateAuthCode, DB_PATH };
