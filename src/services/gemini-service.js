import { readFileSync, existsSync } from 'fs';
import { getSetting } from './settings-service.js';
import logger from '../logger.js';

const MODEL = 'gemini-2.0-flash-exp';
const PROMPT = `Analise esta captura de tela de uma página de produto de e-commerce. Responda APENAS em JSON com a estrutura exata:
{"status":"ok","reason":"motivo curto em português","confidence":0.9}

Onde:
- status "ok": produto disponível com botão de compra ou carrinho ativo
- status "broken": produto não encontrado, 404, esgotado em todas as variações, produto indisponível, vitrine genérica (recomendações, listas, etc)
- status "uncertain": impossível determinar com clareza
- confidence: certeza entre 0.0 e 1.0`;

export async function getGeminiApiKey() {
  return getSetting('gemini_api_key');
}

export async function analyzeScreenshot(screenshotPath) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) return null;

  if (!existsSync(screenshotPath)) {
    logger.warn({ event: 'gemini.screenshot_not_found', path: screenshotPath });
    return null;
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });

    const base64 = readFileSync(screenshotPath).toString('base64');
    const result = await model.generateContent([
      PROMPT,
      { inlineData: { mimeType: 'image/png', data: base64 } },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('No JSON in Gemini response');
    const parsed = JSON.parse(jsonMatch[0]);

    if (!['ok', 'broken', 'uncertain'].includes(parsed.status) || typeof parsed.confidence !== 'number') {
      throw new Error('Invalid Gemini response format');
    }

    logger.info({ event: 'gemini.analyzed', status: parsed.status, confidence: parsed.confidence });
    return {
      status: parsed.status,
      reason: String(parsed.reason ?? ''),
      confidence: Number(parsed.confidence),
    };
  } catch (err) {
    logger.warn({ event: 'gemini.analysis_failed', error: err.message });
    return null;
  }
}

export async function testGeminiKey(apiKey) {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent('Responda com apenas a palavra: OK');
    return { ok: true, response: result.response.text().trim() };
  } catch (err) {
    return { ok: false, error: err.message, code: err.status ?? null };
  }
}
