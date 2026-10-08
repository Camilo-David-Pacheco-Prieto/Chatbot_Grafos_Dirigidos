// Almacén en memoria de conversaciones. Aislado aquí para poder cambiarlo por
// Redis: basta con mantener estas funciones (todas async-friendly: usa await).
const TTL_MS = 30 * 60 * 1000;
const SWEEP_MS = 60 * 1000;

// globalThis: sobrevive a la recarga de módulos (HMR) en desarrollo.
const g = globalThis;
const conversations = (g.__chatStore ??= new Map());

if (!g.__chatStoreSweeper) {
  g.__chatStoreSweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, c] of conversations) {
      if (now - c.createdAt > TTL_MS) conversations.delete(id);
    }
  }, SWEEP_MS);
  g.__chatStoreSweeper.unref?.();
}

export function createPending(id) {
  conversations.set(id, { status: 'pending', response: null, createdAt: Date.now() });
}

export function getConversation(id) {
  const c = conversations.get(id);
  if (!c) return null;
  if (Date.now() - c.createdAt > TTL_MS) {
    conversations.delete(id);
    return null;
  }
  return c;
}

export function completeConversation(id, response) {
  const c = getConversation(id);
  if (!c) return false;
  c.status = 'done';
  c.response = response;
  return true;
}

export function deleteConversation(id) {
  conversations.delete(id);
}
