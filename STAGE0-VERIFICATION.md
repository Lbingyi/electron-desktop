# 阶段 0：基底清理与验证报告

- 基底：NexaChat 免费开源版（MrJack351/electron-desktop），本地克隆 `~/workspace/electron-desktop-ref/`
- 验证日期：2026-11-14（沙箱 Linux 环境）
- 结论先说：**基底代码结构完整、设计可用，但开箱即坏两处**——根依赖装不上（better-sqlite3 原生编译失败，npm 整体回滚），前端构建失败（缺 `lottie-web` 声明）。翻译后端不在仓库里，必须自建。Electron 界面启动、真机登录、打包都还没法在本沙箱验证。
- 本次只做本地验证与清理，未对外发任何东西，未推 GitHub，未改任何品牌名/图标/后台地址（品牌名用户未定，见第 6 节清单）。

---

## 1. 清查结果

### 1.1 环境

| 项目 | 结果 |
|---|---|
| Node | v24.22.1（ABI 137） |
| npm | 10.9.4 |
| 仓库文件 | 177 个（已删除 phoneNumber.txt，见 1.4） |
| 代码量 | 约 8900 行（electron 5637 行 / frontend/src 2494 行 / public 275 行，含 JS/Vue/less/css/html；注入脚本另计 2916 行） |
| package-lock.json | **没有**（且 `.gitignore` 明确忽略了它，版本无法锁定复现） |
| LICENSE 文件 | **没有**（根 package.json 声明 `"license": "Apache"`，但仓库无 LICENSE 正文） |
| git remote | `origin https://github.com/MrJack351/electron-desktop.git`（未动） |

### 1.2 依赖清单

**根 `package.json`**（name `seatoolbox` v1.0.0，description “WhatsApp,Telegram,多账号管理工具.独立会话;独立IP;独立Cookie;聊天实时翻译.”）：

- 依赖：axios 1.7.7、better-sqlite3 ^11.5.0、dayjs、ee-core 2.11.0、ee-incremental-updater ^2.1.0、electron-updater 6.3.9、lodash、lottie-web ^5.12.2、node-machine-id、vue3-lottie ^3.3.1
- 开发依赖：@electron/rebuild ^3.2.13、ee-bin ^1.8.3、electron 31.0.0、electron-builder ^23.6.0、eslint、icon-gen、nodemon
- 脚本：`dev`（`chcp 65001&ee-bin dev`，含 Windows 专用的 chcp，Linux 下不可用）、`build-frontend`、`build-w-64`（NSIS + updater）、`re-sqlite` / `build-sqlite`（electron-rebuild -f -w better-sqlite3）、`start`（`ee-bin start`，prod 模式）

**前端 `frontend/package.json`**（name `seatoolbox` v1.0.0）：Vue 3.2.33、Element Plus 2.8.6、vue-router 4.0.14、axios、echarts 5.5.1、vue-echarts、jsencrypt 3.3.2、vite 4.4.4、@vitejs/plugin-vue 4.2.3、less、terser。构建输出 `frontend/dist`，由 `ee-bin move` 拷到 `public/dist`。

### 1.3 入口与启动链

- `main.js`：仅两行，`new ElectronEgg()`（ee-core 框架入口）。
- `electron/index.js`：`Application` 子类。启动时建 better-sqlite3（`session.db`）并同步 5 张表：`cards`（会话）、`card_config`（每会话 UA / cookie / 代理）、`number_record`（号码过滤记录）、`user_portrait`（画像）、`follow_up_record`（跟进记录）。注册 IPC：`language-list`、`translate-text`、`online-notify`、`execute-js-operation`（按 URL 匹配平台名，读 `electron/scripts/<平台>.js` 注入到发送方 webContents）、`filter-notify`、`new-message-notify`、`show-user-portrait-panel`。
- `electron/preload/index.js`：只显式创建了 **tray** 和 **security** 两个 addon，并加载 updater service。awaken、autoUpdater、chromeExtension 三个 addon 未在此显式创建——是否由 ee-core 按 config 自动加载，**本次未验证**（ee-core 未装上，见第 3 节）。
- `electron/preload/bridge.js`：用 contextBridge 暴露 `window.electronAPI`（languageList / translateText / sendMsg / newMsgNotify / showUserPortraitPanel / sendFilterNotify），页面 load 时发 `execute-js-operation` 触发注入。但主窗口配置里 `contextIsolation: false` + `nodeIntegration: true`，主窗口实际上绕过了这套隔离（见第 4 节缺陷）。
- 会话视图（`electron/service/window.js`）：每个会话一个 `WebContentsView`，`partition: persist:<cardId>`（会话隔离成立），sandbox:true、contextIsolation:true、nodeIntegration:false，preload 为 bridge.js。平台地址：Telegram `https://web.telegram.org/a/`、TelegramK `https://web.telegram.org/k/`、WhatsApp `https://web.whatsapp.com/`。**没有 Signal**（符合方案：Signal 只做后期实验模块）。`assets/svgs/tiktok.svg` 存在但无任何代码引用。

