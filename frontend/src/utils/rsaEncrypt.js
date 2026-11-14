import JSEncrypt from 'jsencrypt'

// 注意：本文件曾经硬编码过 RSA 私钥（随公开仓库泄露），该私钥已作废并彻底删除，
// 不要再把任何私钥放进客户端代码。客户端只持有公钥，用于加密发往授权服务器的请求。
// 授权服务器的响应验证（验签）在授权服务器建成后实现，在此之前登录一律失败即拒绝。

// 公钥：与已作废的私钥配对。授权服务器重建时须生成新密钥对，并同步更新此处公钥。
const publicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAg1Pkgn2IXGnOs6XTms2ww3nQQ7cyxPLwwWDv1lEApo6QcrIP3QniFE6oVI0KSv1qClbyNxpNJsCP+KurI9A3G3hycKl/+KrCYXm7sf9hXX4iBxbh1GabIvhhH0eC6yvzWM5xxYRuo/eHFajvnXfl422TlbwCEa82uXhBXguf0k4UDAhM0L3zJYf0jEUReNJyHeD2g27EQG6DrcrM14Miu7wAbbd5FINDrdu349QbphHSSfK6ok7SH2EL7XdhbwvfitzJ+4g738FxAKfv5Tb36v6w0YHvoyxyMcJ729nH5jooxnK+1h2Nugopjr69JGaWz2P+9z6aWxbW2maDlmfBbQIDAQAB'

// 加密（只加密，不解密——解密能力已从客户端彻底移除）
export function encrypt(txt) {
    const encryptor = new JSEncrypt()
    encryptor.setPublicKey(publicKey) // 设置公钥
    return encryptor.encrypt(txt) // 对需要加密的数据进行加密
}
