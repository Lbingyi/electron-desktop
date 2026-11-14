import JSEncrypt from 'jsencrypt'

// 注意：本文件曾经硬编码过 RSA 私钥（随公开仓库泄露），该私钥已作废并彻底删除，
// 不要再把任何私钥放进客户端代码。客户端只持有公钥，用于加密发往授权服务器的请求。
// 授权服务器的响应改为明文 JSON（原版 RSA 加密响应已废弃，见 server/README.md），
// 因此客户端不再需要解密能力，登录改为校验响应里的 authCode 与过期时间。

// 公钥：与 server/data/rsa-private.pem 配对的新密钥对（2026-11-14 生成，旧私钥已作废）。
// 指纹 SHA-256：0056109de0b4e97f2a0196b9a0d298ef325864c293692be7af3b445b2eee1675。服务器换密钥对时必须同步更新此处。
const publicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuJsEAiDI6hFUpdwGASC1G5su4wbMeCGKIX5i6WvTSTnev+aWOZsSPlkiwKWr/YAUpTwlcARty7qgdKjRBVdL3y1xRYOJlFviagE6e9EoiJEb+XZrVFCmTKb/OXWkvzOJezLsUik9nGEn+bsWw+Xux4n/KgZgFPxkOM1XhU1sWjRDm55fEHx/y+0HIg8FlWqT1unv9QrZMuxa0wv9I8PESR1dQj5WOVKegzlXN3lTkDgcwsfkzPHIS8QDNH75ukKj3pm4wcDvKbRlEsWeIfQNH1tm4UsEI30kFLzFhZ6w7VSB2IA0QPZkZ4zxVNhsTnIvesWdLGUc6cZVkXEFbGeYJwIDAQAB'

// 加密（只加密，不解密——解密能力已从客户端彻底移除）
export function encrypt(txt) {
    const encryptor = new JSEncrypt()
    encryptor.setPublicKey(publicKey) // 设置公钥
    return encryptor.encrypt(txt) // 对需要加密的数据进行加密
}