### 1.4 三个配置文件

| 文件 | 要点 |
|---|---|
| `config.default.js` | 主窗口 1000×700、标题 `seaToolbox`、图标 `public/images/logo-32.png`；remoteUrl/socketServer/httpServer 均关闭；主窗口入口 `file://public/dist/index.html`；hardGpu 开；addons：window/tray/security/awaken 开；**autoUpdater 三平台（windows/macOS/linux）全为 false**，feed URL 为占位 `http://kodo.qiniu.com/`；remoteUrl 占位 `http://electron-egg.kaka996.com/` |
| `config.prod.js` | 仅关 DevTools、关 jobs 日志 |
| `config.local.js` | 仅开 undocked DevTools |

### 1.5 安全清理（已做）

- **`phoneNumber.txt` 已删除**（`git status` 仅此一项删除）。删除前未读取、未复述其内容。
- 其余清理未动手：品牌名、图标、后台地址、授权逻辑 **一律未改**，只列清单（第 6 节），等用户拍板品牌名。

---

## 2. 能跑的（已验证通过）

| # | 项目 | 结果 |
|---|---|---|
| 1 | 前端 `npm install` | ✅ 成功，164 个包，EXIT=0（`frontend/node_modules` 222M） |
| 2 | 主进程 JS 语法 | ✅ `node --check` 扫过 `electron/` 全部 JS 文件，无语法错误 |
| 3 | 会话隔离设计 | ✅ 代码层面成立：每会话独立 `persist:<cardId>` partition + 独立 UA（随机 Chrome 100–130）+ 每会话代理（http/https/socks4/socks5 + 代理认证）+ cookie 注入 |
| 4 | 数据库层 | ✅ `DatabaseUtils.js`（better-sqlite3 封装：建表/增删改查/表结构同步）代码完整；5 张表结构在 `electron/index.js` 内定义 |
| 5 | IPC 链路设计 | ✅ 翻译/在线状态/新消息/画像/号码过滤的 IPC 通道在主进程与 preload 桥两端对得上号 |
| 6 | 托盘/安全 addon 代码 | ✅ 代码完整（关闭→最小化到托盘；禁 `--inspect` 等远程调试启动参数） |

---

## 3. 坏掉的（已验证失败）

### 3.1 根 `npm install` 失败：better-sqlite3 原生编译失败，npm 整体回滚

- 现象：`npm install` 在 better-sqlite3 步骤失败，随后 `rolling back install`，**根 `node_modules` 为空（0 个条目）**——electron、ee-core、ee-bin、electron-updater 全都不存在。日志：`~/.npm/_logs/2026-11-14T08_35_47_311Z-debug-0.log`。
- 根因链（已验证）：
  1. npm 把 `better-sqlite3@^11.5.0` 解析到 **11.10.0**。
  2. 本机 Node 24（ABI 137）没有可用的预编译二进制，prebuild-install 未命中，回落到源码编译。
  3. node-gyp 下载 Node 24 头文件解压时失败：`TAR_ENTRY_ERROR EPERM: operation not permitted, fchown`——**沙箱限制**（不允许 fchown），不是仓库本身的错。
