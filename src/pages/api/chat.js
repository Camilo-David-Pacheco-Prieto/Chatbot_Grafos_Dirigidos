import { randomUUID } from 'node:crypto';
import { createPending, deleteConversation } from '../../lib/store.js';
import { getWebhookUrl } from '../../lib/env.js';

export const prerender = false;

const MAX_LEN = 2000;
const WEBHOOK_TIMEOUT_MS = 15_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function POST({ request }) {
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
