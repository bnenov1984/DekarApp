# ADR-006 — UI Framework: Svelte + Vite (без SvelteKit)

**Статус:** Accepted (Engineering, 2026-07-15, при старт на UI имплементацията)
**Отговаря на:** "С какво се пише UI chrome-ът (Shell/Studio/System, 15 §1.1)?" — изрично оставено отворено в 21 §12 ("избор на UI framework... Phase 4"). Различен въпрос от ADR-002 (рендер технология на самото платно — Canvas2D, вече решено); тук иде реч за TopBar/панели/dock/command palette реактивността, не за canvas draw calls.

## Контекст

- PD-001: Web-first PWA, една кодова база за desktop/mobile.
- Bible Core Principle "Performance First"; 15 §17: <3 сек до интерактивно платно.
- Core/Application са вече framework-agnostic чист TS (21 §1) — framework избор засяга **само** `src/ui/`.
- Продуктът е структурно малък по екрани (2 екрана + overlays, 15 §4) — не се нуждае от heavy routing/SSR инфраструктура.
- Екипът е solo/AI-assisted engineering — по-малко boilerplate и по-малко runtime "магия" за дебъгване са пряка полза, не просто предпочитание.

## Решение

**Svelte + Vite**, без SvelteKit (plain SPA — routing-нуждата е тривиална, 2 екрана + overlays не оправдават file-based routing/SSR слой). Canvas самият той си остава извън framework реактивността (imperative draw calls от 21 §6.3 scene graph) — framework-ът управлява само TopBar/панели/dock/overlays chrome-а около него.

**Отхвърлени алтернативи:**
- **React** — по-голям runtime, повече boilerplate (hooks dependency arrays, memo) за полза, която тук не е нужна; екосистемата му (Redux и т.н.) решава проблеми с мащаб, който този продукт няма.
- **Vue** — разумна средна позиция, но Svelte печели по bundle size/performance бюджет без реален компромис в изразителност за този UI обхват.
- **Vanilla TS/Web Components** — максимален контрол, но пренаписва реактивност (панелна видимост, dock активен инструмент, command palette филтриране), която Svelte дава безплатно; цената надвишава ползата за екип от този размер.

**Обосновка за Svelte конкретно:** компилира се away (близо до нулев runtime overhead) — директно обслужва "Performance First" и <3 сек бюджета; малкият bundle пасва на PWA offline-first целта (по-малко за service worker-а да кешира); синтаксисът е близък до plain HTML/CSS/JS, което пази "Simplicity First" философията и в самия codebase, не само в продукта.

## Последици

- `src/ui/**` съдържа `.svelte` файлове + TS; ESLint разширен с `eslint-plugin-svelte` + `svelte-eslint-parser`, за да могат import boundary правилата (21 §3, вече active за `.ts`) да важат и вътре в `<script>` блоковете.
- Vite като build/dev tool (вече присъства индиректно през Vitest, 21 §12/tooling scaffold) — един и същ bundler за dev server и тестове, не два отделни tool-chain-а.
- Service Worker / PWA манифест (21 §9) е отделна, по-късна UI задача — bootstrap-ът на Shell-а не я включва.
- Canvas компонентът е тънка Svelte обвивка около `<canvas>` елемент + imperative redraw при промяна на Shape VO поток (ADR-002) — framework-ът не притежава геометрията, само монтира платното.

## Отворено за следваща UI задача

Конкретна state management стратегия за "текущия Surface" (Svelte stores срещу context API) — избира се при "integrate CommandStack" стъпката, не тук.

## Addendum (2026-07-14) — Module-level Svelte stores, не context API

**Контекст.** Горният отворен въпрос е решен в `feat(ui): integrate CommandStack` (`72cb087`) — `src/ui/stores/studioSession.ts` — но решението никога не е било backfill-нато тук, констатирано като docs drift в `docs/UI_CHECKPOINT_REVIEW.md` §8.

**Решение.** **Module-level Svelte stores** (`writable` на файлово ниво), не context API.

**Обосновка:** сесията е app-глобална по дефиниция (един отворен проект наведнъж, 15 §4 — два екрана, без паралелни студия); клавишни shortcuts и бъдещи overlays (⌘K) се нуждаят от достъп извън Studio component tree-то; store-овете са plain TS — тествани в vitest без монтиране на компоненти (същата логика приложена и за `src/ui/stores/drawingSession.ts`, Tool Dock слайса).

**Статус:** Accepted, формализирано като addendum (не нов ADR — локална прецизация на същия избор, не нова посока).
