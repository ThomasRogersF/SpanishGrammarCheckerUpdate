import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import type { Express } from 'express';
/// <reference path="./dev/mount-api.d.ts" />

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
        let mountFn: ((app: Express) => void) | null = null;
        try {
          // @ts-ignore - dev-only module lacks types and is not included in production type checks
          const mod = await import('./dev/mount-api.js');
          mountFn = (mod?.default ?? mod) as (app: Express) => void;
        } catch {
          mountFn = null;
        }
        if (typeof mountFn === 'function') {
          mountFn(expressApp);
        }

        // Attach Express as a middleware under Vite dev server
        server.middlewares.use(expressApp);
      },
    },
  ],
});