- 为什么这不只是沙箱问题：11.10.0 的预编译也不覆盖 Node 24（ABI 137），在用户 Windows 真机上同样会回落源码编译，需要 Python + Visual Studio C++ 生成工具。规避路线（二选一，属阶段 1 的事）：降 Node 到 20/22（有预编译），或升级 better-sqlite3 到支持 Node 24 的版本；且最终要走 `electron-rebuild`（对 Electron 31 内置 Node 20、ABI 115 重编）。

### 3.2 前端 `vite build` 失败：缺 `lottie-web` 声明

- 现象：`vite build` EXIT=1，`Rollup failed to resolve import "lottie-web" from "src/views/login/Index.vue"`。构建在 315 个模块转换后中止。
- 根因：`lottie-web` 只写在**根** package.json 里，`frontend/package.json` 没声明；前端 `node_modules` 里没有它。
- 同类隐患（已查实，未修复）：
  - `nanoid`（AsideCard.vue 用）未声明，当前能解析只是因为它作为传递依赖恰好存在于 `frontend/node_modules`——靠运气。
  - `vue3-lottie`（LottieAnimation.vue 用）未声明且未安装；目前不触发构建失败只因为没有任何路由引用 LottieAnimation.vue——潜伏的断点。
  - `@element-plus/icons-vue`（AsideCard.vue、登录页用）未声明，当前靠传递依赖存在。
- 后果：`npm run build-frontend`（ee-bin build + move）在当前状态下跑不通；仓库里提交的 `public/dist`（1.8M）是**旧的预构建产物**，掩盖了这个问题——改任何前端代码重新构建都会失败。

### 3.3 更新器：两套实现，全部是空配置

- `electron/addon/autoUpdater`（electron-updater）：config 里三平台全 false，`create()` 直接 return；feed URL 是占位 `http://kodo.qiniu.com/`。
- `electron/service/updater.js`（ee-incremental-updater）：`url: ''`、`token: ''` 全空。
- 结论：更新通道目前**完全不可用**，且打包配置 `builder.json` 的 publish 地址指向 electron-egg 上游仓库（`https://github.com/wallace5303/electron-egg`），不是本项目。

### 3.4 其他已发现的缺陷（静态审计）

| # | 缺陷 | 位置 | 影响 |
|---|---|---|---|
| 1 | **RSA 私钥硬编码在前端源码里** | `frontend/src/utils/rsaEncrypt.js`（公钥 + 私钥都在文件里，会打进客户端 bundle） | 授权机制形同虚设：任何人可用私钥解密授权服务器的响应，自造授权码。私钥必须作废、移出客户端，只留服务端 |
| 2 | 主窗口 `nodeIntegration: true` + `contextIsolation: false` | `config.default.js` windowsOption | 前端一旦有 XSS 即等于本地代码执行；与 preload 桥的隔离设计自相矛盾 |
| 3 | 每个会话视图都自动打开 DevTools | `electron/service/window.js` `_addListener()` 内 `view.webContents.openDevTools()` | 调试残留：用户打开的每个账号会话都会弹出 DevTools |
| 4 | 登录页无离线兜底 | `frontend/src/views/login/Index.vue` | 登录强依赖授权服务器 `/authManage/clientAuth`；服务器不可达或地址还是占位时，整个客户端进不去 |
| 5 | 引用了不存在的 IPC 通道 | `AsideCard.vue` 的 `controller.window.executeJavaScript`，`electron/controller/window.js` 无此方法（按钮目前被注释，未触发） | 调用即报错；属死代码 |
| 6 | 死代码 /  stale 注释 | `electron/scripts/WhatsApp.js` 的 `generateSign()` 从未被调用；`service/window.js` 的 `filterNumber` 注释引用不存在的 `WhatsAppNumberFilter.js`；`logOut()` 把标题写成 `setToolbox`（拼写错误）；`builder.json` 的 copyright 写成 `© 202$4 fluent Technology Co., Ltd.` | 清理时顺手清掉 |
| 7 | 无 lockfile | 根与前端均无 package-lock.json，`.gitignore` 还忽略它 | 每次安装解析到的版本都可能不同，无法复现 |

