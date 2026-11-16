'use strict';
// Stage 1 云端骨架：工作区（租户）、员工账号、账号分配、用量账本、操作日志。
// 零依赖，只用 node:sqlite + node:crypto，与 server/lib/db.js 共享同一库文件
// （auth.db 在 server/data/，已进 .gitignore；测试时可用 SERVER_DATA_DIR 环境变量
// 指向临时目录，见 server/lib/db.js 与 server/lib/keys.js）。
//
// 角色模型（按方案第 5 节）：
//   owner（老板）——工作区创建机器本身（机器授权码 authCode 持有者）：计费、成员、全部账号。
//   supervisor（主管）——员工账号：分配账号与额度、看绩效，不能改计费。
//   agent（客服）——员工账号：只用被分配的账号、只看自己的统计。
// 员工只建 supervisor / agent 两档；owner 不设密码登录，凭机器授权码行使权限。
//
// 计量线（方案第 5 节）：端口（同时在线账号数）、翻译字符、AI 点数。
// 额度字段只是骨架默认值（试用口径：3 端口；见方案第 8 节），定价未定，
// Stage 1 不做超量拦截与付费墙（那是阶段 2 的事），只记录、只汇总、只展示。
const crypto = require('node:crypto');
const db = require('./db');

const STAFF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 员工登录 token 有效期 24 小时
const DEFAULT_PORT_QUOTA = 3;
const DEFAULT_CHARS_QUOTA_MONTHLY = 300000;
const DEFAULT_AI_POINTS_QUOTA_MONTHLY = 1000;
const ROLES = ['supervisor', 'agent'];
const USAGE_KINDS = ['translate_chars', 'port_online', 'ai_points'];

function ensureWorkspaceSchema() {
  const database = db.getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_machine_code TEXT NOT NULL,
      port_quota INTEGER NOT NULL DEFAULT ${DEFAULT_PORT_QUOTA},
      chars_quota_monthly INTEGER NOT NULL DEFAULT ${DEFAULT_CHARS_QUOTA_MONTHLY},
      ai_points_quota_monthly INTEGER NOT NULL DEFAULT ${DEFAULT_AI_POINTS_QUOTA_MONTHLY},
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('supervisor', 'agent')),
      created_at INTEGER NOT NULL,
      last_login_at INTEGER,
      UNIQUE(workspace_id, username)
    );
    CREATE TABLE IF NOT EXISTS staff_tokens (
      token TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      role TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_assignments (
      workspace_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      assigned_at INTEGER NOT NULL,
      PRIMARY KEY(workspace_id, card_id, staff_id)
    );
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      staff_id TEXT,
      kind TEXT NOT NULL CHECK(kind IN ('translate_chars', 'port_online', 'ai_points')),
      amount INTEGER NOT NULL,
      card_id TEXT,
      recorded_at INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      staff_id TEXT,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);
}

function publicWorkspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ownerMachineCode: row.owner_machine_code,
    portQuota: row.port_quota,
    charsQuotaMonthly: row.chars_quota_monthly,
    aiPointsQuotaMonthly: row.ai_points_quota_monthly,
    createdAt: row.created_at,
  };
}

