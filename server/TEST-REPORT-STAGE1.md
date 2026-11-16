# Stage 1 后端验证报告（server/ + 主进程接线）

- 验证日期：2026-11-16
- 环境：沙箱 Linux，Node v24.22.1；服务器 `node index.js`（零依赖，只用 Node 内置模块）
- 测试脚本：`/tmp/test-stage1.js`（未进仓库）与 `/tmp/test-message-model.js`（未进仓库）——翻译上游用真实 Ling-3.2-flash（Key 只以环境变量传入测试进程，未写入任何文件）；测试数据用 `SERVER_DATA_DIR` 指向 `/tmp/stage1-test-data`，不碰真实 `server/data/`

## 结果总览

| # | 检查项 | 结果 |
|---|---|---|
| 1 | `node --check`（server 全部 7 个 JS 文件 + `electron/service/workspace.js`、`electron/controller/workspace.js`、`electron/api/index.js`、`electron/index.js`、`electron/preload/bridge.js`、前端 `messageModel.js` 与 `api/workspace.js`，共 15 个文件） | ✅ 通过 15，失败 0 |
| 2 | 后端 49 项接口测试（`/tmp/test-stage1.js`） | ✅ **49/49 通过** |
| 3 | 统一消息模型 21 项单测（`/tmp/test-message-model.js`，esbuild 打包后在 Node 里跑） | ✅ **21/21 通过** |
| 4 | 前端 `vite build`（`npm run build`，60 秒）与 `npm run build-frontend`（`public/dist` 同步） | ✅ 通过；新 bundle 含 `controller.workspace.*` 与「团队与用量」，旧假图表数据 `[120,132,…]` 在 dist 内 0 命中 |
| 5 | `GET /health` | ✅ `{"ok":true}` |
| 6 | 工作区创建 / 列出（机器隔离：机器 2 看不到机器 1 的工作区） | ✅ 通过 |
| 7 | 员工创建（重复用户名 → 409；建 owner 角色 → 400；密码 < 6 位 → 400；非老板在别人工作区建员工 → 403） | ✅ 通过 |
| 8 | 员工登录（主管 / 客服；密码错误 → 401；token 48 字符，24h 有效期） | ✅ 通过 |
| 9 | 员工列表隔离（主管看 2 人；客服只看到自己，1 人；别的机器 → 403） | ✅ 通过 |
| 10 | 账号分配（主管分配成功；客服尝试分配 → 403；分配给不存在的员工 → 400；收回后客服只剩 1 个账号） | ✅ 通过 |
| 11 | 可见账号（客服 scope=assigned，2 个；主管 scope=all） | ✅ 通过 |
| 12 | 手动记账（AI 点数 50；非法 kind → 400；负数 → 400；坏 authCode → 401） | ✅ 通过 |
| 13 | 翻译自动记账（真实上游，见下） | ✅ 通过 |
| 14 | 端口心跳（3 端口在线，quota 3，不过载；4 端口在线，`overQuota: true`，如实返回不拦截） | ✅ 通过 |
| 15 | 用量汇总隔离（见下） | ✅ 通过 |
| 16 | 按日汇总（7 天，今天翻译 2 次 / 37 字符，其余 6 天为 0） | ✅ 通过 |
| 17 | 旧协议未动（语言列表仍 44 种；`clientAuth` 仍返回明文 `{code:200, authCode, expiryDate}`） | ✅ 通过 |
| 18 | 真实 `server/data/` 公钥指纹未变（`0056109d…` 全值见下） | ✅ 通过 |

## 用量汇总实测值（隔离生效的证据）

- 老板看汇总：`{"translateChars":37,"translateCount":2,"portPeak":4,"portSamples":2,"aiPoints":50}`
- 客服看汇总：`{"translateChars":12,"translateCount":1,"portPeak":0,"portSamples":0,"aiPoints":0}`——只看到自己被归属的 12 字符 / 1 次；机器级事件与端口峰值不可见
- 主管看汇总：与老板一致（37 字符）
- 别的机器看汇总 → 403
- 按日：`{"date":"11-16","translateCount":2,"chars":37}`

## 真实上游翻译（实测）

- 上游：`TRANSLATE_API_BASE=https://api.ant-ling.com/v1`，`TRANSLATE_MODEL=Ling-3.2-flash`（Key 只以环境变量传入测试进程，未写入任何文件）
- 机器级翻译：`Hello, how are you today?`（25 字符）→ `你好，你今天怎么样？`
- 员工级翻译（带员工 token，归属客服）：`Good morning`（12 字符）→ `早上好`
- 坏 `authCode` 翻译 → 401，且不记账

## 统一消息模型单测（21 项）

- 归一化基本字段、稳定 id（同一文本 + 时间戳生成同一 id，去重依据）、方向默认值、显式 id 保留
- 空文本 / 超长文本（>5000 字符）/ 未知平台 / 空 cardId / 非法 direction 均抛错
- `applyTranslation` 返回新对象、原对象不动；空译文抛错；`markFailed` 记原因
- 三平台映射：`fromTelegramWebA` / `fromTelegramWebK` / `fromWhatsAppWeb` 平台与方向正确
- `MessageStore`：计数与按时间排序、超量丢最旧、同一 id 更新不重复、按会话隔离、按会话清空

## 一个如实记录的插曲

不带 `TRANSLATE_API_KEY` 跑测试时，翻译实测被跳过，汇总 4 项（老板 / 客服 / 主管 / 按日）失败——失败原因是**没有翻译发生、账本里确实没有翻译字符**，不是服务端 bug。脚本里这 4 项断言在无上游 Key 时本应跳过却按失败计；带上 Key（`TRANSLATE_API_KEY` / `TRANSLATE_API_BASE` / `TRANSLATE_MODEL`，Key 从 `~/.bashrc` 的 `$LING_API_KEY` 取）重跑后 **49/49 通过**。以后跑这套测试必须先确认这三个环境变量已传进测试进程。

## 沙箱里验不了的（待 Windows 真机验证）

- Electron 真实启动、主窗口加载、团队页实际操作（创建工作区、员工登录、分配账号）
- 3 个 Telegram 账号同时在线收发与翻译（沙箱里 Telegram Web 登录做不了）
- 注入脚本的 DOM 提取选择器在当前 Telegram Web 上是否还命中（模型层已单测，提取层仍在注入脚本里，未搬进模型）
- 端口心跳的 10 秒防抖在真实多会话下的表现
- 打包（NSIS）与更新器的实际接线（Stage 1 不含打包）

以上均未谎称已验证；登录、权限隔离与用量账本只在协议层（HTTP + IPC 白名单）与代码/构建层验证通过，界面与真机行为以 Windows 验证为准。Windows 验证清单见仓库根目录 `STAGE1-SUMMARY.md`。

## 密钥与隐私核对

- 公钥指纹（SHA-256）：`0056109de0b4e97f2a0196b9a0d298ef325864c293692be7af3b445b2eee1675`（服务器启动日志与客户端文件核对一致，测试前后未变）。
- 私钥只存在于 `server/data/rsa-private.pem`（0600），`git check-ignore` 已核实三者均被 `.gitignore` 的 `server/data/` 忽略：私钥、公钥、授权库（`auth.db`）。
- 本报告与任何提交、日志里均无 API Key、私钥、`authCode` 完整值（测试脚本只打印 `authCode` 前 8 字符）。
- 一次性测试授权码是随机生成的测试值，不与任何真实用户机器绑定；测试数据只在 `/tmp/stage1-test-data`，真实 `server/data/auth.db` 未被测试触碰。