---

## 4. 缺失的（必须补的）

按调用链核实，后端分三块，**全部不在仓库里**：

| # | 缺失项 | 调用方 | 协议（按代码反推） |
|---|---|---|---|
| 1 | 翻译服务：`GET /api/languageList/languageList`、`POST /api/translate` | 主进程 `electron/utils/request.js`（baseURL 硬编码 `http://localhost:8000`，超时 10s）→ `electron/api/index.js` | `POST /api/translate` 入参 `{fromLang, targetLang, text, authCode}`，成功返回 `{code: 200, data: <译文>}`；`authCode` 是登录时从授权服务器拿到的授权码，随每个翻译请求带上 |
| 2 | 授权/许可服务器：`POST /authManage/clientAuth` | 前端登录页（VITE_BASE_API，开发 `http://localhost:8000/api`，生产占位 `https://www.test.com/api`） | 前端发 RSA 加密的 `{machineCode, authCode: '', timestamp}`，服务器回 RSA 加密的 `{timestamp, expiryDate}`；本机硬件码由 `node-machine-id` 取；过期后登录页提示“账号已到期请联系管理员续费” |
| 3 | 更新分发服务 | 两套更新器（见 3.3） | 需自建 feed / 增量包托管 |

不在免费版仓库里、但产品要卖必须另起炉灶的（不属于“缺失的基底”，属于阶段 1+ 要建的）：云端管理台、多租户/计费、AI 回复、Signal 接入（signal-cli 桥接，见方案阶段 4）。

翻译缓存不缺：注入脚本用页面内 IndexedDB（`TranslationDB`，以原文+语言为复合主键）做本会话翻译缓存，随会话 partition 隔离。

---

## 5. 注入脚本审计：结构与硬编码选择器

注入时机：页面 `load` 后主进程发 `execute-js-operation`，按 URL 匹配平台名，把 `electron/scripts/<平台>.js` 用 `executeJavaScript` 注入到该会话视图内执行。三个脚本共 2916 行（WhatsApp 959 / Telegram 1091 / TelegramK 866）。

### 5.1 WhatsApp.js（web.whatsapp.com）——最脆弱

机制：

- 每 5 秒轮询登录态（见下表选择器 1），上报在线状态与头像 URL。
- `MutationObserver` 等 `#pane-side` 出现后监听 `aria-selected` 变化；每 500ms 扫描未翻译的消息 span，逐条调翻译接口，译文以自定义节点插到原消息下方（IndexedDB 缓存）。
- 拦截发送：监听输入框 `keydown` Enter，先翻译再点发送按钮；另注入语言选择按钮/弹窗。

硬编码选择器（按脆弱程度排序）：

| # | 选择器（截断示意） | 用途 | 脆弱点 |
|---|---|---|---|
| 1 | `#app > div > div.two._aigs.x1n2onr6.x13vifvy…（约 600 字符，30+ 个混淆类名）… > header … > div` | 登录态判定 + 头像 | **极高**：Meta 的混淆类名（`x1n2onr6` 式）随版本滚动即变，一改版整条失效；且选择器长达数百字符，无法手工维护 |
| 2 | `div.x12lqup9.x1o1kx08` | 号码过滤（`filterNumber` 内联脚本） | **极高**：同为混淆类名 |
| 3 | `footer div[aria-owns="emoji-suggestion"][contenteditable="true"]` | 消息输入框 | 中：依赖 WhatsApp 输入框的 aria 结构 |
| 4 | `span.selectable-text.copyable-text[data-lexical-text="true"]` | 待发送文本 | 中：依赖 Lexical 编辑器内部属性 |
| 5 | `footer span[data-icon="send"]` | 发送按钮 | 中低：`data-icon` 相对稳定 |
| 6 | `div[role=application]`、`span[dir] > span`、`#pane-side`、`div#main` | 消息列表/滚动容器 | 低：语义属性，相对稳定 |
| 7 | 读取 `__reactProps$` 属性取聊天对象 key | 用户画像按钮 | 高：React 内部属性名，随 React 版本可变 |

