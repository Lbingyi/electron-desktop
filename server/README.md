# 本地后端：翻译 + 授权 + 更新分发

三块合一的 Node 服务，**零依赖**，只用 Node 内置模块（`node:http`、`node:sqlite`、`node:crypto`），不用装任何 npm 包，不用 Spring Boot。代码在 `server/` 里，入口 `index.js`。

## 它提供什么

| 接口 | 说明 |
| --- | --- |
| `GET /api/languageList/languageList` | 语言列表，返回 `{code: 200, data: [{code, displayName}, ...]}`（共 44 种语言，形状以注入脚本实际渲染的为准，必含 zh 与 en） |
| `POST /api/translate` | 翻译。入参 `{fromLang, targetLang, text, authCode}`，成功返回 `{code: 200, data: 译文}` |
| `POST /api/authManage/clientAuth` | 授权。客户端发 RSA 加密的 `{machineCode, authCode: '', timestamp}`，成功返回明文 `{code: 200, authCode, expiryDate}`（expiryDate 为毫秒时间戳） |
| `GET /update/latest` | 更新 feed，读 `server/update.json`，返回 `{version, notes, url}` |
| `GET /health` | 健康检查，返回 `{ok: true}` |

## 与原版协议的偏差（重要）

原版 `POST /api/authManage/clientAuth` 返回的是 **RSA 加密的 `{timestamp, expiryDate}`**，客户端用私钥解密。但客户端那个私钥已经随公开仓库泄露、并在阶段 0 被从客户端彻底删除——解密那条路已死，且任何私钥都不应再进客户端。

所以本服务器改成返回**明文 JSON `{code: 200, authCode, expiryDate}`**。登录页已按新协议接通：收到响应后校验 `authCode` 存在、且 `expiryDate` 未过期，再经 `controller.login.saveAuthCode` 存进主进程（`app.authCode`，翻译请求会带上它），然后跳首页。`code: 200` 必须保留——前端共享请求拦截器（`frontend/src/utils/request.js`）规定 `code` 不等于 200 即拒绝。

RSA 加密只保留在**请求方向**：登录页仍用新公钥加密发出的 `{machineCode, authCode: '', timestamp}`。服务器用新私钥解密，校验机器码格式（十六进制串）与时间戳新鲜度（与服务器时间相差超过 5 分钟即拒绝）。

## 密钥与数据存在哪

- 私钥：`server/data/rsa-private.pem` —— 服务器首次启动时自动生成（RSA 2048），0600 权限，**已进 `.gitignore`，绝不进 git，绝不发给任何人**。旧私钥已作废，不要再用。
- 公钥：`server/data/rsa-public.pem`，以及已同步写进客户端 `frontend/src/utils/rsaEncrypt.js` 的同一副公钥。
- 公钥指纹（SHA-256）：`0056109de0b4e97f2a0196b9a0d298ef325864c293692be7af3b445b2eee1675`。换密钥对时必须同步更新客户端公钥，否则登录的加密请求解不开。
- 授权库：`server/data/auth.db`（node:sqlite），一张表 `auth_codes`，一台机器码对应一个授权码，重复登录会覆盖旧码（旧码随即失效）。有效期默认 365 天，可用环境变量 `AUTH_EXPIRY_DAYS` 改。
- 删 `server/data/` 即等于重置：下次启动会生成全新密钥对（客户端公钥也要同步重换），已发授权码全部失效。不要在有用户在用的时候删。

## 在 Windows 上跑起来（exact 步骤）

前提：已装 Node.js 24（必须用 24：后端用了 `node:sqlite`，Node 20 没有这个模块，起不来）。全程在 PowerShell 或 cmd 里操作。

```powershell
cd <仓库目录>\server
npm start
```

看到 `translation-server listening on http://127.0.0.1:8000` 即启动成功。服务一直跑着才能登录和翻译；关掉窗口即停。想让它开机自启，用 Windows 任务计划程序建一个开机任务执行 `node <仓库目录>\server\index.js`（不在本文范围）。

### 翻译上游配置（必须设，否则翻译返回 503）

翻译引擎走 OpenAI 兼容上游，三个环境变量缺一不可。PowerShell 里这样设（设完再 `npm start`，同一窗口内有效）：

```powershell
$env:TRANSLATE_API_BASE="https://api.ant-ling.com/v1"
$env:TRANSLATE_API_KEY="你的上游 API Key"
$env:TRANSLATE_MODEL="Ling-3.2-flash"
npm start
```

cmd 里对应写法：`set TRANSLATE_API_BASE=https://api.ant-ling.com/v1`，以此类推。

