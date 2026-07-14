import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// docs/26_ADR/ADR-006-ui-framework.md — plain Vite+Svelte SPA, no SvelteKit (routing needs are
// trivial: 2 screens + overlays, 15_UX_SPECIFICATION §4). Vite also drives `npm test` (vitest),
// so dev server and test runner share one bundler config, not two toolchains.
export default defineConfig({
  root: 'src/ui',
  // preprocess passed explicitly (not auto-discovered from svelte.config.js) because `root:
  // 'src/ui'` above shifts vite-plugin-svelte's config-file resolution away from the actual
  // project root, where svelte.config.js lives.
  plugins: [svelte({ preprocess: vitePreprocess() })],
  server: {
    // 5173 is already claimed by another project's launch.json entry sharing this session's
    // primary working directory (InvoiceOCR) — 5174 avoids the collision.
    port: 5174,
  },
  build: {
    outDir: '../../dist-ui',
    emptyOutDir: true,
  },
});
