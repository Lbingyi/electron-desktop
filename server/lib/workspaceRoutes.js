'use strict';
// Stage 1 云端骨架的 HTTP 接口：工作区 / 员工 / 账号分配 / 用量账本。
// 全部走 POST + JSON，与现有 /api/translate、/api/authManage/clientAuth 风格一致，
// 返回体一律 {code, msg?, message?, ...}（code: 200 是前端拦截器的硬性要求）。
//
// 身份分两层（见 server/lib/workspace.js 的角色模型）：
//   老板：机器授权码 authCode（POST /api/authManage/clientAuth 拿到的那把），
//         代表创建工作区的机器；只能操作自己机器创建的工作区。
//   员工：staffToken（POST /api/workspace/staff/login 拿到的），24 小时有效；
//         只能操作自己所属的工作区；主管能做的事比客服多（见 isManager）。
// 两个凭证都不要放进 URL query，只放请求体；不要记进日志。
const db = require('./db');
const workspace = require('./workspace');
const { sendJson, readJsonBody } = require('./http');

function fail(res, status, msg) {
  return sendJson(res, status, { code: status, msg, message: msg });
}

// 解析调用方：优先 staffToken，其次 authCode；都无效返回 null。
function resolveCaller(body) {
  if (body && typeof body.staffToken === 'string' && body.staffToken) {
    const staff = workspace.validateStaffToken(body.staffToken);
    if (staff) return { kind: 'staff', staff };
    return { kind: 'invalid', reason: 'staffToken 无效或已过期' };
  }
  if (body && typeof body.authCode === 'string' && body.authCode) {
    const auth = db.validateAuthCode(body.authCode);
    if (auth) return { kind: 'owner', machineCode: auth.machineCode };
    return { kind: 'invalid', reason: 'authCode 无效或已过期' };
  }
  return { kind: 'anonymous', reason: '缺少 authCode 或 staffToken' };
}

// 调用方是否有权访问该工作区。
function canAccessWorkspace(caller, workspaceId) {
  if (!caller || typeof workspaceId !== 'string') return false;
  if (caller.kind === 'owner') return workspace.isWorkspaceOwner(workspaceId, caller.machineCode);
  if (caller.kind === 'staff') return caller.staff.workspaceId === workspaceId;
  return false;
}

// 是否管理者（老板或主管）：能建员工、分配账号、看全部用量。
function isManager(caller) {
  return (
    caller.kind === 'owner' ||
    (caller.kind === 'staff' && caller.staff.role === 'supervisor')
  );
}

async function handleCreateWorkspace(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const caller = resolveCaller(body);
  if (caller.kind !== 'owner') {
    return fail(res, 401, caller.reason || '需要有效的机器授权码');
  }
  if (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 64) {
    return fail(res, 400, '工作区名称不能为空（上限 64 字符）');
  }
  const created = workspace.createWorkspace({
    name: body.name,
    ownerMachineCode: caller.machineCode,
  });
  return sendJson(res, 200, { code: 200, workspace: created });
}

async function handleListWorkspaces(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const caller = resolveCaller(body);
  if (caller.kind !== 'owner') {
    return fail(res, 401, caller.reason || '需要有效的机器授权码');
  }
  return sendJson(res, 200, {
    code: 200,
    workspaces: workspace.listWorkspacesByOwner(caller.machineCode),
  });
}

async function handleCreateStaff(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const caller = resolveCaller(body);
  if (caller.kind !== 'owner') {
    return fail(res, 401, caller.reason || '只有工作区老板（机器授权）能创建员工');
  }
  if (typeof body.workspaceId !== 'string' || !body.workspaceId) {
    return fail(res, 400, 'workspaceId 缺失');
  }
  if (!workspace.isWorkspaceOwner(body.workspaceId, caller.machineCode)) {
    return fail(res, 403, '该工作区不属于这台机器');
  }
  try {
    const staff = workspace.createStaff({
      workspaceId: body.workspaceId,
      username: body.username,
      password: body.password,
      displayName: body.displayName,
      role: body.role,
      createdBy: caller.machineCode,
    });
    return sendJson(res, 200, { code: 200, staff });
  } catch (err) {
    if (err.code === 'BAD_ROLE' || err.code === 'BAD_USERNAME' || err.code === 'BAD_PASSWORD') {
      return fail(res, 400, err.message);
    }
    if (err.code === 'DUPLICATE_USERNAME') {
      return fail(res, 409, err.message);
    }
    throw err;
  }
}

async function handleStaffLogin(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  if (
    typeof body.workspaceId !== 'string' ||
    typeof body.username !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return fail(res, 400, 'workspaceId / username / password 缺失');
  }
  const issued = workspace.verifyStaffLogin({
    workspaceId: body.workspaceId,
    username: body.username,
    password: body.password,
  });
  if (!issued) {
    return fail(res, 401, '用户名或密码错误');
  }
  return sendJson(res, 200, { code: 200, ...issued });
}

