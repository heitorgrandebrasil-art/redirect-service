import logger from '../logger.js';

const MARKETPLACE_LABELS = {
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee',
  outros: 'Outros',
  affiliate: 'Afiliado',
};

const PLATFORM_LABELS = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X (Twitter)',
  other: 'Outro',
};

export function buildInlineKeyboard(productId) {
  return {
    inline_keyboard: [[
      { text: '✅ Já corrigi', callback_data: `fix:${productId}` },
      { text: '🔕 Ignorar 24h', callback_data: `snooze:${productId}` },
    ]],
  };
}

export async function sendTelegramMessage(botToken, chatId, text, replyMarkup = null) {
  const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const body = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      logger.warn({ event: 'telegram.send.failed', chatId, description: data.description });
      return false;
    }
    logger.info({ event: 'telegram.send.ok', chatId, messageId: data.result?.message_id });
    return true;
  } catch (err) {
    logger.warn({ event: 'telegram.send.error', chatId, error: err.message });
    return false;
  }
}

export async function answerCallbackQuery(botToken, callbackQueryId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
    });
  } catch (err) {
    logger.warn({ event: 'telegram.answer_callback.error', error: err.message });
  }
}

export async function editMessageReplyMarkup(botToken, chatId, messageId, replyMarkup) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: replyMarkup }),
    });
  } catch (err) {
    logger.warn({ event: 'telegram.edit_markup.error', error: err.message });
  }
}

export async function editMessageText(botToken, chatId, messageId, text, replyMarkup = null) {
  try {
    const body = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' };
    if (replyMarkup !== null) body.reply_markup = replyMarkup;
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.warn({ event: 'telegram.edit_text.error', error: err.message });
  }
}

export function buildBrokenLinkMessage({ campaignTitle, platform, marketplace, profileName, shortUrl }) {
  const platformLabel = PLATFORM_LABELS[platform?.toLowerCase()] ?? platform ?? 'Desconhecida';
  const marketplaceLabel = MARKETPLACE_LABELS[marketplace?.toLowerCase()] ?? marketplace ?? 'Desconhecido';

  return [
    '🚨 <b>Link quebrado detectado!</b>',
    '',
    `📺 <b>Vídeo:</b> ${campaignTitle ?? 'Sem título'}`,
    `🏪 <b>Plataforma do vídeo:</b> ${platformLabel}`,
    `🛒 <b>Marketplace:</b> ${marketplaceLabel}`,
    `👤 <b>Perfil:</b> ${profileName ?? 'Sem perfil'}`,
    `🔗 <b>Link curto:</b> <code>${shortUrl}</code>`,
    '',
    '⚠️ Use os botões abaixo para confirmar a correção ou silenciar.',
  ].join('\n');
}
