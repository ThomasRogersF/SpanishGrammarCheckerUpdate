import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

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
        const expressApp = expressMod.default();

        // Mount our API routes (prefer JS to avoid TS loader issues in Node)
        let mount: any = null;
        try {
          const mod = await import('./api/index.js');
          mount = (mod as any).default ?? mod;
        } catch {
          // Fallback to TS if JS not found and environment supports it
          const mod = await import('./api/index.ts');
          mount = (mod as any).default ?? mod;
        }
        if (typeof mount === 'function') {
          mount(expressApp as any);
        }

        // Attach Express as a middleware under Vite dev server
        server.middlewares.use(expressApp as any);
      },
    },
  ],
});
