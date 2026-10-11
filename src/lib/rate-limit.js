// Límite de preguntas por IP (ventana deslizante de 60 s) en memoria. Igual que store.js,
// no se comparte entre instancias y se reinicia con el servicio.
const WINDOW_MS = 60_000;

const g = globalThis;
const hits = (g.__rateHits ??= new Map());

if (!g.__rateSweeper) {
  g.__rateSweeper = setInterval(() => {
    const cut = Date.now() - WINDOW_MS;
    for (const [ip, times] of hits) {
      const keep = times.filter((t) => t > cut);
      if (keep.length) hits.set(ip, keep);
      else hits.delete(ip);
    }
  }, WINDOW_MS);
  g.__rateSweeper.unref?.();
}

// Render va detrás de Cloudflare: cf-connecting-ip es la IP real del visitante.
export function clientIp(request, fallback = '') {
  const h = request.headers;
  return h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || fallback || 'desconocida';
}

export function checkRate(ip, limit) {
  const now = Date.now();
  const times = (hits.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
  if (times.length >= limit) {
    hits.set(ip, times);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((times[0] + WINDOW_MS - now) / 1000)) };
  }
  times.push(now);
  hits.set(ip, times);
  return { ok: true };
}
