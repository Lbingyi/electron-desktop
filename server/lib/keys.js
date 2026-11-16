'use strict';
// RSA 密钥对管理。
// 原仓库硬编码在客户端的私钥已泄露并作废。本服务器首次启动时自动生成一副新密钥对：
//   私钥  server/data/rsa-private.pem（0600 权限，绝不进 git，绝不发给任何人）
//   公钥  server/data/rsa-public.pem（0600 权限，公开的那一半，须同步写进客户端
//         frontend/src/utils/rsaEncrypt.js——客户端只持有公钥，用于加密发往这里的请求）
// 已有密钥对时直接加载，不再重新生成（否则已发放的授权流程会断）。
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// 数据目录：默认 server/data/；测试时可用 SERVER_DATA_DIR 环境变量指向临时目录
// （与 server/lib/db.js 一致，默认行为不变）。
const DATA_DIR = process.env.SERVER_DATA_DIR || path.join(__dirname, '..', 'data');
const PRIVATE_KEY_PATH = path.join(DATA_DIR, 'rsa-private.pem');
const PUBLIC_KEY_PATH = path.join(DATA_DIR, 'rsa-public.pem');

function loadKeyPair() {
  return {
    privateKey: fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'),
    publicKey: fs.readFileSync(PUBLIC_KEY_PATH, 'utf8'),
  };
}

function ensureKeyPair() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    return loadKeyPair();
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o600 });
  return { privateKey, publicKey };
}

// 客户端 JSEncrypt 公钥的格式：去掉 PEM 头尾与换行的裸 base64 DER（与仓库原文件格式一致）。
function publicKeyBareBase64(publicKeyPem) {
  return publicKeyPem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
}

// 公钥指纹：SHA-256（DER 编码），用于核对客户端公钥与服务器密钥对是否同一副。
function publicKeyFingerprint(publicKeyPem) {
  const der = Buffer.from(publicKeyBareBase64(publicKeyPem), 'base64');
  return crypto.createHash('sha256').update(der).digest('hex');
}

// 解密客户端 JSEncrypt 发来的密文：JSEncrypt 用 RSA PKCS#1 v1.5 填充 + base64 编码。
function decryptWithPrivateKey(privateKeyPem, base64Ciphertext) {
  const buffer = Buffer.from(base64Ciphertext, 'base64');
  const plain = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
    buffer,
  );
  return plain.toString('utf8');
}

module.exports = {
  ensureKeyPair,
  loadKeyPair,
  publicKeyBareBase64,
  publicKeyFingerprint,
  decryptWithPrivateKey,
  DATA_DIR,
  PRIVATE_KEY_PATH,
  PUBLIC_KEY_PATH,
};