function publicStaff(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function createWorkspace({ name, ownerMachineCode }) {
  const database = db.getDb();
  const now = Date.now();
  const workspace = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    owner_machine_code: ownerMachineCode,
    port_quota: DEFAULT_PORT_QUOTA,
    chars_quota_monthly: DEFAULT_CHARS_QUOTA_MONTHLY,
    ai_points_quota_monthly: DEFAULT_AI_POINTS_QUOTA_MONTHLY,
    created_at: now,
  };
  database
    .prepare(
      `INSERT INTO workspaces
        (id, name, owner_machine_code, port_quota, chars_quota_monthly,
         ai_points_quota_monthly, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      workspace.id,
      workspace.name,
      workspace.owner_machine_code,
      workspace.port_quota,
      workspace.chars_quota_monthly,
      workspace.ai_points_quota_monthly,
      workspace.created_at,
    );
  audit(workspace.id, null, 'workspace.create', `工作区「${workspace.name}」已创建`);
  return publicWorkspace(
    database.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspace.id),
  );
}

function listWorkspacesByOwner(machineCode) {
  const database = db.getDb();
  return database
    .prepare(
      'SELECT * FROM workspaces WHERE owner_machine_code = ? ORDER BY created_at DESC',
    )
    .all(machineCode)
    .map(publicWorkspace);
}

function getWorkspace(workspaceId) {
  const database = db.getDb();
  return publicWorkspace(
    database.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId),
  );
}

function isWorkspaceOwner(workspaceId, machineCode) {
  if (typeof workspaceId !== 'string' || typeof machineCode !== 'string') return false;
  const database = db.getDb();
  const row = database
    .prepare('SELECT id FROM workspaces WHERE id = ? AND owner_machine_code = ?')
    .get(workspaceId, machineCode);
  return !!row;
}

// 一台机器默认归属的工作区：优先用调用方指定的、且归该机器所有的；
// 否则取该机器最近创建的一个；没有则返回 null（调用方需先创建工作区）。
function resolveWorkspaceForMachine(machineCode, preferredWorkspaceId) {
  if (typeof preferredWorkspaceId === 'string' && preferredWorkspaceId) {
    if (isWorkspaceOwner(preferredWorkspaceId, machineCode)) return preferredWorkspaceId;
  }
  const database = db.getDb();
  const row = database
    .prepare(
      `SELECT id FROM workspaces WHERE owner_machine_code = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(machineCode);
  return row ? row.id : null;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createStaff({ workspaceId, username, password, displayName, role, createdBy }) {
  if (!ROLES.includes(role)) {
    const err = new Error('角色只能是 supervisor（主管）或 agent（客服）');
    err.code = 'BAD_ROLE';
    throw err;
  }
  if (typeof username !== 'string' || username.trim().length === 0 || username.length > 64) {
    const err = new Error('用户名不能为空（上限 64 字符）');
    err.code = 'BAD_USERNAME';
    throw err;
  }
  if (typeof password !== 'string' || password.length < 6) {
    const err = new Error('密码至少 6 位');
    err.code = 'BAD_PASSWORD';
    throw err;
  }
  const database = db.getDb();
  const salt = crypto.randomBytes(16).toString('hex');
  const staff = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    username: username.trim(),
    password_hash: hashPassword(password, salt),
    salt,
    display_name: typeof displayName === 'string' ? displayName.trim().slice(0, 64) : '',
    role,
    created_at: Date.now(),
    last_login_at: null,
  };
  try {
    database
      .prepare(
        `INSERT INTO staff
          (id, workspace_id, username, password_hash, salt, display_name, role, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        staff.id,
        staff.workspace_id,
        staff.username,
        staff.password_hash,
        staff.salt,
        staff.display_name,
        staff.role,
        staff.created_at,
        staff.last_login_at,
      );
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      const dup = new Error('该工作区下用户名已存在');
      dup.code = 'DUPLICATE_USERNAME';
      throw dup;
    }
    throw err;
  }
  audit(workspaceId, staff.id, 'staff.create', `员工 ${staff.username}（${role}）已创建`);
  return publicStaff(database.prepare('SELECT * FROM staff WHERE id = ?').get(staff.id));
}

function getStaff(staffId) {
  const database = db.getDb();
  return publicStaff(database.prepare('SELECT * FROM staff WHERE id = ?').get(staffId));
}

function listStaff(workspaceId) {
  const database = db.getDb();
  return database
    .prepare('SELECT * FROM staff WHERE workspace_id = ? ORDER BY created_at ASC')
    .all(workspaceId)
    .map(publicStaff);
}

function issueStaffToken(staff) {
  // staff 是 publicStaff() 的返回体（驼峰字段），不要按数据库列名取。
  const database = db.getDb();
  const now = Date.now();
  const token = crypto.randomBytes(24).toString('hex');
  database
    .prepare(
      `INSERT INTO staff_tokens (token, staff_id, workspace_id, role, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(token, staff.id, staff.workspaceId, staff.role, now + STAFF_TOKEN_TTL_MS, now);
  database
    .prepare('UPDATE staff SET last_login_at = ? WHERE id = ?')
    .run(now, staff.id);
  return {
    staffToken: token,
    staffId: staff.id,
    workspaceId: staff.workspaceId,
    username: staff.username,
    displayName: staff.displayName,
    role: staff.role,
    expiresAt: now + STAFF_TOKEN_TTL_MS,
  };
}

// 员工登录：成功返回 token 信息，失败返回 null（用户名或密码错，不区分是哪个）。
function verifyStaffLogin({ workspaceId, username, password }) {
  const database = db.getDb();
  const row = database
    .prepare('SELECT * FROM staff WHERE workspace_id = ? AND username = ?')
    .get(workspaceId, username);
  if (!row) return null;
  const hash = hashPassword(password, row.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(row.password_hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const issued = issueStaffToken(publicStaff(row));
  audit(workspaceId, row.id, 'staff.login', `员工 ${row.username} 登录`);
  return issued;
}

// 校验成功返回 { staffId, workspaceId, role, displayName, username, expiresAt }，
// 失败返回 null（不存在或已过期；过期 token 会顺手删掉）。
function validateStaffToken(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const database = db.getDb();
  const row = database
    .prepare('SELECT * FROM staff_tokens WHERE token = ?')
    .get(token);
  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) {
    database.prepare('DELETE FROM staff_tokens WHERE token = ?').run(token);
    return null;
  }
  const staff = database.prepare('SELECT * FROM staff WHERE id = ?').get(row.staff_id);
  if (!staff) return null;
  return {
    staffId: staff.id,
    workspaceId: staff.workspace_id,
    role: staff.role,
    displayName: staff.display_name,
    username: staff.username,
    expiresAt: row.expires_at,
  };
}

function assignAccount({ workspaceId, staffId, cardId, assignedBy }) {
  const database = db.getDb();
  const staff = database
    .prepare('SELECT * FROM staff WHERE id = ? AND workspace_id = ?')
    .get(staffId, workspaceId);
  if (!staff) {
    const err = new Error('员工不存在或不属于该工作区');
    err.code = 'STAFF_NOT_FOUND';
    throw err;
  }
  if (typeof cardId !== 'string' || cardId.trim().length === 0) {
    const err = new Error('cardId 不能为空');
    err.code = 'BAD_CARD_ID';
    throw err;
  }
  database
    .prepare(
      `INSERT INTO account_assignments
        (workspace_id, card_id, staff_id, assigned_by, assigned_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, card_id, staff_id) DO NOTHING`,
    )
    .run(workspaceId, cardId.trim(), staffId, assignedBy, Date.now());
  audit(workspaceId, staffId, 'staff.assign', `账号 ${cardId.trim()} 已分配给员工 ${staff.username}`);
}

function unassignAccount({ workspaceId, staffId, cardId }) {
  const database = db.getDb();
  const info = database
    .prepare(
      `DELETE FROM account_assignments
       WHERE workspace_id = ? AND card_id = ? AND staff_id = ?`,
    )
    .run(workspaceId, cardId, staffId);
  if (info.changes > 0) {
    audit(workspaceId, staffId, 'staff.unassign', `账号 ${cardId} 已从员工处收回`);
  }
  return info.changes > 0;
}

function getAssignedCardIds(workspaceId, staffId) {
  const database = db.getDb();
  return database
    .prepare(
      `SELECT card_id AS cardId FROM account_assignments
       WHERE workspace_id = ? AND staff_id = ? ORDER BY assigned_at ASC`,
    )
    .all(workspaceId, staffId)
    .map((row) => row.cardId);
}

function recordUsage({ workspaceId, staffId, kind, amount, cardId, note }) {
  if (!USAGE_KINDS.includes(kind)) {
    const err = new Error(`kind 只能是 ${USAGE_KINDS.join(' / ')}`);
    err.code = 'BAD_KIND';
    throw err;
  }
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 0) {
    const err = new Error('amount 必须是非负整数');
    err.code = 'BAD_AMOUNT';
    throw err;
  }
  const database = db.getDb();
  const info = database
    .prepare(
      `INSERT INTO usage_events
        (workspace_id, staff_id, kind, amount, card_id, recorded_at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      workspaceId,
      staffId || null,
      kind,
      n,
      typeof cardId === 'string' ? cardId : null,
      Date.now(),
      typeof note === 'string' ? note.slice(0, 2000) : '',
    );
  return Number(info.lastInsertRowid);
}

// 用量汇总：默认取本月（自然月）。staffId 给了则只汇总该员工的事件
// （客服只能看自己的；机器级事件 staff_id 为 NULL，客服看不到，老板/主管能看到）。
function usageSummary({ workspaceId, staffId, from, to }) {
  const database = db.getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const start = Number.isFinite(Number(from)) ? Number(from) : monthStart;
  const end = Number.isFinite(Number(to)) ? Number(to) : Date.now();
  const staffFilter = staffId ? 'AND staff_id = ?' : '';
  const params = staffId ? [workspaceId, start, end, staffId] : [workspaceId, start, end];
  const row = database
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'translate_chars' THEN amount ELSE 0 END), 0) AS translateChars,
         COALESCE(SUM(CASE WHEN kind = 'translate_chars' THEN 1 ELSE 0 END), 0) AS translateCount,
         COALESCE(MAX(CASE WHEN kind = 'port_online' THEN amount ELSE 0 END), 0) AS portPeak,
         COALESCE(SUM(CASE WHEN kind = 'port_online' THEN 1 ELSE 0 END), 0) AS portSamples,
         COALESCE(SUM(CASE WHEN kind = 'ai_points' THEN amount ELSE 0 END), 0) AS aiPoints
       FROM usage_events
       WHERE workspace_id = ? AND recorded_at >= ? AND recorded_at < ? ${staffFilter}`,
    )
    .get(...params);
  return {
    workspaceId,
    from: start,
    to: end,
    translateChars: Number(row.translateChars),
    translateCount: Number(row.translateCount),
    portPeak: Number(row.portPeak),
    portSamples: Number(row.portSamples),
    aiPoints: Number(row.aiPoints),
  };
}

// 按日汇总（供首页图表）：返回最近 days 天（含今天），每天 {date, translateCount, chars}，
// 没有事件的日子补 0——不编造演示数据。
function usageDaily({ workspaceId, staffId, days }) {
  const database = db.getDb();
  const n = Math.min(Math.max(Number(days) || 7, 1), 31);
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    out.push({
      date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      translateCount: 0,
      chars: 0,
    });
  }
  const start = today.getTime() - (n - 1) * 24 * 60 * 60 * 1000;
  const staffFilter = staffId ? 'AND staff_id = ?' : '';
  const params = staffId
    ? [workspaceId, start, staffId]
    : [workspaceId, start];
  const rows = database
    .prepare(
      `SELECT
         strftime('%m-%d', recorded_at / 1000, 'unixepoch', 'localtime') AS day,
         COUNT(*) AS translateCount,
         COALESCE(SUM(amount), 0) AS chars
       FROM usage_events
       WHERE workspace_id = ? AND kind = 'translate_chars' AND recorded_at >= ? ${staffFilter}
       GROUP BY day`,
    )
    .all(...params);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  for (const item of out) {
    const found = byDay.get(item.date);
    if (found) {
      item.translateCount = Number(found.translateCount);
      item.chars = Number(found.chars);
    }
  }
  return out;
}

// 翻译成功后记账用：机器级翻译（staffToken 为空）记到该机器的工作区，
// 员工级翻译（staffToken 有效）记到该员工名下。失败时返回原因，不抛错，
// 调用方（翻译接口）绝不能因为记账失败而影响翻译返回。
function recordTranslationUsage({ machineCode, staffToken, workspaceId, chars }) {
  let staff = null;
  if (staffToken) {
    staff = validateStaffToken(staffToken);
    if (!staff) return { ok: false, reason: 'staffToken 无效' };
  }
  const wsId = staff
    ? staff.workspaceId
    : resolveWorkspaceForMachine(machineCode, workspaceId);
  if (!wsId) return { ok: false, reason: '该机器尚未创建工作区' };
  recordUsage({
    workspaceId: wsId,
    staffId: staff ? staff.staffId : null,
    kind: 'translate_chars',
    amount: chars,
  });
  return { ok: true, workspaceId: wsId };
}

function audit(workspaceId, staffId, action, detail) {
  const database = db.getDb();
  database
    .prepare(
      `INSERT INTO audit_log (workspace_id, staff_id, action, detail, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(workspaceId, staffId || null, action, detail || '', Date.now());
}

module.exports = {
  ensureWorkspaceSchema,
  createWorkspace,
  listWorkspacesByOwner,
  getWorkspace,
  isWorkspaceOwner,
  resolveWorkspaceForMachine,
  createStaff,
  getStaff,
  listStaff,
  verifyStaffLogin,
  validateStaffToken,
  assignAccount,
  unassignAccount,
  getAssignedCardIds,
  recordUsage,
  usageSummary,
  usageDaily,
  recordTranslationUsage,
  audit,
  ROLES,
  USAGE_KINDS,
  DEFAULT_PORT_QUOTA,
  DEFAULT_CHARS_QUOTA_MONTHLY,
  DEFAULT_AI_POINTS_QUOTA_MONTHLY,
};
