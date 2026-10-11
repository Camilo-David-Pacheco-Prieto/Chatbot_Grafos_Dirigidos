// Solo se importa desde endpoints del servidor. Estas variables no llevan el
// prefijo PUBLIC_, por lo que Astro/Vite nunca las expone al navegador.
function read(name) {
  return process.env[name] ?? import.meta.env[name] ?? '';
}

export const getWebhookUrl = () => read('ZAPIER_WEBHOOK_URL');
export const getCallbackSecret = () => read('CALLBACK_SECRET');

// Preguntas por minuto y por IP en /api/chat (0 = sin límite). Por defecto 10.
export const getRateLimit = () => {
  const raw = read('RATE_LIMIT_PER_MIN');
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
};