**指到自己的 Magpie 网关**：Magpie 网关就是 OpenAI 兼容接口，照这个格式填——

```powershell
$env:TRANSLATE_API_BASE="http://你的Magpie服务器地址:3425/v1"
$env:TRANSLATE_API_KEY="你的 Magpie 网关 key（不是 InferX 的 key，也不是打开 Magpie 网页的那个 key）"
$env:TRANSLATE_MODEL="inferx/deepseek-v4.1-flash-1017-basic"
```

其中 `TRANSLATE_MODEL` 必须写成 Magpie 里能路由到的模型名（格式一般是 `<供应商>/<模型名>`）。Key 只放在你自己电脑的环境变量里，**绝不写进任何文件、绝不提交到仓库**。

没有配上游时，`POST /api/translate` 会老实返回 503 `{"code": 503, "msg": "翻译上游未配置"}`，绝不编造假翻译、绝不返回占位译文。语言列表和授权登录不受上游影响，照常可用。

### 端口 8000 被占了怎么办

1. 换端口启动：`$env:PORT="8001"` 再 `npm start`（或 `set PORT=8001`）。
2. 客户端也要改两个地方，改完重新构建前端再启动客户端：
   - `electron/utils/request.js` 里的 `baseURL: 'http://localhost:8000'` 改成新端口；
   - `frontend/.env.development` 里的 `VITE_BASE_API` 改成 `http://localhost:8000/api` 对应的新端口（例如 `http://localhost:8001/api`）。
   - 改完在仓库根目录执行 `npm run build-frontend`，再启动客户端。
3. 打包后的正式版用的是 `frontend/.env.production` 里的 `https://www.test.com/api`（占位地址）。要发布时把该地址改成线上服务器地址再打包；**不要在仓库里把测试地址改成别的临时地址**。

### 客户端连这台服务器

开发调试时直接在仓库根目录跑客户端（它读 `frontend/.env.development`，即 `http://localhost:8000/api`），先启动本服务器，再启动客户端：

```powershell
cd <仓库目录>
npm run dev
```

## 登录测试步骤

1. 先启动本服务器（上一步），确认 `http://127.0.0.1:8000/health` 在浏览器里打开返回 `{"ok":true}`。
2. 启动客户端（`npm run dev`），登录页应显示本机机器码。
3. 点“登录”。成功时提示“登录成功”并跳到首页，窗口标题会变成“授权有效期:XXXX-XX-XX”。
4. 失败时看提示区分原因：
   - “授权服务不可达”——服务器没起来或端口不对；
   - “机器码格式无效”/“时间戳过期”——服务器拒绝了请求（机器时间差超过 5 分钟时先对时）；
   - “授权无效或已过期”——服务器返回的授权码为空或已过期。
5. 翻译测试：新建 WhatsApp 或 Telegram 会话、扫码登录后，收一条外语消息应自动出译文；点语言选择器切换目标语言，确认译文跟着变。翻译请求会带登录时拿到的 `authCode`，未登录或过期时翻译返回空（属预期行为）。

## 更新分发怎么用

`GET /update/latest` 直接读 `server/update.json`，发版时自己改这个文件：

```json
{"version": "1.0.1", "notes": "本次更新说明", "url": "https://你的下载地址/安装包.exe"}
```

当前文件写的是 `{"version": "1.0.0", "notes": "当前无更新", "url": ""}`，与根 `package.json` 的版本一致，`url` 为空表示无更新——**不要编造下载地址**。

客户端的两套更新器目前保持禁用（阶段 0 的状态），不要直接改 `electron/config/builder.json` 里的 publish 或 `config.default.js` 里的 feed 地址。以后接线时：先把安装包放到可下载的地址并填好 `update.json`，再按 electron-updater 的规范配 `builder.json` 的 `publish` 和 `config.default.js` 的 `autoUpdater`，然后在 Windows 上实测一次完整更新流程。

## 常见问题

- `EADDRINUSE`：8000 端口已被别的程序占用，按上文“端口 8000 被占了怎么办”换端口。
- 翻译返回 401：`authCode` 无效或已过期，重新登录拿一个新码；同一台机器重复登录会覆盖旧码，旧码立即失效。
- 翻译返回 503：上游三个环境变量没配全，检查同一窗口内是否已设好再启动。
- 翻译返回 502：上游调用失败（Key 错、上游挂了、模型名不对），检查上游配置，服务器日志不记 Key，只能自己核对。
- 日志里绝不会出现 Key、私钥或授权码——如果哪次输出里出现了，立即停下并报告。
