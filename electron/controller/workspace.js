'use strict';
// Stage 1 云端骨架的控制器：渲染进程经 preload 白名单桥接调这里，
// 这里再调 Services.get('workspace')。返回体一律 {status, message, data}，
// 与 controller.login / controller.window 的约定一致。
const { Controller } = require('ee-core');
const Services = require('ee-core/services');

class WorkspaceController extends Controller {
  constructor(ctx) {
    super(ctx);
  }

  async createWorkspace(args) {
    try {
      const data = await Services.get('workspace').createWorkspace(args);
      return { status: true, message: '创建成功', data };
    } catch (err) {
      return { status: false, message: err.message || '创建工作区失败' };
    }
  }

  async listWorkspaces(args) {
    try {
      const data = await Services.get('workspace').listWorkspaces(args);
      return { status: true, message: '查询成功', data };
    } catch (err) {
      return { status: false, message: err.message || '查询工作区失败' };
    }
  }

  async createStaff(args) {
    try {
      const data = await Services.get('workspace').createStaff(args);
      return { status: true, message: '创建成功', data };
    } catch (err) {
      return { status: false, message: err.message || '创建员工失败' };
    }
  }

  async staffLogin(args) {
    try {
      const data = await Services.get('workspace').staffLogin(args);
      return { status: true, message: '登录成功', data };
    } catch (err) {
      return { status: false, message: err.message || '员工登录失败' };
    }
  }

  async listStaff(args) {
    try {
      const data = await Services.get('workspace').listStaff(args);
      return { status: true, message: '查询成功', data };
    } catch (err) {
      return { status: false, message: err.message || '查询员工失败' };
    }
  }

  async assignAccount(args) {
    try {
      const data = await Services.get('workspace').assignAccount(args);
      return { status: true, message: '分配成功', data };
    } catch (err) {
      return { status: false, message: err.message || '分配账号失败' };
    }
  }

  async unassignAccount(args) {
    try {
      const data = await Services.get('workspace').unassignAccount(args);
      return { status: true, message: '收回成功', data };
    } catch (err) {
      return { status: false, message: err.message || '收回账号失败' };
    }
  }

  async myAccounts(args) {
    try {
      const data = await Services.get('workspace').myAccounts(args);
      return { status: true, message: '查询成功', data };
    } catch (err) {
      return { status: false, message: err.message || '查询可见账号失败' };
    }
  }

  async usageSummary(args) {
    try {
      const data = await Services.get('workspace').usageSummary(args);
      return { status: true, message: '查询成功', data };
    } catch (err) {
      return { status: false, message: err.message || '查询用量失败' };
    }
  }

  async usageDaily(args) {
    try {
      const data = await Services.get('workspace').usageDaily(args);
      return { status: true, message: '查询成功', data };
    } catch (err) {
      return { status: false, message: err.message || '查询按日用量失败' };
    }
  }

  async heartbeat(args) {
    try {
      const data = await Services.get('workspace').heartbeat(args);
      return { status: true, message: '上报成功', data };
    } catch (err) {
      return { status: false, message: err.message || '心跳上报失败' };
    }
  }

  async getContext(args) {
    try {
      const data = await Services.get('workspace').getContext(args);
      return { status: true, message: '查询成功', data };
    } catch (err) {
      return { status: false, message: err.message || '查询上下文失败' };
    }
  }

  async clearContext(args) {
    try {
      const data = await Services.get('workspace').clearContext(args);
      return { status: true, message: '已退出员工登录', data };
    } catch (err) {
      return { status: false, message: err.message || '退出失败' };
    }
  }
}

WorkspaceController.toString = () => '[class WorkspaceController]';
module.exports = WorkspaceController;