另：`generateSign()`（SHA-256 签名）是死代码，未被调用。

### 5.2 Telegram.js（web.telegram.org/a/，Telegram Web A）

- 登录态：每 5 秒查 `#LeftColumn-main > div.NewChatButton`，在线时头像写死为 Wikimedia 的 Telegram logo 外链。
- 新消息：监听 `div.ChatBadge.unread:not(.muted)`；消息翻译走 `div.messages-container` / `ul.chatlist` / `div.chat-list` 扫描。
- 选择器多为语义类名（`NewChatButton`、`ChatBadge`、`messages-container`），比 WhatsApp 的混淆类名稳定一个量级，但仍是 DOM 耦合；另有 `button.Button.symbol-menu-button.default.translucent.round` 这类长 class 链。
- 注意：Telegram 官方有 MTProto，注入 Web 版只是基底现成做法；阶段 1 应评估是否改走 gram.js，比 DOM 注入稳。

### 5.3 TelegramK.js（web.telegram.org/k/，Telegram Web K）

- 与 Telegram.js 同构，登录态查 `#new-menu > div`，消息区 `#column-center div.scrollable.scrollable-y`、`ul.chatlist`。
- 两个 Telegram 变体共存是历史遗留：Web A 与 Web K 是同一产品的两个前端版本，长期维护两份脚本是双倍成本；阶段 1 建议只保留一个（优先 Web A）或统一走 MTProto。

### 5.4 通用脆弱点

- 三个脚本都是“轮询 + MutationObserver 扫描整棵 DOM”的做法，`processMessageList` 每 500ms 全量扫，消息多时会有效率与重复翻译风险（靠 `data-translate-status` 属性去重）。
- 翻译失败只把节点标 `failed`，无重试、无降级提示。
- 登录态用 5 秒轮询而非事件，头像 URL 以 `?.src` 直接取，WhatsApp 改版即失效。

---

## 6. 品牌/后台替换位置清单（未改，等用户拍品牌名）

| 位置 | 现状 | 待定 |
|---|---|---|
| `package.json` | name `seatoolbox`；description 含 WhatsApp/Telegram 文案；author `Mr`；repository 指向 electron-egg 上游；license 字段 `Apache`（无 LICENSE 文件） | 品牌名、作者、仓库地址、LICENSE 文件补齐 |
| `frontend/package.json` | name `seatoolbox` | 品牌名 |
| `electron/config/config.default.js` | 窗口标题 `seaToolbox`；托盘标题 `seaToolbox`；remoteUrl `http://electron-egg.kaka996.com/`；更新 feed `http://kodo.qiniu.com/` | 品牌名、remoteUrl（不用则留空关闭）、更新服务器地址 |
| `electron/config/builder.json` | productName `seaToolbox`；appId `fusion.fluent.com`；copyright `© 202$4 fluent Technology Co., Ltd.`；shortcutName `seaToolbox`；publish URL 指向 electron-egg | 品牌名、appId、版权行、发布地址 |
| `electron/config/bin.js` | macOS 增量更新路径含 `seaToolbox.app` | 品牌名 |
| `electron/controller/example.js` | 返回 `'hello electron-egg'`（示例代码，建议删除） | 随示例清理 |
| 图标/Logo | `frontend/src/assets/logo.png`（256×256）、`public/images/logo.png`、`public/images/logo-32.png`、`public/images/tray.png`、`build/icons/` 全套（ico/icns/png） | 新品牌图标 |
| `frontend/.env.development` / `.env.production` | `VITE_TITLE=""`（空）、`VITE_GO_URL`（prod 为 `http://www.test.com`）、`VITE_BASE_API`（prod 为 `https://www.test.com/api`，dev 为 `http://localhost:8000/api`） | 授权/翻译后端真实地址 |
| `electron/utils/request.js` | 翻译后端 baseURL 硬编码 `http://localhost:8000` | 翻译后端真实地址 |
| `README.md` / `README-v3.2.md` | NexaChat 产品说明与截图 | 重写为本产品说明 |
| `public/dist/` | 旧的预构建前端（1.8M），构建修好后重建并重新提交或改走构建时生成 | 重建 |
| 示例残留 | `electron/controller/example.js`、`electron/service/example.js`、`electron/jobs/example/hello.js`、`timer.js` | 删除 |

