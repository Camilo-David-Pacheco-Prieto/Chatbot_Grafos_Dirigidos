import { createHash, timingSafeEqual } from 'node:crypto';
import { completeConversation, getConversation } from '../../../lib/store.js';
import { getCallbackSecret } from '../../../lib/env.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Comparación en tiempo constante: se comparan hashes del mismo largo.
function safeEqual(a, b) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST({ request }) {
  const expected = getCallbackSecret();
  const provided = request.headers.get('x-callback-secret') ?? '';
  if (!expected || !provided || !safeEqual(provided, expected)) {
    return json({ error: 'No autorizado.' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'El cuerpo debe ser JSON válido.' }, 400);
  }

  const { conversationId, response } = body ?? {};
  if (typeof conversationId !== 'string' || typeof response !== 'string' || !conversationId) {
    return json({ error: 'Se requieren "conversationId" y "response" (texto).' }, 400);
  }

  if (!getConversation(conversationId)) {
    return json({ error: 'Conversación no encontrada.' }, 404);
  }

  completeConversation(conversationId, response);
  return json({ ok: true });
}
