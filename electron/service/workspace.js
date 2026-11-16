'use strict';
// Stage 1 云端骨架的客户端代理：渲染进程经 IPC 调这里，这里再调本地后端
// （http://localhost:8000），机器授权码 authCode 只留在主进程内存里，
// 绝不下发给渲染进程。员工 token 与当前工作区同样只存主进程（app 对象），
// 渲染进程只拿到员工的公开资料（id、用户名、角色、显示名）。
const { Service } = require('ee-core');
const { app } = require('electron');
const request = require('../utils/request');

// 调后端：成功返回 data 部分；失败抛 Error（带上服务器的 msg，便于界面提示）。
async function callServer(path, body) {
  let res;
  try {
    res = await request.post(path, body);
  } catch (err) {
    const msg =
      (err && err.response && err.response.data && err.response.data.msg) ||
      (err && err.message) ||
      '请求后端失败';
    throw new Error(msg);
  }
  if (!res || res.code !== 200) {
    throw new Error((res && res.msg) || '后端返回异常');
  }
  return res;
}

class WorkspaceService extends Service {
  constructor(ctx) {
    super(ctx);
  }

  // —— 老板（机器授权）操作：须先登录拿到 app.authCode ——
  async createWorkspace(args) {
    if (!app.authCode) throw new Error('请先完成机器授权登录');
    const res = await callServer('/api/workspace/create', {
      authCode: app.authCode,
      name: args.name,
    });
    return res.workspace;
  }

  async listWorkspaces() {
    if (!app.authCode) throw new Error('请先完成机器授权登录');
    const res = await callServer('/api/workspace/list', { authCode: app.authCode });
    return res.workspaces;
  }

  async createStaff(args) {
    if (!app.authCode) throw new Error('请先完成机器授权登录');
    const res = await callServer('/api/workspace/staff/create', {
      authCode: app.authCode,
      workspaceId: args.workspaceId,
      username: args.username,
      password: args.password,
      displayName: args.displayName,
      role: args.role,
    });
    return res.staff;
  }

  // —— 员工登录：成功后把 token 与当前工作区记在主进程内存 ——
  async staffLogin(args) {
    const res = await callServer('/api/workspace/staff/login', {
      workspaceId: args.workspaceId,
      username: args.username,
      password: args.password,
    });
    app.workspaceId = res.workspaceId;
    app.staffToken = res.staffToken;
    app.staffProfile = {
      staffId: res.staffId,
      username: res.username,
      displayName: res.displayName,
      role: res.role,
      workspaceId: res.workspaceId,
      expiresAt: res.expiresAt,
    };
    return app.staffProfile;
  }

  async listStaff(args) {
    const body = { workspaceId: args.workspaceId };
    if (app.staffToken) body.staffToken = app.staffToken;
    else if (app.authCode) body.authCode = app.authCode;
    else throw new Error('请先登录');
    const res = await callServer('/api/workspace/staff/list', body);
    return res.staff;
  }

  async assignAccount(args) {
    const body = {
      workspaceId: args.workspaceId,
      staffId: args.staffId,
      cardId: args.cardId,
    };
    if (app.staffToken) body.staffToken = app.staffToken;
    else if (app.authCode) body.authCode = app.authCode;
    else throw new Error('请先登录');
    await callServer('/api/workspace/staff/assign', body);
    return { assigned: true };
  }

  async unassignAccount(args) {
    const body = {
      workspaceId: args.workspaceId,
      staffId: args.staffId,
      cardId: args.cardId,
    };
    if (app.staffToken) body.staffToken = app.staffToken;
    else if (app.authCode) body.authCode = app.authCode;
    else throw new Error('请先登录');
    const res = await callServer('/api/workspace/staff/unassign', body);
    return { removed: res.removed };
  }

  async myAccounts() {
    if (!app.staffToken) throw new Error('请先以员工身份登录');
    const res = await callServer('/api/workspace/staff/me/accounts', {
      staffToken: app.staffToken,
    });
    return { scope: res.scope, cardIds: res.cardIds };
  }

  async usageSummary(args) {
    const body = { workspaceId: args.workspaceId };
    if (args.from) body.from = args.from;
    if (args.to) body.to = args.to;
    if (app.staffToken) body.staffToken = app.staffToken;
    else if (app.authCode) body.authCode = app.authCode;
    else throw new Error('请先登录');
    const res = await callServer('/api/usage/summary', body);
    return res.summary;
  }

  async usageDaily(args) {
    const body = { workspaceId: args.workspaceId, days: args.days || 7 };
    if (app.staffToken) body.staffToken = app.staffToken;
    else if (app.authCode) body.authCode = app.authCode;
    else throw new Error('请先登录');
    const res = await callServer('/api/usage/daily', body);
    return res.days;
  }

  async heartbeat(args) {
    if (!app.authCode) throw new Error('请先完成机器授权登录');
    const res = await callServer('/api/usage/heartbeat', {
      authCode: app.authCode,
      workspaceId: args.workspaceId || app.workspaceId,
      onlineCardIds: args.onlineCardIds || [],
    });
    return { online: res.online, quota: res.quota, overQuota: res.overQuota };
  }

  // —— 上下文（只读，供界面显示当前身份）——
  async getContext() {
    return {
      hasAuthCode: !!app.authCode,
      workspaceId: app.workspaceId || null,
      staff: app.staffProfile || null,
    };
  }

  // 员工退出：只清员工上下文，机器授权不动（重登机器授权要走登录页）。
  async clearContext() {
    app.workspaceId = null;
    app.staffToken = null;
    app.staffProfile = null;
    return { cleared: true };
  }
}

WorkspaceService.toString = () => '[class WorkspaceService]';
module.exports = WorkspaceService;