---

## 7. 试过的启动测试（沙箱限制，如实记录）

| 测试 | 结果 |
|---|---|
| `npm install`（根） | ❌ 失败，见 3.1；根 node_modules 为空 |
| `npm install`（前端） | ✅ 成功，164 包 |
| `vite build`（前端） | ❌ 失败 EXIT=1，见 3.2 |
| `node --check`（主进程全部 JS） | ✅ 通过 |
| Electron 启动（`ee-bin dev` / `electron .`） | ⛔ **无法试**：electron 二进制不存在（根安装失败）；且本沙箱无 GUI、无头 Chrome 联网被代理拒绝，Electron 界面即使装上也跑不起来 |
| WhatsApp/Telegram 网页加载、扫码登录、翻译端到端 | ⛔ **无法试**：无 Electron、无浏览器联网、无真实账号 |
| electron-builder 打包（NSIS） | ⛔ **无法试**：缺 electron 与全部根依赖 |

以上“无法试”的项不是结论，是沙箱限制；不要把它们当成“基底不行”的证据。

---

## 8. 必须在用户 Windows 真机上验证的

1. **根依赖安装**：在用户 Windows 上装 Node（建议先试 Node 20 LTS；Node 24 下 better-sqlite3 需源码编译，要装 Python + VS 生成工具），`npm install` 是否通过；随后 `npx electron-rebuild -f -w better-sqlite3` 是否成功（对 Electron 31 重编）。
2. **前端构建**：补上缺失的依赖声明（`lottie-web` 等，阶段 1 修）后 `npm run build` 是否通过；`npm run build-frontend`（ee-bin build + move 到 `public/dist`）是否通过。
3. **启动**：`ee-bin dev`（或 `electron . --env=local`）能否打开主窗口、显示登录页；登录页 Lottie 动画是否正常。
4. **授权登录**：输入机器码→调授权服务器→进首页，全程需真实授权服务器在线；注意 RSA 私钥泄露问题须先修（见 3.4 缺陷 1），否则不要用这套授权上线。
5. **会话与登录**：新建 WhatsApp / Telegram / TelegramK 会话，扫码登录，验证在线状态、头像、未读角标是否正常上报。
6. **翻译端到端**：需先有翻译后端（第 4 节缺失项 1）；收消息自动翻译、发消息先翻译再发送、语言切换，逐项核对。
7. **注入脚本健康检查**：逐条核对第 5 节的选择器在当前 WhatsApp Web / Telegram Web 上是否还命中；WhatsApp 的混淆类名选择器最可能已失效。
8. **代理与指纹**：配一个代理建会话，验证分流与 UA 是否按会话隔离生效。
9. **打包**：`npm run build-w-64` 出 NSIS 安装包，安装后启动、托盘最小化、开机行为是否正常；签名与更新通道另行安排。
10. **托盘/唤醒/更新**：托盘菜单、关闭→托盘、`ee://` 唤醒协议是否符合预期；更新器目前是空配置，暂不验证。

---

## 9. Fork 到用户 GitHub（待办，需用户浏览器操作）

- 目标：把 `MrJack351/electron-desktop` fork 到用户账号 **Lbingyi** 名下，作为二次开发基底。
- **这一步我做不了**：fork 需要在浏览器里登录 GitHub 账号 Lbingyi 后点 Fork（或调 GitHub API 需账号 token），凭据步骤须用户本人操作。
- 用户操作路径（到时按实际页面走）：浏览器打开 https://github.com/MrJack351/electron-desktop → 右上角 Fork → 选 Owner `Lbingyi` → 创建。完成后把新仓库地址发我，我再克隆它作为后续开发的工作区。
- 注意：fork 前请先决定是否先向作者确认授权（方案第 9 节已有此项待办；仓库无 LICENSE 文件，package.json 仅声明 `Apache`），以及品牌名（第 6 节）——品牌名不影响先 fork，但会影响后续清理提交的内容。
