'use strict';
// OpenAI 兼容翻译上游。
// 只做一件事：把文本翻成目标语言，原样返回译文，不加解释、不加前后缀、不编造。

function languageName(code, languages) {
  const found = languages.find((item) => item.code === code);
  return found ? found.name : code;
}

async function translateText({ fromLang, targetLang, text, apiBase, apiKey, model, languages }) {
  const base = apiBase.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              `You are a professional translator. Translate the user's text from ` +
              `${languageName(fromLang, languages)} to ${languageName(targetLang, languages)}. ` +
              `Output ONLY the translated text, with no explanation, no preamble, ` +
              `no quotation marks added around it. Preserve line breaks, emoji and formatting.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`上游返回 HTTP ${response.status}: ${detail.slice(0, 200)}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    const content =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('上游返回为空');
    }
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { translateText };
