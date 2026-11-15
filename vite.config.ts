import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// docs/26_ADR/ADR-006-ui-framework.md — plain Vite+Svelte SPA, no SvelteKit (routing needs are
// trivial: 2 screens + overlays, 15_UX_SPECIFICATION §4). Vite also drives `npm test` (vitest),
// so dev server and test runner share one bundler config, not two toolchains.
export default defineConfig({
  root: 'src/ui',
  // Served from the site root on Render (docs/26_ADR/ADR-008).
  base: '/',
  // preprocess passed explicitly (not auto-discovered from svelte.config.js) because `root:
  // 'src/ui'` above shifts vite-plugin-svelte's config-file resolution away from the actual
  // project root, where svelte.config.js lives.
  plugins: [svelte({ preprocess: vitePreprocess() })],
  server: {
    // 5173 is already claimed by another project's launch.json entry sharing this session's
    // primary working directory (InvoiceOCR) — 5174 avoids the collision. PORT env var (set by
    // the preview tool's autoPort) overrides this when present, so the tool's assigned port and
    // vite's actual bound port always agree.
    port: process.env.PORT ? Number(process.env.PORT) : 5174,
    strictPort: !!process.env.PORT,
  },
  build: {
    outDir: '../../dist-ui',
    emptyOutDir: true,
    // PD-026 / ADR-009: two HTML entries — the static landing page at the site root and the SPA
    // under /app/. Vite's multi-page mode; the dev server serves both from the same tree.
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL('./src/ui/index.html', import.meta.url)),
        app: fileURLToPath(new URL('./src/ui/app/index.html', import.meta.url)),
      },
    },
  },
});
