# ADR-007 — Backend хостинг и framework: Hono (Node) + Render + Neon Postgres + Cloudflare R2

**Статус:** Accepted (Engineering, 2026-09-11)
**Отговаря на:** "Къде и с какво работи новият API service (Better Auth, Project/Surface persistence, Stripe webhooks)?" — изрично оставено отворено в [23_API.md](../23_API.md) §6 ("конкретен backend framework... Phase 4/имплементация детайли") и [21_ARCHITECTURE.md](../21_ARCHITECTURE.md) §12 ("конкретна cloud услуга зад CloudAdapter... чака Phase 4"). Различен въпрос от ADR-006 (UI chrome framework за SPA-то) — тук иде реч за нов, отделен deployable: сървърен процес, който SPA-то никога не е притежавало.

## Контекст

- PD-012: cloud е опционален adapter, никога на критичния път — SPA-то трябва да продължи да работи локално, offline, без акаунт, независимо какво се избере тук.
- ADR-006 отхвърли SvelteKit единствено заради UI routing нуждите на SPA-то (2 екрана + overlays) — тази обосновка не покрива въпроса "имаме ли нужда от сървър изобщо"; това е нов избор, не разширение на ADR-006.
- Better Auth е self-hosted библиотека, не managed услуга — изисква Node-съвместим сървърен процес + релационна БД, собственост на продукта (23 §6; SaaS Audit §D).
- Stripe webhook обработка изисква raw request body достъп за подпис верификация и дълготраен, надежден endpoint — не всяка runtime среда го поддържа еднакво безпроблемно (виж отхвърлени алтернативи).
- Екипът е solo/AI-assisted engineering (ADR-006 контекст, непроменено) — по-малко операционна повърхност и по-малко "магия" за дебъгване са пряка полза, не просто предпочитание.
- Guardrail "простота преди функции" и изричната инструкция да се избягва ненужна инфраструктура/разходи (SaaS Audit §F, за blob storage) важат еднакво и за самия backend избор.
- 23_API.md §6 вече дефинира формата на Cloud Sync API (`POST/GET /v1/projects/{projectId}/surfaces/{surfaceId}`) — framework-ът трябва само да имплементира този контракт, не да го преоткрива.

## Решение

