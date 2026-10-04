# AreaFlow

A spatial measurement app: import a plan or image, calibrate its scale, draw shapes over it, and
get area, perimeter and distances you can trust. *Simple enough for beginners, powerful enough
for professionals.*

It is a local-first web app (PD-001, PD-012): it works fully offline and without an account.
Signing in only adds optional cloud backup, served by the separate
[areaflow-api](https://github.com/bnenov1984/areaflow-api) backend (ADR-007).

## Getting started

Requires Node 24.

```sh
npm install
npm run dev        # http://localhost:5174/areaflow/
```

The account features need `areaflow-api` running on `http://localhost:8787` (override with
`VITE_AUTH_API_URL`). Everything else works without it.

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest, once (`npm run test:watch` to watch) |
| `npm run lint` | ESLint, including the layer-boundary rules |
| `npm run typecheck` / `typecheck:svelte` | `tsc` and `svelte-check` |
| `npm run build` | Production build into `dist-ui/` |
| `npm run deploy` | Build and publish `dist-ui/` to the `gh-pages` branch |

CI (`.github/workflows/ci.yml`) runs lint, both type checks, tests and the build on every push to
`main` and every pull request.

## Code layout

Four layers with a one-way dependency direction — UI → Application → Core, with Adapters
implementing interfaces that Core/Application define. `eslint-plugin-boundaries` enforces it.

| Folder | Layer |
|--------|-------|
| `src/core/` | Domain model, Measurement Engine, Drawing Engine, calibration — pure, no UI or I/O |
| `src/application/` | Commands (undo/redo through one Command Stack), ports, domain events |
| `src/adapters/` | IndexedDB storage, auth and cloud HTTP clients, plus in-memory fakes that pass the same contract tests |
| `src/ui/` | Svelte 4 SPA: screens, components, interaction sessions, canvas rendering |

## Documentation

The design lives in `docs/` and is the source of truth for intent. Start with
[`docs/INDEX.md`](docs/INDEX.md), which routes each kind of task to the document that governs it.
Product decisions are in [`docs/05_PRODUCT_DECISIONS.md`](docs/05_PRODUCT_DECISIONS.md),
architecture decisions in [`docs/26_ADR/`](docs/26_ADR/), and known open issues in
[`docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md`](docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md).
Commit conventions are in [`CONTRIBUTING.md`](CONTRIBUTING.md); rules for AI agents in
[`CLAUDE.md`](CLAUDE.md).
