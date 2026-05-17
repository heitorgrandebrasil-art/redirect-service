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

export async function sendTelegramMessage(botToken, chatId, text) {
  const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    const data = await res.json();
    if (!data.ok) {
      logger.warn({ event: 'telegram.send.failed', chatId, description: data.description });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ event: 'telegram.send.error', chatId, error: err.message });
    return false;
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
    '⚠️ <b>Ação:</b> Acesse o painel e troque o link',
  ].join('\n');
}
