# AGENTS.md — guía para agentes de IA

Proyecto: chat de un tutor académico de **grafos dirigidos** hecho con Astro (SSR, adaptador `@astrojs/node`, modo `standalone`) que consulta un agente de Zapier de forma asíncrona. Documentación para personas en `README.md`.

## ⚠️ Regla de oro (orden de operaciones)

> **Para conectar un agente o cambiar variables: primero hay que crear el servicio y desplegarlo para obtener la URL pública; solo después se actualiza el paso 3 del Zap y las variables del servicio.**

Zapier necesita la URL pública del servicio (`<URL-DEL-SERVICIO>/api/chat/callback`) para devolver la respuesta. Si cambias el Zap o las variables antes de tener esa URL, el chat se quedará en «Preparando la respuesta». Si la URL cambia (nuevo servicio, dominio, túnel ngrok), solo hay que actualizar el paso 3 del Zap.

## Convenciones

- **JavaScript, sin TypeScript.** No añadas `.ts`, `tsconfig` ni anotaciones de tipos.
- **pnpm**, nunca npm/yarn. No crees `package-lock.json`. `pnpm-workspace.yaml` aprueba el build script de `esbuild`.
- Node ≥ 22.12, ES modules (`"type": "module"`).
- Textos de interfaz, errores y documentación en **español**.
- Las variables de entorno solo se leen en el servidor (`src/lib/env.js`). Nunca uses prefijo `PUBLIC_` ni las expongas al cliente.
- **Nunca escribas valores reales** de `ZAPIER_WEBHOOK_URL` ni `CALLBACK_SECRET` en archivos versionados; usa `<TU-WEBHOOK>` y `<CLAVE>`. `.env` está en `.gitignore`.
- Código simple y comentarios solo donde el porqué no es obvio.

## Comandos

```bash
pnpm install
pnpm dev      # desarrollo en http://localhost:4321
pnpm build    # genera dist/
pnpm start    # node dist/server/entry.mjs, escucha en 0.0.0.0:$PORT (carga .env si existe)
```

## Estructura y responsabilidades

```
astro.config.mjs          output 'server', adaptador node standalone, server.host:true (0.0.0.0)
render.yaml               Blueprint de Render (variables con sync:false, sin valores)
.env.example              plantilla de variables (ZAPIER_WEBHOOK_URL, CALLBACK_SECRET)
src/lib/env.js            getWebhookUrl(), getCallbackSecret(): lectura de variables (solo servidor)
src/lib/store.js          almacén en memoria con TTL de 30 min; único punto a cambiar para migrar a Redis
src/pages/index.astro     toda la UI + <script> vanilla (chat, menú lateral de recientes en localStorage,
                          polling cada 2 s hasta 120 s, Markdown con marked + DOMPurify)
src/pages/api/chat.js             POST: valida y reenvía la pregunta a Zapier
src/pages/api/chat/callback.js    POST: recibe la respuesta de Zapier
src/pages/api/chat/[id].js        GET: estado de una conversación
```

`store.js` exporta `createPending(id)`, `getConversation(id)` (devuelve `null` si no existe o expiró), `completeConversation(id, text)` y `deleteConversation(id)`. Si lo migras a Redis, mantén esa interfaz (hazla `async` y añade `await` en los endpoints). El almacén actual no sirve con varias instancias ni en serverless.

## Contrato de los endpoints

Todos con `export const prerender = false`, respuestas JSON y `Cache-Control: no-store`. Los errores tienen la forma `{ "error": "mensaje en español" }`.

### `POST /api/chat`
- **Entrada:** JSON `{ "message": string }`; no vacío tras `trim()`, máx. 2000 caracteres.
- **Efecto:** genera `conversationId` (`crypto.randomUUID()`), lo guarda como `pending` y hace `POST` JSON a `ZAPIER_WEBHOOK_URL` con `{ message, conversationId }` (timeout 15 s).
- **Salida 200:** `{ "conversationId": string }`
- **400:** JSON inválido, `message` no string, vacío o > 2000.
- **500:** falta `ZAPIER_WEBHOOK_URL` en el servidor.
- **502:** Zapier falló, respondió no-2xx o hubo timeout (la conversación se elimina).

### `POST /api/chat/callback`
- **Autenticación:** header `x-callback-secret` comparado con `CALLBACK_SECRET` en tiempo constante (SHA-256 + `timingSafeEqual`).
- **Entrada:** JSON `{ "conversationId": string, "response": string }`.
- **Salida 200:** `{ "ok": true }` y la conversación pasa a `done` con el texto.
- **401:** header ausente/incorrecto o `CALLBACK_SECRET` sin definir.
- **400:** JSON inválido o campos que no son string.
- **404:** `conversationId` inexistente o expirado.
- Orden de validación: 401 → 400 → 404.

### `GET /api/chat/[id]`
- **200:** `{ "status": "pending" }` o `{ "status": "done", "response": string }` (Markdown).
- **404:** id inexistente o expirado (30 min).

## Flujo en Zapier (resumen)

1. *Catch Hook* recibe `message` y `conversationId`.
2. *Run Agent* con Agent Input Message = Message.
3. *Webhooks by Zapier → POST* a `<URL-DEL-SERVICIO>/api/chat/callback`, Json con `conversationId` y `response`, header `x-callback-secret` = `<CLAVE>`.

Detalle completo, despliegue en Render y solución de problemas: `README.md`.

## Antes de terminar un cambio

- `pnpm build` sin errores.
- Probar con curl: callback sin clave → 401, id inexistente → 404, mensaje vacío → 400.
- Verificar que ningún archivo versionado contenga valores reales de las variables.
