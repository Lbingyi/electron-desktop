# Stage 1 总结（Telegram 骨架）

- 分支：`stage1-telegram`（基点 main `9059ed91`，未动 main，未强推）
- 日期：2026-11-16
- 范围依据：`~/workspace/your_files/multi-chat-translation-plan/multi-chat-translation-plan.pdf` 第 7 节

## 提交（5 个，按时间顺序）

| SHA | 内容 |
|---|---|
| `04584ea` | Stage 1 服务端：工作区 / 员工 / 用量账本骨架（零依赖） |
| `6d4e7dd` | Stage 1 主进程：工作区控制器/服务、翻译记账钩子、端口心跳 |
| `aa45a75` | Stage 1 渲染进程：统一消息模型（Telegram/TelegramK/WhatsApp） |
| `0790031` | Stage 1 渲染进程：团队视图、工作台真实数据 |
| `67bf8ea` | Stage 1：测试报告与总结（本文件 + `server/TEST-REPORT-STAGE1.md`） |

## 做了什么

- **服务端（`server/lib/workspace.js` + `server/lib/workspaceRoutes.js`）**：6 张表（工作区、员工、员工 token、账号分配、用量事件、审计日志），12 个接口（`/api/workspace/*` 与 `/api/usage/*`）。角色三档：老板（机器 authCode）/ 主管 / 客服（员工登录，scrypt 存密码哈希，token 24h 有效）。配额是骨架默认值（端口 3、每月翻译字符 300000、AI 点数 1000），**Stage 1 只记录、不强制执行**。翻译成功自动记账（字符数按 JS 字符串长度；机器级记到机器的工作区，员工级记到员工名下）。`SERVER_DATA_DIR` 环境变量可隔离测试数据。
- **主进程（`electron/service/workspace.js` + `electron/controller/workspace.js`）**：authCode 与员工 token 只留在主进程内存里，渲染进程只能拿到员工资料；13 个 `controller.workspace.*` 通道已进 preload 白名单；`electron/api/index.js` 的 `translateText` 透传 staffToken/workspaceId；`electron/index.js` 在会话上线后排一个 10 秒防抖的端口心跳。
- **渲染进程**：统一消息模型（`frontend/src/utils/messageModel.js`，纯函数 + 内存 store，21 项单测全过）；团队视图（`frontend/src/views/platform/Team.vue`：工作区创建/切换、员工登录、员工列表与新建、账号分配与收回、我的可见账号、本月用量；左导航新增团队入口）；工作台首页改成真实数据（工作区名、本月翻译字符、端口峰值/配额、员工数，按日用量折线图）；折线图删掉原来写死的演示数字，无数据时显示 0。
- **未动的**：授权协议（登录仍返回明文 JSON `{code:200, authCode, expiryDate}`，RSA 只在请求方向）；`server/data/` 的密钥对（指纹未变）；品牌名、图标、定价（均未定）；许可证问题（等作者回复，未碰）。

## 验收标准达成情况

| 验收标准 | 达成情况 |
|---|---|
| 同一工作区下 2 名员工可登录，权限隔离生效（老板/主管/客服三档，至少老板与客服的隔离要可验证） | ✅ **达成（协议层实测）**：49 项后端测试全过。老板汇总 37 字符/2 次/端口峰值 4/AI 点数 50；客服只看到自己的 12 字符/1 次，端口峰值与 AI 点数不可见；主管与老板一致；别的机器看员工列表/汇总 → 403；客服尝试分配账号 → 403 |
| 3 个 Telegram 账号同时在线收发与翻译正常 | ⚠️ **代码与构建层面已验证，真机未验证**：多账号分区（`persist:<cardId>`）、注入脚本、翻译缓存等基底能力沿用；心跳接口在协议层测过（3 端口在线不过载、4 端口超配额如实返回 `overQuota` 不拦截）；但沙箱里 Telegram Web 登录做不了，3 账号同时在线收发与翻译必须等 Windows 真机验证（清单见下） |
| 用量被正确记录（翻译字符、端口在线数进账本） | ✅ **达成（协议层实测）**：真实上游翻译 2 次（25 + 12 = 37 字符）全部进账；端口心跳 2 次采样，峰值 4；AI 点数手动记账 50；按日汇总今天 2 次/37 字符，其余 6 天为 0 |

## 验证结果

- 后端 49 项测试：**49/49 通过**（真实 Ling-3.2-flash 上游；详见 `server/TEST-REPORT-STAGE1.md`）
- 统一消息模型单测：**21/21 通过**
- `node --check`：15 个 JS 文件，0 失败
- 前端 `vite build`（60 秒）与 `npm run build-frontend` 通过，`public/dist` 已同步
- 一个如实记录的插曲：不带 `TRANSLATE_API_KEY` 跑测试时翻译被跳过、汇总 4 项失败——是测试环境变量缺失，不是服务端 bug；带上 Key 重跑后 49/49（详见测试报告）

## 已知局限（Stage 1 骨架，不算 bug）

- 配额只记录、不强制：超配额只返回 `overQuota: true`，不拦截翻译与上线
- DOM 提取仍在各平台注入脚本里（`Telegram.js` / `TelegramK.js` / `WhatsApp.js`），未搬进统一消息模型；选择器是否还命中当前 Telegram Web，需真机核对
- 翻译失败不记账；记账失败绝不影响翻译返回
- 员工登录有效期 24 小时，无刷新机制；退出员工登录不影响机器授权
- 团队页的「我的可见账号」只显示 cardId 对应的会话名，需会话已在本地创建过

## Windows 真机验证清单（未验证，需用户在 Windows 上做）

1. 拉分支并启动后端：`git fetch origin stage1-telegram` 后切到 `stage1-telegram`，`cd server && node index.js`（Node 24；**不要**在 Windows 上起新 server——密钥对与 exe 里的公钥绑定，仍用沙箱 `server/data/` 的 `rsa-private.pem` + `rsa-public.pem`，不要拷 `auth.db`）
2. 启动应用（exe 不用重打；或 `npm run start` 跑源码版），确认主窗口与左导航「团队」入口出现
3. 团队页：创建工作区 → 新建主管与客服员工 → 员工登录（各 1 个）→ 主管给客服分配 1 个 Telegram 账号 → 客服登录后只能看到被分配的账号
4. 3 个 Telegram 账号扫码登录并同时在线：各发一条消息，确认自动翻译与用量字符数在团队页增长；端口峰值显示 3
5. 首页：工作区名、本月翻译字符、端口峰值/配额、员工数、按日折线图与团队页一致
6. 超配额：第 4 个账号上线时团队页/首页如实显示超配额（Stage 1 不拦截，只显示）
7. 退出员工登录后，机器授权不受影响（仍能进团队页看工作区）

## 下一步建议

- 等 Windows 验证结果：报什么修什么，别先推 Stage 2
- Stage 2（按计划第 7 节）：订阅/付费墙、配额强制执行、AI 草稿、交接流程——需先定价（目前未定），定价未定前不要动手
- 如 Windows 验证发现注入脚本选择器失效：把 DOM 提取逐条搬进统一消息模型时，以真机 Network/DOM 为准逐条核对
