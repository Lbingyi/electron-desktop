# 阶段 0：基底缺陷修复报告

- 基底：NexaChat 免费开源版（MrJack351/electron-desktop），本地克隆 `~/workspace/electron-desktop-ref/`
- 依据：`STAGE0-VERIFICATION.md`（2026-11-14）
- 修复日期：2026-11-14（沙箱 Linux 环境）
- 范围：只改本地代码，未推 GitHub，未改品牌名/图标/后台地址（品牌名用户未定）；未编造任何假后端、假地址。
- 提交：本地 git commit 一次（未推 GitHub），工作树干净；提交哈希以 `git log` 为准。

---

## 1. 根 npm install 失败（better-sqlite3）——已修 ✅

**改动**
- `package.json`：`better-sqlite3` 由 `^11.5.0` 升级到 `^12.11.1`。

**为什么是这条路线**
- 先核实了官方预编译包：v12.11.1 有 Node 24（ABI 137）全平台预编译包（含 win32-x64），也有 Electron 31（ABI 125）预编译包；v13.1.1 反而没有 Node 24 预编译包。所以升级到 12.11.1 是最稳的路线，不用降 Node，不用源码编译。

**验证**
- 根 `npm install`：EXIT=0，779 个包，`node_modules` 587 条目（之前为空）。
- better-sqlite3 12.11.1 在 plain Node 24 下加载并读写正常（建表/插入/查询，probe=42）。
- `npm run re-sqlite`（electron-rebuild）：EXIT=0，走 prebuild 路径完成，无源码编译。装上的二进制经 md5 核对与官方 electron-v125 预编译包一致；并在 Electron 31 无头模式下加载验证通过（建表/插入/查询，probe=7，`process.versions.modules = 125`）。
- 结论：沙箱 EPERM（node-gyp 解压 fchown）对 better-sqlite3 12.11.1 已不构成障碍；Windows 真机上同样走预编译包，不需要 Python + VS 生成工具。

## 2. 前端 vite build 失败（缺依赖声明）——已修 ✅

**改动**
- `frontend/package.json` 的 dependencies 补声明 4 项（版本号按已安装的版本来）：
  - `lottie-web ^5.13.0`（原来只在根 package.json）
  - `nanoid ^3.3.20`（原来靠传递依赖苟活）
  - `vue3-lottie ^3.3.1`（原来只在根 package.json；引用它的 `LottieAnimation.vue` 目前无路由引用，是潜伏断点）
  - `@element-plus/icons-vue ^2.3.2`（原来靠传递依赖苟活）

**验证中发现并顺手修的潜伏问题**
- 补完声明后构建走到 513 个模块时又曝出新错误：`jsencrypt/bin/jsencrypt.min` 无法解析。根因：装上的 jsencrypt 是 3.5.4（`^3.3.2` 解析结果），其 `exports` 映射只开放 `"."` 与 `"./package.json"`，深路径导入被拦。修法：`rsaEncrypt.js` 的导入改为包的公开入口 `import JSEncrypt from 'jsencrypt'`（ESM 入口默认导出 JSEncrypt，已核实）。

**验证**
- 前端 `npm install`：EXIT=0（新增 3 个包）。
- `npm run build`（vite build）：EXIT=0，513 个模块，built in 约 41–47 秒。
- 根 `npm run build-frontend`（ee-bin build + move）：EXIT=0，`public/dist` 已用新构建替换，旧的预构建产物不再留存。

## 3. 硬编码 RSA 私钥——已移除 ✅（作废处理）

**改动**
- `frontend/src/utils/rsaEncrypt.js`：彻底删除私钥常量与 `decrypt()` 函数；只保留公钥 + `encrypt()`。文件内写明：该私钥随公开仓库泄露，视为已作废，禁止再把任何私钥放进客户端；授权服务器重建时须生成新密钥对并同步更新此处公钥（当前公钥与已作废私钥配对）。
- `frontend/src/views/login/Index.vue`：删除 `decrypt` 导入与整段“解密响应→验时间戳→验过期→存授权码→跳首页”逻辑；登录改为**失败即拒绝（fail closed）**：请求仍用公钥加密发出，但任何响应都视为不可信，直接提示“授权服务未就绪，登录已拒绝”，不存授权码、不跳转；网络失败时提示“授权服务不可达”。同时删了因此无用的 `useRouter` 导入、`saveAuthCode` 路由入口与 `router` 变量。
- 未在任何地方复制私钥；未编造假授权服务器。

**验证**
- `grep privateKey frontend/src electron`：0 命中；`grep decrypt frontend/src`：仅剩 fail-closed 注释里的一句话。
- 新 `public/dist` 里 grep `privateKey`：0 命中。旧 dist 包（含私钥的旧 bundle）已被新构建删除。
- 注意（未消除的风险）：私钥仍留在上游公开仓库与本地 git 历史（原始提交 `a72bda1`）里，无法“收回”，只能作废。根治办法是授权服务器建成时换新密钥对——这一步已写进上条与待办，不在本阶段。

## 4. 主窗口安全（nodeIntegration / contextIsolation）——已修 ✅

