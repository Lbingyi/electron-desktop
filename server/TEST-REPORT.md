# 后端验证报告（server/）

- 验证日期：2026-11-14
- 环境：沙箱 Linux，Node v24.22.1；服务器 `node index.js`（零依赖，只用 Node 内置模块）
- 测试脚本：`/tmp/test-server.js`（未进仓库）——授权请求用客户端真正的 `jsencrypt` 库 + 客户端文件里的公钥加密，与登录页行为一致

## 结果总览

| # | 检查项 | 结果 |
|---|---|---|
| 1 | `node --check`（server 全部 5 个 JS 文件 + `electron/preload/bridge.js`） | ✅ 通过 |
| 2 | `GET /health` | ✅ `{"ok":true}` |
| 3 | `GET /api/languageList/languageList` | ✅ 44 种语言，`code: 200`，含 `zh=中文`、`en=英语`，每项有 `code` 与 `displayName` |
| 4 | `POST /api/authManage/clientAuth`（jsencrypt 加密往返） | ✅ 200，返回 48 字符十六进制 `authCode` 与一年后到期的 `expiryDate` |
| 5 | 过期时间戳（10 分钟前） | ✅ 401 `时间戳过期` |
| 6 | 无效机器码格式 | ✅ 403 `机器码格式无效` |
| 7 | `POST /api/translate` 英→中（真实上游） | ✅ 200，译文见下 |
| 8 | `POST /api/translate` 中→英（真实上游） | ✅ 200，译文见下 |
| 9 | 坏 `authCode` 翻译 | ✅ 401 `authCode 无效或已过期` |
| 10 | `GET /update/latest` | ✅ `{version: "1.0.0", notes: "当前无更新", url: ""}` |
| 11 | 无上游时翻译（有效 `authCode`） | ✅ 503 `翻译上游未配置`，语言列表与授权仍正常 |
| 12 | 前端重构建 + `public/dist` 同步 | ✅ `npm run build`（44 秒）与 `npm run build-frontend` 通过；新公钥与 `saveAuthCode` 在新 bundle 内，旧公钥与 `privateKey` 字样在 dist 内 0 命中 |

## 真实上游翻译（实测）

- 上游：`TRANSLATE_API_BASE=https://api.ant-ling.com/v1`，`TRANSLATE_MODEL=Ling-3.2-flash`（Key 只以环境变量传入测试进程，未写入任何文件）
- 英→中：`Hello, how are you today?` → `你好，你今天怎么样？`
- 中→英：`你好，很高兴认识你。` → `Hello, nice to meet you.`

## 授权实测细节

- 模型加载与显存无关；授权往返全程用客户端真正的 jsencrypt 加密：客户端文件里的新公钥加密 → 服务器新私钥解密成功，往返成立。
- 公钥指纹（SHA-256）：`0056109de0b4e97f2a0196b9a0d298ef325864c293692be7af3b445b2eee1675`（服务器启动日志与客户端文件核对一致）。
- 服务器首次启动耗时：`authCode` 往返与翻译均在 2 秒内完成（不含上游模型推理时间）。

## 一个如实记录的插曲

无上游 503 的第一次验证用了假 `authCode`，服务器先返回 401 而不是 503——这是**正确的顺序**：服务器先校验 `authCode`、再检查上游配置。用有效 `authCode` 重测后，503 正确返回（上表第 11 项）。

## 沙箱里验不了的（待用户 Windows 真机验证）

- Electron 真实启动、主窗口加载、登录页机器码获取
- 扫码登录 WhatsApp / Telegram / TelegramK 会话
- 应用内翻译端到端：收消息自动翻译、发消息先翻译再发送、语言切换
- 打包（NSIS）与更新器的实际接线（目前更新器保持禁用，`update.json` 只提供 feed，见 server/README.md）

以上均未谎称已验证；登录与翻译的接线只在协议层（HTTP + jsencrypt + IPC 白名单）验证通过，界面层面的真实走通以真机为准。

## 密钥与隐私核对

- 私钥只存在于 `server/data/rsa-private.pem`（0600），`git check-ignore` 已核实三者均被 `.gitignore` 的 `server/data/` 忽略：私钥、公钥、授权库（`auth.db`）。
- 本报告与任何提交、日志里均无 API Key、私钥、`authCode` 完整值（测试脚本只打印 `authCode` 前 8 字符）。
- 一次性测试授权码是随机生成的测试值，不与任何真实用户机器绑定。
