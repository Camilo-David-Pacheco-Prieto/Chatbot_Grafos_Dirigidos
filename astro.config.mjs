import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: {
    // Escucha en 0.0.0.0 (necesario en Render/contenedores). El puerto en
    // producción lo toma el adaptador de la variable PORT (por defecto 4321).
    host: true,
  },
  vite: {
    server: {
      // Permite abrir el dev server a través de un túnel (ngrok).
      allowedHosts: true,
    },
  },
});
