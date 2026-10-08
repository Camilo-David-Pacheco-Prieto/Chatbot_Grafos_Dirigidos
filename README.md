# Tutor de grafos dirigidos

Chat web para un tutor académico de **grafos dirigidos (dígrafos)**. El navegador habla con un backend hecho en **Astro (SSR, JavaScript, adaptador de Node)**, que reenvía cada pregunta a un **agente de Zapier** y devuelve la respuesta (en Markdown) cuando el agente termina.

## Arquitectura

Zapier no responde de forma síncrona: el agente puede tardar decenas de segundos. Por eso el flujo es asíncrono: el servidor envía la pregunta, Zapier devuelve la respuesta más tarde con un *callback*, y el navegador consulta (*polling*) hasta que está lista.

```
 Navegador                Servidor Astro (Node)                    Zapier
    |                              |                                  |
    |-- POST /api/chat ----------->|                                  |
    |   { message }                |-- guarda id como "pending"       |
    |                              |-- POST webhook ----------------->| Paso 1: Catch Hook
    |                              |   { message, conversationId }    | Paso 2: Run Agent
    |<-- 200 { conversationId } ---|   (timeout 15 s, si falla: 502)  |   (puede tardar)
    |                              |                                  |
    |-- GET /api/chat/:id -------->|                                  |
    |<-- { status: "pending" } ----|   (cada 2 s, máx. 120 s)         |
    |           ...                |                                  |
    |                              |<-- POST /api/chat/callback ------| Paso 3: Webhooks POST
    |                              |    { conversationId, response }  |
    |                              |    header x-callback-secret      |
    |                              |-- valida secreto, marca "done"   |
    |-- GET /api/chat/:id -------->|                                  |
    |<-- { status:"done",          |                                  |
    |      response:"## ..." } ----|                                  |
    |-- renderiza Markdown (marked + DOMPurify)                       |
```

| Pieza | Archivo | Qué hace |
|---|---|---|
| Interfaz | `src/pages/index.astro` | Chat con menú lateral de recientes (guardados en el `localStorage` del navegador), sugerencias y polling. |
| Enviar pregunta | `src/pages/api/chat.js` | Valida, crea el id, llama al webhook de Zapier. |
| Callback | `src/pages/api/chat/callback.js` | Recibe la respuesta de Zapier (protegido con `x-callback-secret`). |
| Consulta | `src/pages/api/chat/[id].js` | Devuelve el estado de una conversación. |
| Almacén | `src/lib/store.js` | `Map` en memoria con expiración de 30 min. |
| Variables | `src/lib/env.js` | Lee las variables de entorno (solo servidor). |

La URL del webhook y el secreto **solo se leen en el servidor**; nunca llegan al navegador.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `ZAPIER_WEBHOOK_URL` | URL del *Catch Hook* de Zapier (`<TU-WEBHOOK>`). |
| `CALLBACK_SECRET` | Clave compartida que Zapier envía en el header `x-callback-secret` (`<CLAVE>`). |
| `PORT` | Puerto de escucha (por defecto 4321; Render lo define solo). |

Genera una `CALLBACK_SECRET` nueva (48 caracteres hexadecimales):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

## Correr en local

