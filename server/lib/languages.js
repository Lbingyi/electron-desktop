'use strict';
// 语言列表：形状以注入脚本实际渲染的为准。
// 三个脚本（WhatsApp.js / Telegram.js / TelegramK.js）都做：
//   languages = response.data;
//   渲染时读 language.code 与 language.displayName；
//   默认本机语言 'zh'、目标语言 'en'（localStorage 无保存值时）。
// 因此每一项必须有 code 与 displayName，且列表必须包含 zh 与 en。
// name 字段是英文名，供翻译提示词使用，客户端不依赖它。
const LANGUAGES = [
  { code: 'zh', displayName: '中文', name: 'Chinese' },
  { code: 'en', displayName: '英语', name: 'English' },
  { code: 'ja', displayName: '日语', name: 'Japanese' },
  { code: 'ko', displayName: '韩语', name: 'Korean' },
  { code: 'fr', displayName: '法语', name: 'French' },
  { code: 'de', displayName: '德语', name: 'German' },
  { code: 'es', displayName: '西班牙语', name: 'Spanish' },
  { code: 'pt', displayName: '葡萄牙语', name: 'Portuguese' },
  { code: 'it', displayName: '意大利语', name: 'Italian' },
  { code: 'ru', displayName: '俄语', name: 'Russian' },
  { code: 'ar', displayName: '阿拉伯语', name: 'Arabic' },
  { code: 'hi', displayName: '印地语', name: 'Hindi' },
  { code: 'th', displayName: '泰语', name: 'Thai' },
  { code: 'vi', displayName: '越南语', name: 'Vietnamese' },
  { code: 'id', displayName: '印度尼西亚语', name: 'Indonesian' },
  { code: 'ms', displayName: '马来语', name: 'Malay' },
  { code: 'tr', displayName: '土耳其语', name: 'Turkish' },
  { code: 'nl', displayName: '荷兰语', name: 'Dutch' },
  { code: 'sv', displayName: '瑞典语', name: 'Swedish' },
  { code: 'da', displayName: '丹麦语', name: 'Danish' },
  { code: 'fi', displayName: '芬兰语', name: 'Finnish' },
  { code: 'nb', displayName: '挪威语', name: 'Norwegian' },
  { code: 'pl', displayName: '波兰语', name: 'Polish' },
  { code: 'uk', displayName: '乌克兰语', name: 'Ukrainian' },
  { code: 'cs', displayName: '捷克语', name: 'Czech' },
  { code: 'el', displayName: '希腊语', name: 'Greek' },
  { code: 'he', displayName: '希伯来语', name: 'Hebrew' },
  { code: 'fa', displayName: '波斯语', name: 'Persian' },
  { code: 'ur', displayName: '乌尔都语', name: 'Urdu' },
  { code: 'bn', displayName: '孟加拉语', name: 'Bengali' },
  { code: 'ta', displayName: '泰米尔语', name: 'Tamil' },
  { code: 'te', displayName: '泰卢固语', name: 'Telugu' },
  { code: 'ro', displayName: '罗马尼亚语', name: 'Romanian' },
  { code: 'hu', displayName: '匈牙利语', name: 'Hungarian' },
  { code: 'bg', displayName: '保加利亚语', name: 'Bulgarian' },
  { code: 'hr', displayName: '克罗地亚语', name: 'Croatian' },
  { code: 'sr', displayName: '塞尔维亚语', name: 'Serbian' },
  { code: 'sk', displayName: '斯洛伐克语', name: 'Slovak' },
  { code: 'my', displayName: '缅甸语', name: 'Burmese' },
  { code: 'km', displayName: '高棉语', name: 'Khmer' },
  { code: 'lo', displayName: '老挝语', name: 'Lao' },
  { code: 'mn', displayName: '蒙古语', name: 'Mongolian' },
  { code: 'ne', displayName: '尼泊尔语', name: 'Nepali' },
  { code: 'sw', displayName: '斯瓦希里语', name: 'Swahili' },
];

module.exports = { LANGUAGES };
