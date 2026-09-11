/// <reference types="svelte" />
/// <reference types="vite/client" />

// docs/26_ADR/ADR-007 — the areaflow-api base URL the BetterAuthAdapter talks to
// (adapters/betterAuth/authAdapter.ts). Defaults to the local dev server (areaflow-api's own
// default port) when unset, so a plain `npm run dev` here needs no .env at all.
interface ImportMetaEnv {
  readonly VITE_AUTH_API_URL?: string;
}