async function handleListStaff(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const caller = resolveCaller(body);
  if (caller.kind === 'invalid' || caller.kind === 'anonymous') {
    return fail(res, 401, caller.reason);
  }
  if (typeof body.workspaceId !== 'string' || !body.workspaceId) {
    return fail(res, 400, 'workspaceId 缺失');
  }
  if (!canAccessWorkspace(caller, body.workspaceId)) {
    return fail(res, 403, '无权访问该工作区');
  }
  // 客服只能看到自己；老板与主管看到全部。
  if (caller.kind === 'staff' && caller.staff.role === 'agent') {
    const self = workspace.getStaff(caller.staff.staffId);
    return sendJson(res, 200, { code: 200, staff: self ? [self] : [] });
  }
  return sendJson(res, 200, {
    code: 200,
    staff: workspace.listStaff(body.workspaceId),
  });
}

async function handleAssign(req, res, unassign) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const caller = resolveCaller(body);
  if (caller.kind === 'invalid' || caller.kind === 'anonymous') {
    return fail(res, 401, caller.reason);
  }
  if (typeof body.workspaceId !== 'string' || !body.workspaceId) {
    return fail(res, 400, 'workspaceId 缺失');
  }
  if (!canAccessWorkspace(caller, body.workspaceId)) {
    return fail(res, 403, '无权访问该工作区');
  }
  if (!isManager(caller)) {
    return fail(res, 403, '只有老板或主管能分配账号');
  }
  if (typeof body.staffId !== 'string' || typeof body.cardId !== 'string') {
    return fail(res, 400, 'staffId / cardId 缺失');
  }
  try {
    if (unassign) {
      const removed = workspace.unassignAccount({
        workspaceId: body.workspaceId,
        staffId: body.staffId,
        cardId: body.cardId,
      });
      return sendJson(res, 200, { code: 200, removed });
    }
    workspace.assignAccount({
      workspaceId: body.workspaceId,
      staffId: body.staffId,
      cardId: body.cardId,
      assignedBy:
        caller.kind === 'owner' ? caller.machineCode : caller.staff.staffId,
    });
    return sendJson(res, 200, { code: 200, assigned: true });
  } catch (err) {
    if (err.code === 'STAFF_NOT_FOUND' || err.code === 'BAD_CARD_ID') {
      return fail(res, 400, err.message);
    }
    throw err;
  }
}

async function handleMyAccounts(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const caller = resolveCaller(body);
  if (caller.kind !== 'staff') {
    return fail(res, 401, caller.reason || '需要员工登录 token');
  }
  // 主管看全部账号（scope: all）；客服只看被分配给自己的（scope: assigned）。
  if (caller.staff.role === 'supervisor') {
    const database = db.getDb();
    const rows = database
      .prepare(
        `SELECT DISTINCT card_id AS cardId FROM account_assignments
         WHERE workspace_id = ? ORDER BY card_id ASC`,
      )
      .all(caller.staff.workspaceId);
    return sendJson(res, 200, {
      code: 200,
      scope: 'all',
      cardIds: rows.map((r) => r.cardId),
    });
  }
  return sendJson(res, 200, {
    code: 200,
    scope: 'assigned',
    cardIds: workspace.getAssignedCardIds(caller.staff.workspaceId, caller.staff.staffId),
  });
}

async function handleUsageRecord(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  // 用量记账必须有机器授权；staffToken 有则用于归属到员工。
  const caller = resolveCaller(body);
  if (caller.kind !== 'owner' && caller.kind !== 'staff') {
    return fail(res, 401, caller.reason || '需要有效的机器授权码');
  }
  let staff = null;
  let workspaceId = null;
  if (caller.kind === 'staff') {
    staff = caller.staff;
    workspaceId = staff.workspaceId;
  } else {
    if (body.staffToken) {
      staff = workspace.validateStaffToken(body.staffToken);
      if (!staff) return fail(res, 401, 'staffToken 无效或已过期');
      workspaceId = staff.workspaceId;
    } else {
      workspaceId = workspace.resolveWorkspaceForMachine(
        caller.machineCode,
        body.workspaceId,
      );
    }
  }
  if (!workspaceId) {
    return fail(res, 400, '该机器尚未创建工作区');
  }
  if (
    typeof body.workspaceId === 'string' &&
    body.workspaceId &&
    body.workspaceId !== workspaceId
  ) {
    return fail(res, 403, 'workspaceId 与调用方身份不符');
  }
  try {
    const id = workspace.recordUsage({
      workspaceId,
      staffId: staff ? staff.staffId : null,
      kind: body.kind,
      amount: body.amount,
      cardId: body.cardId,
      note: body.note,
    });
    return sendJson(res, 200, { code: 200, eventId: id });
  } catch (err) {
    if (err.code === 'BAD_KIND' || err.code === 'BAD_AMOUNT') {
      return fail(res, 400, err.message);
    }
    throw err;
  }
}

