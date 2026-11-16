// 工作区 / 员工 / 用量接口的渲染进程封装。
// 经 preload 白名单桥接调主进程 controller.workspace.*，主进程再调本地后端；
// 机器授权码与员工 token 只留在主进程，渲染进程拿不到它们。
// 返回体一律主进程控制器的 {status, message, data}，调用方先判 res.status。
import { ipc } from '@/utils/ipcRenderer';

const ipcApiRoute = {
  createWorkspace: 'controller.workspace.createWorkspace',
  listWorkspaces: 'controller.workspace.listWorkspaces',
  createStaff: 'controller.workspace.createStaff',
  staffLogin: 'controller.workspace.staffLogin',
  listStaff: 'controller.workspace.listStaff',
  assignAccount: 'controller.workspace.assignAccount',
  unassignAccount: 'controller.workspace.unassignAccount',
  myAccounts: 'controller.workspace.myAccounts',
  usageSummary: 'controller.workspace.usageSummary',
  usageDaily: 'controller.workspace.usageDaily',
  heartbeat: 'controller.workspace.heartbeat',
  getContext: 'controller.workspace.getContext',
  clearContext: 'controller.workspace.clearContext',
};

function invoke(channel, args = {}) {
  return ipc.invoke(channel, args);
}

export function getWorkspaceContext() {
  return invoke(ipcApiRoute.getContext);
}

export function clearWorkspaceContext() {
  return invoke(ipcApiRoute.clearContext);
}

export function createWorkspace(name) {
  return invoke(ipcApiRoute.createWorkspace, { name });
}

export function listWorkspaces() {
  return invoke(ipcApiRoute.listWorkspaces);
}

export function createStaff({ workspaceId, username, password, displayName, role }) {
  return invoke(ipcApiRoute.createStaff, { workspaceId, username, password, displayName, role });
}

export function staffLogin({ workspaceId, username, password }) {
  return invoke(ipcApiRoute.staffLogin, { workspaceId, username, password });
}

export function listStaff(workspaceId) {
  return invoke(ipcApiRoute.listStaff, { workspaceId });
}

export function assignAccount({ workspaceId, staffId, cardId }) {
  return invoke(ipcApiRoute.assignAccount, { workspaceId, staffId, cardId });
}

export function unassignAccount({ workspaceId, staffId, cardId }) {
  return invoke(ipcApiRoute.unassignAccount, { workspaceId, staffId, cardId });
}

export function myAccounts() {
  return invoke(ipcApiRoute.myAccounts);
}

export function usageSummary(workspaceId) {
  return invoke(ipcApiRoute.usageSummary, { workspaceId });
}

export function usageDaily(workspaceId, days = 7) {
  return invoke(ipcApiRoute.usageDaily, { workspaceId, days });
}

// 角色中文名（老板是机器本身，不走员工登录；员工只有主管 / 客服两档）。
export const ROLE_LABELS = Object.freeze({
  owner: '老板',
  supervisor: '主管',
  agent: '客服',
});

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}
