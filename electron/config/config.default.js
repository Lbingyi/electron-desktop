'use strict';

const path = require('path');

/**
 * 默认配置
 */
module.exports = (appInfo) => {

  const config = {};

  /**
   * 开发者工具
   */
  config.openDevTools = false;

  /**
   * 应用程序顶部菜单
   */
  config.openAppMenu = false;

  /**
   * 主窗口
   */
  config.windowsOption = {
    title: 'seaToolbox',
    width: 1000,
    height: 700,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      //webSecurity: false,
      contextIsolation: true, // true -> 渲染进程只能经 preload bridge.js（contextBridge）访问白名单接口
      nodeIntegration: false,
      devTools: false,
      preload: path.join(appInfo.baseDir, 'preload', 'bridge.js'),
    },
    frame: true,
    show: false,
    icon: path.join(appInfo.home, 'public', 'images', 'logo-32.png'),
  };

  /**
   * ee框架日志
   */
  config.logger = {
    encoding: 'utf8',
    level: 'INFO',
    outputJSON: false,
    buffer: true,
    enablePerformanceTimer: false,
    rotator: 'day',
    appLogName: 'ee.log',
    coreLogName: 'ee-core.log',
    errorLogName: 'ee-error.log'
  }

  /**
   * 远程模式-web地址
   */
  config.remoteUrl = {
    enable: false,
    url: 'http://electron-egg.kaka996.com/'
  };

  /**
   * 内置socket服务
   */
  config.socketServer = {
    enable: false,
    port: 7070,
    path: "/socket.io/",
    connectTimeout: 45000,
    pingTimeout: 30000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    transports: ["polling", "websocket"],
    cors: {
      origin: true,
    },
    channel: 'c1'
  };

  /**
   * 内置http服务
   */
  config.httpServer = {
    enable: false,
    https: {
      enable: false,
      key: '/public/ssl/localhost+1.key',
      cert: '/public/ssl/localhost+1.pem'
    },
    host: '127.0.0.1',
    port: 7071,
    cors: {
      origin: "*"
    },
    body: {
      multipart: true,
      formidable: {
        keepExtensions: true
      }
    },
    filterRequest: {
      uris:  [
        'favicon.ico'
      ],
      returnData: ''
    }
  };

  /**
   * 主进程
   */
  config.mainServer = {
    protocol: 'file://',
    indexPath: '/public/dist/index.html',
  };

  /**
   * 硬件加速
   */
  config.hardGpu = {
    enable: true
  };

  /**
   * 异常捕获
   */
  config.exception = {
    mainExit: false,
    childExit: true,
    rendererExit: true,
  };

  /**
   * jobs
   */
  config.jobs = {
    messageLog: true
  };

  /**
   * 插件功能
   */
  config.addons = {
    window: {
      enable: true,
    },
    tray: {
      enable: true,
      title: 'seaToolbox',
      icon: '/public/images/tray.png'
    },
    security: {
      enable: true,
    },
    awaken: {
      enable: true,
      protocol: 'ee',
      args: []
    },
    autoUpdater: {
      enable: true,
      windows: false,
      macOS: false,
      linux: false,
      options: {
        provider: 'generic',
        // TODO(更新服务)：更新分发服务尚未搭建，feed 地址待接入真实地址后填写；
        // 当前三平台均为 false，不会发起任何更新请求。不要填占位/第三方地址。
        url: ''
      },
      force: false,
    }
  };

  return {
    ...config
  };
}
