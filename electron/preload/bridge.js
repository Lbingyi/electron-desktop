// 预加载桥接（preload）：运行于隔离上下文（contextIsolation: true）。
// 只暴露白名单内的频道与方法；原始 ipcRenderer 对象绝不暴露给渲染进程。
const { contextBridge, ipcRenderer } = require('electron');

// 渲染进程可 invoke 的频道白名单（与 frontend/src 实际调用一致）。
// 注意：controller.window.executeJavaScript 不在白名单里——该通道不存在，
// 且不允许渲染进程向会话视图执行任意 JS（见 controller 层说明）。
const INVOKE_CHANNELS = new Set([
  // 登录
  'controller.login.getMachineCode',
  'controller.login.saveAuthCode',
  // 会话管理
  'controller.window.getSessions',
  'controller.window.addSession',
  'controller.window.deleteSession',
  'controller.window.refreshSession',
  'controller.window.selectSession',
  'controller.window.initSession',
  'controller.window.addConfigInfo',
  'controller.window.getConfigInfo',
  'controller.window.hideWindow',
  'controller.window.logout',
  'controller.window.filterNumber',
  'controller.window.getPhoneNumberList',
  'controller.window.deletePhoneNumber',
  'controller.window.sendMessage',
  // 用户画像 / 跟进
  'controller.user.addFollowRecord',
  'controller.user.getUserPortrait',
  'controller.user.updateUserInfo',
  // 更新器
  'controller.updater.appInfo',
  'controller.updater.checkForUpdater',
  'controller.updater.downloadApp',
  'controller.updater.relaunchApp',
  // 示例页（controller.example.*，随示例清理时一并移除）
  'controller.example.test',
  'controller.example.addWindow',
]);

// 主进程可向渲染进程推送的频道白名单
const LISTEN_CHANNELS = new Set([
  'online-notify',
  'new-message-notify',
  'open-user-portrait',
  'number_filter-notify',
  'custom.app.updater',
]);

function assertInvokeChannel(channel) {
  if (!INVOKE_CHANNELS.has(channel)) {
    throw new Error(`[bridge] invoke 被拒绝，未授权频道：${channel}`);
  }
}

function assertListenChannel(channel) {
  if (!LISTEN_CHANNELS.has(channel)) {
    throw new Error(`[bridge] listen 被拒绝，未授权频道：${channel}`);
  }
}

// 只暴露最小方法集的 IPC 包装：invoke / on / removeAllListeners。
// 不暴露 ipcRenderer 本体，不暴露 send / sendSync / once。
const safeIpc = {
  invoke: (channel, ...args) => {
    assertInvokeChannel(channel);
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, listener) => {
    assertListenChannel(channel);
    return ipcRenderer.on(channel, listener);
  },
  removeAllListeners: (channel) => {
    assertListenChannel(channel);
    return ipcRenderer.removeAllListeners(channel);
  },
};

// frontend/src/utils/ipcRenderer.js 通过 window.electron.ipcRenderer 取用
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: safeIpc,
});

// 在 contextBridge 中暴露 API 给渲染进程（供会话视图内的平台注入脚本使用）
contextBridge.exposeInMainWorld('electronAPI', {
  // 号码过滤通知
  sendFilterNotify: (data) => {
    ipcRenderer.send('filter-notify', data);
  },
  // 暴露通知函数，使用 Bulma 样式
  showNotification: ({ message = '默认通知', type = 'is-info' }) => {
    // 创建通知容器
    const notification = document.createElement('div');
    notification.classList.add('notification', type); // 使用 Bulma 的类

    // 设置通知的内HTML结构
    notification.innerHTML = `
      <button class="delete"></button>
      ${message}
    `;

    // 设置通知的基本样式和动画
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '9999',
      width: '320px',
      opacity: '0', // 初始透明度
      transform: 'translateY(-20px)', // 初始位移
      transition: 'opacity 0.4s ease, transform 0.4s ease', // 动画效果
    });

    // 将通知元素添加到页面中
    document.body.appendChild(notification);

    // 显示通知的动画效果
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateY(0)';
    }, 10);

    // 添加关闭按钮的事件
    const closeButton = notification.querySelector('.delete');
    closeButton.addEventListener('click', () => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        notification.remove();
      }, 400);
    });

    // 自动移除通知
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        notification.remove();
      }, 400);
    }, 3000); // 通知显示3秒后消失
  },
  languageList: () => {
    return ipcRenderer.invoke('language-list');
  },
  translateText: (args) => {
    return ipcRenderer.invoke('translate-text', args);
  },
  sendMsg: (args) => {
    return ipcRenderer.invoke('online-notify', args);
  },
  newMsgNotify: (args) => {
    return ipcRenderer.invoke('new-message-notify', args);
  },
  //打开用户画像弹窗
  showUserPortraitPanel: (args) => {
    return ipcRenderer.invoke('show-user-portrait-panel', args);
  }

});

// 在页面加载完成时发送消息，包括当前页面的 URL
// 注意：主窗口加载的是 file:// 本地页面，不需要注入平台脚本，只对 http(s) 页面发送。
window.addEventListener('load', () => {
  const currentURL = window.location.href;
  if (currentURL.startsWith('file://')) return;
  //执行对应平台的js代码
  ipcRenderer.send('execute-js-operation', currentURL);
  // window.electron.ipcRenderer.on('show-notify', async (event, args) => {
  //   const {type,message} = args;
  //   window.electron.showNotification(message, 'is-'+type);
  // });
});