async function handleUsageHeartbeat(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const caller = resolveCaller(body);
  if (caller.kind !== 'owner') {
    return fail(res, 401, caller.reason || '端口心跳需要机器授权码');
  }
  const workspaceId = workspace.resolveWorkspaceForMachine(
    caller.machineCode,
    body.workspaceId,
  );
  if (!workspaceId) {
    return fail(res, 400, '该机器尚未创建工作区');
  }
  if (!Array.isArray(body.onlineCardIds)) {
    return fail(res, 400, 'onlineCardIds 须为数组');
  }
  const cardIds = body.onlineCardIds.filter((x) => typeof x === 'string').slice(0, 1000);
  workspace.recordUsage({
    workspaceId,
    staffId: null,
    kind: 'port_online',
    amount: cardIds.length,
    note: JSON.stringify(cardIds),
  });
  const ws = workspace.getWorkspace(workspaceId);
  // Stage 1 只记录、不拦截：超端口时如实返回 overQuota，由界面提示，
  // 付费墙与硬拦截是阶段 2 的事。
  return sendJson(res, 200, {
    code: 200,
    workspaceId,
    online: cardIds.length,
    quota: ws ? ws.portQuota : 0,
    overQuota: ws ? cardIds.length > ws.portQuota : false,
  });
}

async function handleUsageSummary(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const caller = resolveCaller(body);
  if (caller.kind === 'invalid' || caller.kind === 'anonymous') {
    return fail(res, 401, caller.reason);
  }
  if (typeof body.workspaceId !== 'string' || !body.workspaceId) {
    return fail(res, 400, 'workspaceId 缺失');
  }
  if (!canAccessWorkspace(caller, body.workspaceId)) {
    return fail(res, 403, '无权访问该工作区');
  }
  // 客服只汇总自己的事件；老板与主管汇总全部。
  const staffId =
    caller.kind === 'staff' && caller.staff.role === 'agent'
      ? caller.staff.staffId
      : null;
  return sendJson(res, 200, {
    code: 200,
    summary: workspace.usageSummary({
      workspaceId: body.workspaceId,
      staffId,
      from: body.from,
      to: body.to,
    }),
  });
}

async function handleUsageDaily(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const caller = resolveCaller(body);
  if (caller.kind === 'invalid' || caller.kind === 'anonymous') {
    return fail(res, 401, caller.reason);
  }
  if (typeof body.workspaceId !== 'string' || !body.workspaceId) {
    return fail(res, 400, 'workspaceId 缺失');
  }
  if (!canAccessWorkspace(caller, body.workspaceId)) {
    return fail(res, 403, '无权访问该工作区');
  }
  const staffId =
    caller.kind === 'staff' && caller.staff.role === 'agent'
      ? caller.staff.staffId
      : null;
  return sendJson(res, 200, {
    code: 200,
    days: workspace.usageDaily({
      workspaceId: body.workspaceId,
      staffId,
      days: body.days,
    }),
  });
}

const ROUTES = {
  'POST /api/workspace/create': handleCreateWorkspace,
  'POST /api/workspace/list': handleListWorkspaces,
  'POST /api/workspace/staff/create': handleCreateStaff,
  'POST /api/workspace/staff/login': handleStaffLogin,
  'POST /api/workspace/staff/list': handleListStaff,
  'POST /api/workspace/staff/assign': (req, res) => handleAssign(req, res, false),
  'POST /api/workspace/staff/unassign': (req, res) => handleAssign(req, res, true),
  'POST /api/workspace/staff/me/accounts': handleMyAccounts,
  'POST /api/usage/record': handleUsageRecord,
  'POST /api/usage/heartbeat': handleUsageHeartbeat,
  'POST /api/usage/summary': handleUsageSummary,
  'POST /api/usage/daily': handleUsageDaily,
};

// 是本模块的路由则处理并返回 true；否则返回 false，交给 index.js 继续匹配。
async function handleWorkspaceRoute(req, res, pathname) {
  const key = `${req.method} ${pathname}`;
  const handler = ROUTES[key];
  if (!handler) return false;
  try {
    await handler(req, res);
  } catch (err) {
    if (!res.writableEnded) {
      sendJson(res, 500, { code: 500, msg: '服务器内部错误', message: '服务器内部错误' });
    }
  }
  return true;
}

module.exports = { handleWorkspaceRoute };