**Framework: [Hono](https://hono.dev), на Node.js runtime** (не Cloudflare Workers/edge за v1).
**Hosting: Render** (Web Service, git-push деплой).
**База данни: [Neon](https://neon.tech)** (managed serverless Postgres, отделен vendor от Render).
**Blob storage: Cloudflare R2** (вече решено в SaaS Audit §F, потвърдено тук като част от същия deployment граф).

```
Render (един Node процес, Hono)
 ├── Better Auth handler        (/api/auth/*)
 ├── Project/Surface REST       (/v1/projects/*, съгласно 23_API.md §6)
 ├── Stripe webhook handler     (/api/stripe/webhook)
 └── driver → Neon Postgres (users, sessions, projects, surfaces-JSONB)
      → presigned URLs → Cloudflare R2 (image/PDF blobs, backend никога не пипа байтовете)
```

Целият backend е **един деплоем процес** в тази фаза — няма основание за отделни микросървиси за auth/billing/projects при този мащаб (guardrail за простота, директно приложен).

### Защо Hono

- TypeScript-native, минимален runtime overhead — същата обосновка, която спечели Svelte в ADR-006 (bundle/runtime простота), приложена тук последователно към backend избора.
- Официална, поддържана Better Auth интеграция (`better-auth/hono` handler adapter) — документиран път, не custom glue код.
- Runtime-портируем (Node днес; Cloudflare Workers/Deno/Bun по-късно, ако някога потрябва) — не заключва инфраструктурния избор завинаги, без да плаща сложността на edge сега.

### Защо Node, не edge/Workers, за v1

Stripe SDK и Postgres драйвери (`pg`/`postgres.js`) имат най-зрялата, най-малко "магическа" поддръжка на обикновен Node процес днес. Edge рънтайм би добавил реални ограничения (HTTP-only Postgres достъп през допълнителен driver слой, различно оформена Stripe webhook верификация) без продуктова полза при текущия мащаб — няма измерена latency нужда за глобално разпределение, един регион е достатъчен.

### Защо Render

Git-push деплой, вграден managed HTTPS/domain — най-малката операционна повърхност от разгледаните опции, директно обслужва "solo/AI-assisted, по-малко магия" прецедента от ADR-006. Render Postgres съществува, но е подминат в полза на Neon (виж по-долу) — разделянето compute/DB на два фокусирани доставчика не е значителна допълнителна сложност (два dashboard-а, не платформена сложност) и пази по-издръжлив безплатен праг за DB на ранен етап.

### Защо Neon за Postgres

Щедър, траен безплатен tier (пряко обслужва "избягвай ненужни инфраструктурни разходи" от одита), database branching полезен за бъдещ CI/preview workflow (репото няма CI досега — Phase 4 от одита го добавя), стандартен Postgres connection string — нулева промяна за Hono/Better Auth/бъдещ ORM избор.

## Отхвърлени алтернативи

| Опция | Защо не |
|-------|---------|
| **SvelteKit** (само за API routes) | Обвързва lifecycle-а на чист JSON/webhook API с UI meta-framework избор; ADR-006 изрично отхвърли SvelteKit за самото SPA — приемането му тук само за бекенда пак внася routing/SSR машинария, която не носи полза за pure API service. |
| **Express** | По-стари ергономики, по-малко TS-first от Hono; няма реално предимство при този мащаб. |
| **Fastify** | Разумна, почти равностойна опция — приет като приемлив fallback, ако Hono покаже граница по-късно; Hono печели по runtime портативност без загуба на способност сега. |
| **Cloudflare Workers** (пълен edge backend) | Postgres достъп и Stripe webhook верификация са по-фрикционни в edge рънтайм днес; "скучен" Node процес е по-малко дебъг-магия за solo екип — същият принцип от ADR-006, приложен тук към нов избор. Преразглежда се, ако мулти-регион latency стане измерен, реален проблем — не е такъв сега. |
| **Fly.io** (hosting) | Реална, почти равностойна алтернатива на Render — по-нисш-ниво примитиви (volumes, regions, machines) купуват гъвкавост, която не е нужна при един регион/един процес сега. Естествена следваща спирка, ако Render операционно се окаже недостатъчен. |
| **Supabase** (цяла BaaS платформа) | Вече отхвърлено в SaaS Audit §D.2 — по-голям платформен commitment от фокусиран auth+DB избор; важи и тук по същата причина. |
| **Render Postgres** (вместо Neon) | Не е грешен избор — просто по-слаб безплатен праг за ранен етап и без branching; приемлив fallback, ако предпочитание за единствен vendor натежи по-късно. |

## Последици

- Ново, отделно repo/deploy target (working name: `areaflow-api`) — SPA-то (`src/ui`, вече статично host-нато) остава напълно недокоснато; `vite.config.ts`/ADR-006 не се пипат.
- Better Auth конфигурацията живее в новия backend, зад `/api/auth/*` — client SDK-то му се извиква само от нов `AuthAdapter` (UI/Application граница), никога от Core (21 §1 непроменено).
- 23_API.md §6 Cloud Sync endpoint-ите (`POST/GET /v1/projects/{projectId}/surfaces/{surfaceId}`) се имплементират буквално върху Hono routes — контрактът не се променя от този ADR, само получава конкретен носител.
- Stripe webhook handler изисква raw body достъп преди JSON parsing (подпис верификация) — middleware редът трябва да го уважава изрично при имплементация.
- CI (липсва изцяло днес) вече има естествен дом: нов workflow за новия repo/deploy target, отделен от SPA-то build/test/lint стъпките.
- `docs/INDEX.md` §6 се допълва с ред за "backend hosting/framework → ADR-007" — routing актуализация, не ново съдържание.

## Отворено за следваща задача

Конкретен ORM/query builder (Drizzle е естествен кандидат заради TS-first схема + добра Neon съвместимост, но не е фиксиран тук), CI provider детайли (GitHub Actions по подразбиране, не решено формално), точна миграционна стратегия за Better Auth схемата (следва неговия собствен CLI). Многорегионален deploy и Cloudflare Workers преразглеждане чакат реален latency сигнал — не се решават превантивно тук.
