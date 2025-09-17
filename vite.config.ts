import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import type { Express } from 'express';

// Dev inline API plugin using Express, loading env from .env.local.
// Avoids vite-plugin-mix (incompatible with Vite v7).
export default defineConfig({
  css: {
    // Inline PostCSS so we don't rely on postcss.config.* discovery (avoids ESM/CJS issues)
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  plugins: [
    react(),
    {
      name: 'dev-inline-api',
      async configureServer(server) {
        // Load server-only env (no VITE_ prefix; not exposed to client)
        const dotenvMod = await import('dotenv');
        dotenvMod.config({ path: '.env.local' });

        const expressMod = await import('express');
        const expressApp: Express = expressMod.default();

        // Mount dev API routes from dev/mount-api.js (outside /api to avoid Vercel conflicts)
        let mount: ((app: Express) => void) | null = null;
        try {
          const mod = await import('./dev/mount-api.js');
          mount = mod.default ?? mod;
        } catch (e) {
          // No dev mount available; skip mounting
          mount = null;
        }
        if (typeof mount === 'function') {
          mount(expressApp);
        }

        // Attach Express as a middleware under Vite dev server
        server.middlewares.use(expressApp);
      },
    },
  ],
});