Requisitos: Node 22.12 o superior y [pnpm](https://pnpm.io).

```bash
pnpm install
cp .env.example .env      # Windows: copy .env.example .env
# edita .env con <TU-WEBHOOK> y <CLAVE>
pnpm dev                  # http://localhost:4321
```

Comprobar el build de producción tal como corre en Render:

```bash
pnpm install && pnpm build && pnpm start   # escucha en 0.0.0.0:$PORT (4321 por defecto)
```

`pnpm start` carga `.env` si existe; en Render no existe y se usan las variables del servicio.

### Exponer el entorno local con ngrok

Zapier necesita una URL pública para llamar al callback. Con el servidor local corriendo:

```bash
ngrok http 4321
```

Usa la URL `https://xxxx.ngrok-free.app` (también visible en `http://127.0.0.1:4040`) en el paso 3 del Zap. **La URL de ngrok es solo para desarrollo**: cambia cada vez que reinicias ngrok en el plan gratuito.

## Desplegar en Render (paso a paso)

> **Orden obligatorio:** primero se crea y despliega el servicio para conocer su URL pública; **después** se configura el paso 3 del Zap con esa URL.

1. Sube el proyecto a un repositorio de GitHub/GitLab (el `.env` no se sube: está en `.gitignore`).
2. En [Render](https://dashboard.render.com): **New + → Blueprint** y selecciona el repositorio. Render lee `render.yaml`. (Alternativa manual: **New + → Web Service** con runtime *Node*.)
3. Comandos (ya definidos en `render.yaml`; si lo haces manualmente, escríbelos tú):
   - **Build Command:** `pnpm install && pnpm build`
   - **Start Command:** `pnpm start`
4. Define las variables de entorno cuando Render las pida (están como `sync: false`, sin valores en el repo):
   - `ZAPIER_WEBHOOK_URL` = `<TU-WEBHOOK>`
   - `CALLBACK_SECRET` = `<CLAVE>` (genera una nueva con el comando de arriba)
5. Despliega y copia la URL pública, p. ej. `https://chatbot-grafos-dirigidos.onrender.com`.
6. Con esa URL, configura el paso 3 del Zap (ver abajo) usando la misma `<CLAVE>`.
7. Prueba el chat en la URL del servicio.

## Configuración exacta del Zap

**Paso 1 — Webhooks by Zapier → Catch Hook**
- Copia la *Custom Webhook URL* en `ZAPIER_WEBHOOK_URL`.
- El servidor envía JSON con dos campos: `message` y `conversationId`. Para que Zapier los reconozca, haz una primera pregunta de prueba (con el servicio ya funcionando) y pulsa *Test trigger* para cargar esos campos.

**Paso 2 — AI by Zapier / Agents → Run Agent**
- Elige el agente.
- **Agent Input Message** = el campo **Message** del paso 1.
- Pídele al agente que responda en Markdown (títulos `##`, **negritas**, listas).

**Paso 3 — Webhooks by Zapier → POST**
- **URL:** `<URL-DEL-SERVICIO>/api/chat/callback`
- **Payload Type:** `Json`
- **Data:**
  - `conversationId` = el campo **Conversation Id** del paso 1
  - `response` = la salida (texto) del agente del paso 2
- **Headers:** `x-callback-secret` = `<CLAVE>` (el mismo valor de `CALLBACK_SECRET` del servicio)

Respuestas del callback: `200` OK, `400` body inválido, `401` secreto incorrecto, `404` conversación inexistente o expirada.

## Cambiar de agente o de URL

| Quiero… | Qué tocar |
|---|---|
| Usar otro agente | Solo el **paso 2** del Zap. El código y las variables no cambian. |
| Usar otro Zap / otro Catch Hook | Cambia `ZAPIER_WEBHOOK_URL` en el servicio (en Render: *Environment*; el servicio se reinicia) y revisa que el nuevo Zap tenga los 3 pasos. |
| Rotar el secreto | Cambia `CALLBACK_SECRET` en el servicio **y** el header `x-callback-secret` del paso 3 al mismo valor. |
| La URL del servicio cambió (nuevo servicio, dominio propio, nuevo túnel de ngrok) | Actualiza **solo el paso 3** del Zap con la nueva `<URL-DEL-SERVICIO>/api/chat/callback`. |

Regla: crea y despliega primero el servicio para obtener su URL pública; solo después actualiza el paso 3 del Zap y las variables.

## Limitaciones conocidas

- **Almacén en memoria.** Las conversaciones viven en un `Map` con expiración de 30 minutos. Se pierden al reiniciar el servicio, y **no funciona con varias instancias** (el callback podría llegar a una instancia distinta de la que espera el navegador) **ni en Vercel/serverless**. Para escalar, migra `src/lib/store.js` a Redis conservando sus funciones (`createPending`, `getConversation`, `completeConversation`, `deleteConversation`).
- **Planes gratuitos que duermen el servicio.** En Render gratuito el servicio se suspende tras un rato sin tráfico; la primera petición tarda ~50 s en despertar. Una respuesta pendiente se pierde si el servicio se reinicia antes del callback.
- **ngrok solo para desarrollo.** Su URL gratuita cambia en cada arranque.
- El historial del menú lateral vive en el `localStorage` del navegador (no se comparte entre dispositivos). Solo se procesa una pregunta a la vez por pestaña.

## Solución de problemas

**El chat se queda en «Preparando la respuesta» (hasta que sale «Tiempo agotado»)**
1. Abre **Zap runs** en Zapier: ¿se ejecutó el Zap? Si no, el trigger no recibió la pregunta (revisa `ZAPIER_WEBHOOK_URL`).
2. Si el Zap corrió, mira si falló el paso 3 o si el agente aún no terminó.
3. Revisa que la URL del paso 3 sea `<URL-DEL-SERVICIO>/api/chat/callback` y que apunte al servicio **actual** (¿cambió la URL de ngrok o del servicio?).
4. Revisa que `x-callback-secret` sea idéntico a `CALLBACK_SECRET` y que `conversationId` y `response` estén mapeados.
5. Si el servicio se reinició o se durmió, la conversación pendiente ya no existe (el callback recibe 404): vuelve a preguntar.

**401 en el callback**
El header `x-callback-secret` falta, está mal escrito o no coincide con `CALLBACK_SECRET` del servicio (espacios sobrantes, secreto rotado en un lado solo). Corrígelo en el paso 3 o en las variables del servicio.

**404 en el callback**
El `conversationId` no existe: expiró (30 min), el servicio se reinició o el campo no está mapeado desde el paso 1.

**502 al enviar la pregunta**
El servidor no pudo contactar el webhook de Zapier (error, timeout de 15 s o URL inválida). Verifica `ZAPIER_WEBHOOK_URL`, que el Zap esté **activado** y que Zapier esté disponible. Un `500` indica que falta `ZAPIER_WEBHOOK_URL` en las variables.

### Probar con curl

```bash
# 401: sin clave
curl -i -X POST <URL>/api/chat/callback -H 'Content-Type: application/json' \
  -d '{"conversationId":"x","response":"hola"}'
# 404: clave correcta, id inexistente
curl -i -X POST <URL>/api/chat/callback -H 'Content-Type: application/json' \
  -H 'x-callback-secret: <CLAVE>' -d '{"conversationId":"x","response":"hola"}'
# 400: mensaje vacío
curl -i -X POST <URL>/api/chat -H 'Content-Type: application/json' -d '{"message":""}'
```