**改动**
- `electron/config/config.default.js`：`nodeIntegration: true` → `false`；`contextIsolation: false` → `true`；取消注释并启用 `preload: path.join(appInfo.baseDir, 'preload', 'bridge.js')`。已核实 `appInfo.baseDir` 在 ee-core 里即 `<项目根>/electron`，该路径就是 `electron/preload/bridge.js`，原作者注释掉的那一行路径本身就是对的。
- `electron/preload/bridge.js`：重写。不再暴露原始 `ipcRenderer` 对象；改为：
  - `window.electron.ipcRenderer`：只含 `invoke / on / removeAllListeners` 三个方法，且每个调用先校验频道是否在白名单内（非法频道直接抛错）；不暴露 `send / sendSync / once`。
  - invoke 白名单：渲染进程实际调用的 25 个 `controller.*` 频道（登录 1、会话 14、用户画像 3、更新器 4、示例 2；`controller.window.executeJavaScript` 明确排除，见第 6 项）。
  - listen 白名单：主进程向渲染进程推送的 5 个频道（`online-notify`、`new-message-notify`、`open-user-portrait`、`number_filter-notify`、`custom.app.updater`）。
  - `window.electronAPI`（供会话视图注入脚本用）保持原有 6 个方法不变（`languageList / translateText / sendMsg / newMsgNotify / showUserPortraitPanel / sendFilterNotify`），注入脚本只用其中 5 个，已核实无脚本用过原始 `ipcRenderer` 属性。
  - `load` 事件的 `execute-js-operation` 发送加了 `file://` 过滤：主窗口加载本地页面时不再发，主进程不再刷“没有找到该地址对应的 js 代码”错误日志；会话视图的 https 页面行为不变。
- `frontend/src/utils/ipcRenderer.js`：去掉 `window.require('electron')` 分支，改为只取 `window.electron`（附注释说明 nodeIntegration 已关）。

**验证**
- `node --check`：bridge.js、config.default.js 均通过。
- `grep window.require frontend/src`：仅剩注释里的一句话。
- 前端 `npm run build`：EXIT=0（ipcRenderer.js 改动后重跑）。
- 未验证（沙箱限制）：Electron 真实启动后主窗口能否正常加载、登录页机器码能否正常获取。须在 Windows 真机上验（见第 9 节）。

## 5. 会话视图自动弹 DevTools——已修 ✅

**改动**
- `electron/service/window.js` 的 `_addListener()` 内删除 `view.webContents.openDevTools()` 一行。

**验证**
- `grep openDevTools electron/service/window.js`：0 命中。仅剩配置项：`config.default.js` / `config.prod.js` 为 false；`config.local.js`（本地开发环境配置）保留 undocked DevTools——开发用，有意保留。

## 6. controller.window.executeJavaScript 被引用但不存在——删除引用 ✅

**决定：删除，不实现。**
- 事实：`frontend/src/views/platform/AsideCard.vue` 的 `executeCode` 函数与 `ipcApiRoute.executeJavaScript` 入口引用了不存在的主进程方法；模板里的触发按钮早已被注释掉，是死代码。
- 选删除的理由：实现它等于给渲染进程开一个向已登录会话视图执行任意 JS 的特权通道，任何主窗口 XSS 都能直接操作 WhatsApp/Telegram 登录态；合法的注入需求已有主进程按 URL 匹配 `electron/scripts/<平台>.js` 的流程（`electron/index.js` 的 `execute-js-operation`），不需要再开这个口子。

**改动**
- `AsideCard.vue`：删 `executeCode` 函数、`executeJavaScript` 路由入口、无用的 `jsCode` 变量；留注释说明去向。

**验证**
- `grep executeJavaScript frontend/src`：0 命中；`electron/index.js` 与 `electron/service/window.js` 里主进程内部的合法调用（`senderWebContents.executeJavaScript` / `view.webContents.executeJavaScript`）保留未动。
- 前端 `npm run build`：EXIT=0。

## 7. 更新器占位——已集中为 TODO ✅（未编假地址）

**改动**
- `electron/config/config.default.js`：autoUpdater 的 feed `http://kodo.qiniu.com/` 改为空字符串 + TODO 注释（更新分发服务未建，待接入真实地址后填写；当前三平台全为 false，不会发起任何更新请求）。
- `electron/service/updater.js`：`url: ''`、`token: ''` 原本就为空，补 TODO 注释说明同上。
- `electron/config/builder.json`：删除整段 `publish`（原先指向 electron-egg 上游仓库 `https://github.com/wallace5303/electron-egg`）。JSON 无注释，TODO 写在本报告与代码外的待办里：更新服务建成后再补 publish 配置。

**验证**
- `node -e JSON.parse(builder.json)`：合法 JSON，`publish` 键已不存在。
- `grep kodo.qiniu.com`（全仓库除 node_modules/.git）：0 命中。
- `node --check`：config.default.js、updater.js 通过。
- 未验证：electron-builder 完整打包（NSIS 目标需 Windows 环境，沙箱无法跑），见第 9 节。
- 有意未动：`config.default.js` 里 `remoteUrl` 的占位地址（`enable: false`，未启用）与 `package.json` 的 `repository` 上游地址——属品牌清理范畴，等品牌名定了统一处理。

