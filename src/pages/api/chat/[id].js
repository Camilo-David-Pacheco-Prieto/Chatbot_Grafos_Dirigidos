import { getConversation } from '../../../lib/store.js';

export const prerender = false;

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export function GET({ params }) {
  const c = getConversation(params.id);
  if (!c) {
    return new Response(JSON.stringify({ error: 'Conversación no encontrada o expirada.' }), {
      status: 404,
      headers,
    });
  }
  const payload = c.status === 'done' ? { status: 'done', response: c.response } : { status: 'pending' };
  return new Response(JSON.stringify(payload), { status: 200, headers });
}
