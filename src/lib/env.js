// Solo se importa desde endpoints del servidor. Estas variables no llevan el
// prefijo PUBLIC_, por lo que Astro/Vite nunca las expone al navegador.
function read(name) {
  return process.env[name] ?? import.meta.env[name] ?? '';
}

export const getWebhookUrl = () => read('ZAPIER_WEBHOOK_URL');
export const getCallbackSecret = () => read('CALLBACK_SECRET');

// Commit desplegado: Render lo define en RENDER_GIT_COMMIT. Es solo un indicador visual
// de la versión; no es un secreto.
export const getCommit = () => read('RENDER_GIT_COMMIT').slice(0, 7);