## 8. lockfile 与提交 ✅

- 根 `package-lock.json`（362KB）与 `frontend/package-lock.json`（90KB）已生成（两次 `npm install` 产物）。
- 根 `.gitignore` 与 `frontend/.gitignore` 里忽略 `package-lock.json` 的行已删除（修正过程：第一次编辑误伤了根 `.gitignore` 末尾的 `pnpm-lock.yaml`，已恢复）。
- 本地 git commit `10a2e89`（amend 后，含本报告与最后的 dist 同步）：`阶段0修复：修通根依赖与前端构建，移除泄露的RSA私钥，加固主窗口`；提交后 `git status` 干净。未推 GitHub（fork 待用户浏览器操作，见阶段 0 验证报告第 9 节）。

### 改动文件清单

| 文件 | 改动 |
|---|---|
| `package.json` | better-sqlite3 `^11.5.0` → `^12.11.1` |
| `package-lock.json` | 新生成（原先被 .gitignore 忽略） |
| `.gitignore` / `frontend/.gitignore` | 删 `package-lock.json` 忽略行 |
| `frontend/package.json` | 补声明 lottie-web / nanoid / vue3-lottie / @element-plus/icons-vue |
| `frontend/package-lock.json` | 新生成 |
| `frontend/src/utils/rsaEncrypt.js` | 删私钥与 decrypt；导入改包公开入口 |
| `frontend/src/views/login/Index.vue` | 登录 fail closed；清无用导入/路由 |
| `frontend/src/utils/ipcRenderer.js` | 去 window.require 分支，只取 window.electron |
| `electron/preload/bridge.js` | 白名单桥接，不暴露原始 ipcRenderer |
| `electron/config/config.default.js` | 主窗口隔离 + preload；更新 feed 置空 TODO |
| `electron/service/window.js` | 删自动 openDevTools |
| `electron/service/updater.js` | url/token 补 TODO 注释 |
| `electron/config/builder.json` | 删上游 publish |
| `frontend/src/views/platform/AsideCard.vue` | 删 executeJavaScript 死引用 |
| `public/dist/` | 旧构建删除，用新构建替换（含私钥的旧 bundle 已清除） |
| `STAGE0-VERIFICATION.md` | 阶段 0 报告，随本次提交入库 |
| `STAGE0-FIXES.md` | 本报告 |

---

## 9. 还剩什么必须在用户 Windows 真机上验证

（接阶段 0 验证报告第 8 节，修完后更新）

1. **根依赖安装**：Windows 上 Node 24 + `npm install` 是否通过；`npx electron-rebuild -f -w better-sqlite3` 是否成功（沙箱已用预编译包走通，Windows 同样走预编译包，不需要源码编译；若换 Electron 大版本需重新走 electron-rebuild）。
2. **前端构建**：`npm run build` 与 `npm run build-frontend` 在 Windows 上是否通过（沙箱已通过）。
3. **启动**：`ee-bin dev`（或 `electron . --env=local`）能否打开主窗口、显示登录页；登录页 Lottie 动画是否正常；**主窗口隔离改动后重点看**：机器码能否正常获取（走 preload 桥接的新路径）、各页面 IPC 调用是否正常、有无白名单报错。
4. **授权登录**：目前登录一律拒绝（fail closed，属预期行为），直到授权服务器建成并实现服务端签名、客户端公钥验签；不要用旧的解密流程上线。
5. **会话与登录**：新建 WhatsApp / Telegram / TelegramK 会话，扫码登录，验证在线状态、头像、未读角标是否正常上报。
6. **翻译端到端**：需先有翻译后端（缺失项，阶段 1 建）；收消息自动翻译、发消息先翻译再发送、语言切换，逐项核对。
7. **注入脚本健康检查**：逐条核对验证报告第 5 节的选择器在当前 WhatsApp Web / Telegram Web 上是否还命中；WhatsApp 的混淆类名选择器最可能已失效。
8. **代理与指纹**：配一个代理建会话，验证分流与 UA 是否按会话隔离生效。
9. **打包**：`npm run build-w-64` 出 NSIS 安装包，安装后启动、托盘最小化是否正常；签名与更新通道另行安排（更新器目前是空配置，暂不验证）。
10. **托盘/唤醒**：托盘菜单、关闭→托盘、`ee://` 唤醒协议是否符合预期。

## 10. 有意未做的事

- 品牌名、图标、后台地址、授权逻辑（除 fail closed 外）、README：品牌名用户未定，等拍板后统一处理。
- 翻译后端、授权服务器、更新分发服务：三块全不在仓库里，属阶段 1+ 的建设项，本阶段只把调用侧改为 fail closed / TODO，不编假实现。
- 向作者确认授权（仓库无 LICENSE 文件）：仍是待办，见方案第 9 节。
- 示例代码（`controller.example.*`、example 视图与服务）：桥接白名单里保留了它的两个频道（前端示例页还在调用），随示例清理时一并移除。
- GitHub fork 到 Lbingyi 账号：需用户浏览器登录操作，见阶段 0 验证报告第 9 节。
