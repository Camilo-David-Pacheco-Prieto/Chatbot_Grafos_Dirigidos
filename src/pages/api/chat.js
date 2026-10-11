import { randomUUID } from 'node:crypto';
import { createPending, deleteConversation } from '../../lib/store.js';
import { getWebhookUrl, getRateLimit } from '../../lib/env.js';
import { checkRate, clientIp } from '../../lib/rate-limit.js';

export const prerender = false;

const MAX_LEN = 2000;
const WEBHOOK_TIMEOUT_MS = 15_000;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

export async function POST(context) {
  const { request } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'El cuerpo debe ser JSON válido.' }, 400);
  }

  const message = body?.message;
  if (typeof message !== 'string' || message.trim() === '') {
    return json({ error: 'El campo "message" es obligatorio y no puede estar vacío.' }, 400);
  }
  if (message.length > MAX_LEN) {
    return json({ error: `El mensaje no puede superar los ${MAX_LEN} caracteres.` }, 400);
  }

  const limit = getRateLimit();
  if (limit > 0) {
    let fallback = '';
    try {
      fallback = context.clientAddress;
    } catch {}
    const rate = checkRate(clientIp(request, fallback), limit);
    if (!rate.ok) {
      return json(
        { error: 'Demasiadas preguntas seguidas. Espera unos segundos e inténtalo de nuevo.' },
        429,
        { 'Retry-After': String(rate.retryAfter) },
      );
    }
  }

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.error('ZAPIER_WEBHOOK_URL no está configurada.');
    return json({ error: 'El servidor no está configurado correctamente.' }, 500);
  }

  const conversationId = randomUUID();
  createPending(conversationId);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.trim(), conversationId }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Zapier respondió ${res.status}`);
  } catch (err) {
    console.error('Fallo al llamar al webhook de Zapier:', err.message);
    deleteConversation(conversationId);
    return json(
      { error: 'No se pudo contactar con el tutor (Zapier). Inténtalo de nuevo en unos momentos.' },
      502,
    );
  }

  return json({ conversationId });
}
