'use strict';
// 翻译 + 授权 + 更新分发，三块合一的零依赖本地服务。
// 只用 Node 内置模块（node:http / node:sqlite / node:crypto），无任何 npm 依赖。
// 启动：node index.js（默认监听 127.0.0.1:8000，见 server/README.md）。
//
// 与原版协议的偏差（已在 server/README.md 与提交信息里写明）：
//   原版 POST /api/authManage/clientAuth 返回 RSA 加密的 {timestamp, expiryDate}，
//   客户端用私钥解密。但客户端私钥已随公开仓库泄露并被删除，解密那条路已死，
//   且任何私钥都不应再进客户端。因此本服务器返回明文 JSON
//   {code: 200, authCode, expiryDate}。code: 200 是前端共享请求拦截器的硬性要求
//   （frontend/src/utils/request.js：code 不等于 200 即拒绝）。
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { LANGUAGES } = require('./lib/languages');
const keys = require('./lib/keys');
const db = require('./lib/db');
const { translateText } = require('./lib/translate');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8000);
const AUTH_EXPIRY_DAYS = Number(process.env.AUTH_EXPIRY_DAYS || 365);
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 客户端时间戳与服务器时间相差超过 5 分钟即拒绝
const MACHINE_CODE_RE = /^[0-9a-fA-F]{32,128}$/;
// 客户端用 machineIdSync({ original: true }) 取原始硬件码，Windows 上是带连字符的
// UUID（如 A1B2C3D4-E5F6-47AB-8C9D-0123456789AB），不是纯十六进制串。先去掉连字符和
// 花括号、统一小写再校验，入库也用归一化后的值，同一台机器重复登录才能对应上。
function normalizeMachineCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[{}-]/g, '').toLowerCase();
}

const UPDATE_PATH = path.join(__dirname, 'update.json');
let defaultVersion = '1.0.0';
try {
  defaultVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || '1.0.0';
} catch (err) {
  // 读不到根 package.json 时用 1.0.0 兜底
}

const { privateKey } = keys.ensureKeyPair();
db.getDb();

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function readUpdateFile() {
  try {
    const data = JSON.parse(fs.readFileSync(UPDATE_PATH, 'utf8'));
    return {
      version: typeof data.version === 'string' ? data.version : defaultVersion,
      notes: typeof data.notes === 'string' ? data.notes : '当前无更新',
      url: typeof data.url === 'string' ? data.url : '',
    };
  } catch (err) {
    return { version: defaultVersion, notes: '当前无更新', url: '' };
  }
}

async function handleClientAuth(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    return sendJson(res, 400, { code: 400, msg: err.message, message: err.message });
  }
  if (typeof body.jsonData !== 'string' || body.jsonData.length === 0) {
    return sendJson(res, 400, { code: 400, msg: '缺少 jsonData', message: '缺少 jsonData' });
  }
  let payload;
  try {
    const plain = keys.decryptWithPrivateKey(privateKey, body.jsonData);
    payload = JSON.parse(plain);
  } catch (err) {
    return sendJson(res, 401, { code: 401, msg: '解密失败', message: '解密失败' });
  }
  const machineCode = normalizeMachineCode(payload.machineCode);
  const timestamp = Number(payload.timestamp);
  if (!MACHINE_CODE_RE.test(machineCode)) {
    return sendJson(res, 403, { code: 403, msg: '机器码格式无效', message: '机器码格式无效' });
  }
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > TIMESTAMP_TOLERANCE_MS) {
    return sendJson(res, 401, { code: 401, msg: '时间戳过期', message: '时间戳过期' });
  }
  const authCode = crypto.randomBytes(24).toString('hex');
  const expiryDate = Date.now() + AUTH_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  db.issueAuthCode(machineCode, authCode, expiryDate);
  return sendJson(res, 200, { code: 200, authCode, expiryDate });
}

async function handleTranslate(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 1024 * 1024);
  } catch (err) {
    return sendJson(res, 400, { code: 400, msg: err.message, message: err.message });
  }
  const { fromLang, targetLang, text, authCode } = body;
  if (typeof text !== 'string' || text.trim() === '') {
    return sendJson(res, 400, { code: 400, msg: 'text 不能为空', message: 'text 不能为空' });
  }
  if (text.length > 5000) {
    return sendJson(res, 400, { code: 400, msg: 'text 过长（上限 5000 字符）', message: 'text 过长（上限 5000 字符）' });
  }
  if (typeof fromLang !== 'string' || typeof targetLang !== 'string') {
    return sendJson(res, 400, { code: 400, msg: 'fromLang / targetLang 缺失', message: 'fromLang / targetLang 缺失' });
  }
  if (!db.validateAuthCode(authCode)) {
    return sendJson(res, 401, { code: 401, msg: 'authCode 无效或已过期', message: 'authCode 无效或已过期' });
  }
  const apiBase = process.env.TRANSLATE_API_BASE;
  const apiKey = process.env.TRANSLATE_API_KEY;
  const model = process.env.TRANSLATE_MODEL;
  if (!apiBase || !apiKey || !model) {
    // 上游未配置：老实返回 503，绝不编造假翻译、绝不返回占位译文。
    return sendJson(res, 503, { code: 503, msg: '翻译上游未配置', message: '翻译上游未配置' });
  }
  try {
    const translated = await translateText({
      fromLang,
      targetLang,
      text,
      apiBase,
      apiKey,
      model,
      languages: LANGUAGES,
    });
    return sendJson(res, 200, { code: 200, data: translated });
  } catch (err) {
    return sendJson(res, 502, { code: 502, msg: '翻译上游调用失败', message: '翻译上游调用失败' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'GET' && pathname === '/api/languageList/languageList') {
    return sendJson(res, 200, { code: 200, data: LANGUAGES });
  }
  if (req.method === 'GET' && pathname === '/update/latest') {
    return sendJson(res, 200, readUpdateFile());
  }
  if (req.method === 'POST' && pathname === '/api/authManage/clientAuth') {
    return handleClientAuth(req, res).catch(() => {
      if (!res.writableEnded) {
        sendJson(res, 500, { code: 500, msg: '服务器内部错误', message: '服务器内部错误' });
      }
    });
  }
  if (req.method === 'POST' && pathname === '/api/translate') {
    return handleTranslate(req, res).catch(() => {
      if (!res.writableEnded) {
        sendJson(res, 500, { code: 500, msg: '服务器内部错误', message: '服务器内部错误' });
      }
    });
  }
  if (req.method === 'GET' && pathname === '/') {
    return sendJson(res, 200, {
      service: 'translation-server',
      paths: [
        'GET /api/languageList/languageList',
        'POST /api/translate',
        'POST /api/authManage/clientAuth',
        'GET /update/latest',
        'GET /health',
      ],
    });
  }
  return sendJson(res, 404, { code: 404, msg: '未找到该接口', message: '未找到该接口' });
});

server.listen(PORT, HOST, () => {
  console.log(`translation-server listening on http://${HOST}:${PORT}`);
  console.log(`public key fingerprint (SHA-256): ${keys.publicKeyFingerprint(keys.loadKeyPair().publicKey)}`);
});
