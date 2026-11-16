// 统一消息模型（Stage 1）：Telegram / TelegramK / WhatsApp 三个注入脚本
// 各自从页面 DOM 里读到的消息，先转成同一套内部结构，界面、翻译与 AI
// 只面对这个模型。
//
// 本文件是纯函数 + 一个内存 store，不碰 DOM、不依赖 Vue，因此能在 Node 里
// 直接单测（见 server/TEST-REPORT-STAGE1.md）。三个平台的 DOM 提取仍留在
// 各自的注入脚本里（electron/scripts/<平台>.js），那里按现有选择器读出
// 原始字段后调这里的 from* 映射函数；把 DOM 提取本身也搬进来是下一步，
// 需在 Windows 真机上逐条核对选择器是否还命中（见 STAGE1-SUMMARY.md）。
export const PLATFORMS = Object.freeze({
  Telegram: 'Telegram',
  TelegramK: 'TelegramK',
  WhatsApp: 'WhatsApp',
});

export const DIRECTIONS = Object.freeze(['in', 'out']);
export const STATUSES = Object.freeze(['pending', 'translated', 'failed']);

// 与服务器翻译接口同一上限：单条文本 5000 字符。
export const MAX_TEXT_LENGTH = 5000;
// 每个会话在内存里最多保留的消息条数，超了丢最旧的（聊天记录本身在各平台
// 网页里，本地 store 只是工作台的显示缓存）。
export const MAX_MESSAGES_PER_CARD = 500;

// FNV-1a 32 位哈希：给没有 id 的消息生成稳定 id（同一会话 + 同一时间戳 +
// 同一文本 => 同一 id，便于去重）。
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function cleanText(value) {
  if (typeof value !== 'string') {
    throw new Error('消息文本必须是字符串');
  }
  const text = value.trim();
  if (text.length === 0) {
    throw new Error('消息文本不能为空');
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`消息文本过长（上限 ${MAX_TEXT_LENGTH} 字符）`);
  }
  return text;
}

// 统一消息结构：
// {
//   id, cardId, platform, chatId, chatTitle, senderId, senderName,
//   direction: 'in' | 'out', text, translatedText, targetLang,
//   status: 'pending' | 'translated' | 'failed', failReason,
//   timestamp
// }
// raw 是注入脚本已从 DOM 提取出的原始字段（不是 DOM 节点）；
// context 是会话环境 { platform, cardId }。
export function normalizeMessage(raw, context) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('消息原始数据缺失');
  }
  if (!context || !Object.values(PLATFORMS).includes(context.platform)) {
    throw new Error(`未知平台：${context && context.platform}`);
  }
  if (typeof context.cardId !== 'string' || context.cardId.length === 0) {
    throw new Error('cardId 不能为空');
  }
  const text = cleanText(raw.text);
  const direction = raw.direction === undefined ? 'in' : raw.direction;
  if (!DIRECTIONS.includes(direction)) {
    throw new Error(`direction 只能是 in / out，收到：${direction}`);
  }
  const timestamp =
    Number.isFinite(Number(raw.timestamp)) && Number(raw.timestamp) > 0
      ? Number(raw.timestamp)
      : Date.now();
  const id =
    typeof raw.id === 'string' && raw.id.length > 0
      ? raw.id
      : `${context.platform}:${context.cardId}:${timestamp}:${fnv1a(text)}`;
  return {
    id,
    cardId: context.cardId,
    platform: context.platform,
    chatId: typeof raw.chatId === 'string' ? raw.chatId : '',
    chatTitle: typeof raw.chatTitle === 'string' ? raw.chatTitle : '',
    senderId: typeof raw.senderId === 'string' ? raw.senderId : '',
    senderName: typeof raw.senderName === 'string' ? raw.senderName : '',
    direction,
    text,
    translatedText: null,
    targetLang: null,
    status: 'pending',
    failReason: '',
    timestamp,
  };
}

// 翻译完成：返回一个新对象（不改原对象），status 变为 translated。
export function applyTranslation(message, translatedText, targetLang) {
  if (!message || typeof message !== 'object' || typeof message.id !== 'string') {
    throw new Error('applyTranslation 需要一条统一消息');
  }
  const translated = cleanText(translatedText);
  if (typeof targetLang !== 'string' || targetLang.length === 0) {
    throw new Error('targetLang 不能为空');
  }
  return { ...message, translatedText: translated, targetLang, status: 'translated' };
}

// 翻译失败：返回一个新对象，status 变为 failed，并记原因。
export function markFailed(message, reason) {
  if (!message || typeof message !== 'object' || typeof message.id !== 'string') {
    throw new Error('markFailed 需要一条统一消息');
  }
  return {
    ...message,
    status: 'failed',
    failReason: typeof reason === 'string' ? reason.slice(0, 200) : '翻译失败',
  };
}

// —— 三个平台的映射入口：入参是注入脚本从 DOM 提取出的原始字段 ——
// Telegram Web A（electron/scripts/Telegram.js）：
//   文本来自 div.text-content.clearfix.with-meta 的文本；
//   对方名字取当前选中会话的标题；方向按消息是否带 own 标记区分
//   （脚本内 processMessageList 扫描时已知）；chatId 取会话标题。
export function fromTelegramWebA(fields, cardId) {
  return normalizeMessage(fields, { platform: PLATFORMS.Telegram, cardId });
}

// Telegram Web K（electron/scripts/TelegramK.js）：与 Web A 同构，
// 只是 DOM 结构不同（消息区在 #column-center 内）；字段含义与上面一致。
export function fromTelegramWebK(fields, cardId) {
  return normalizeMessage(fields, { platform: PLATFORMS.TelegramK, cardId });
}

// WhatsApp Web（electron/scripts/WhatsApp.js）：
//   文本来自 span.selectable-text.copyable-text；
//   对方名字与会话标题取 #main 的头部；方向按消息行的 own 样式区分。
export function fromWhatsAppWeb(fields, cardId) {
  return normalizeMessage(fields, { platform: PLATFORMS.WhatsApp, cardId });
}

// 内存消息 store：按会话（cardId）分桶，去重、按时间排序、超量丢最旧。
// 只做工作台的显示缓存；聊天记录本身在各平台网页里，不在这里做持久化。
export class MessageStore {
  constructor(maxPerCard = MAX_MESSAGES_PER_CARD) {
    this.maxPerCard = maxPerCard;
    this.buckets = new Map();
  }

  add(message) {
    if (!message || typeof message.id !== 'string' || typeof message.cardId !== 'string') {
      throw new Error('MessageStore.add 需要一条带 id 与 cardId 的统一消息');
    }
    let bucket = this.buckets.get(message.cardId);
    if (!bucket) {
      bucket = [];
      this.buckets.set(message.cardId, bucket);
    }
    const index = bucket.findIndex((item) => item.id === message.id);
    if (index !== -1) {
      bucket[index] = message; // 同一 id 是同一条消息的更新（例如译文到了）
    } else {
      bucket.push(message);
    }
    bucket.sort((a, b) => a.timestamp - b.timestamp);
    while (bucket.length > this.maxPerCard) {
      bucket.shift();
    }
    return message;
  }

  get(cardId, id) {
    const bucket = this.buckets.get(cardId) || [];
    return bucket.find((item) => item.id === id) || null;
  }

  list(cardId) {
    return [...(this.buckets.get(cardId) || [])];
  }

  count(cardId) {
    return (this.buckets.get(cardId) || []).length;
  }

  clear(cardId) {
    if (cardId === undefined) {
      this.buckets.clear();
      return;
    }
    this.buckets.delete(cardId);
  }
}
