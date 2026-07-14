# Contributing — Git Conventions

**Статус:** Accepted (PO, 2026-07-15). Важи за целия проект от този момент нататък. Двата съществуващи commit-а (`e992d48`, `40f897c`) предхождат тази конвенция и не се пренаписват ретроактивно.

Тази конвенция е процесна (git hygiene) — "как" пишем история, не "какво" строим. Не живее в `docs/05_PRODUCT_DECISIONS.md` (продуктови решения) нито в `docs/26_ADR/` (архитектурни решения); този файл е неин единствен дом.

---

## Conventional Commits

Всеки commit message следва:

```
<type>(<scope>): <subject>

<optional body>

<optional footer>
```

## Commit Philosophy

Общият принцип, от който произтича всичко по-долу — "два коловоза" (§ следваща секция) е само неговото най-често срещано конкретно приложение:

> Each commit must represent exactly one logical change.
>
> A commit should be independently understandable.
>
> Avoid mixing:
> - documentation
> - refactoring
> - bug fixes
> - new features
>
> unless they are inseparable.
>
> A reader should understand the intent of the commit by reading:
> - commit title
> - commit body
> - changed files
>
> without requiring external context.

Тестът при съмнение: ако commit message-ът се нуждае от "и също" или "плюс", за да опише какво прави — това е сигнал за два commit-а, не един.

## Два коловоза в историята

Дисциплината, която прави историята четима: **документационните и имплементационните промени никога не се смесват в един commit.**

| Коловоз | Types | Пипа |
|---------|-------|------|
| **Документационен** | `docs`, `chore(docs)` | само `docs/**`, `CONTRIBUTING.md`, `README.md` |
| **Имплементационен** | `feat`, `fix`, `refactor`, `test`, `chore` | само `src/**`, config файлове (`package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`) |

Ако промяна пипа и двете — раздели я на два commit-а. Изключение: файл, преместен/преименуван като част от рефакторинг, си остава в имплементационния commit дори ако носи `.md` разширение (напр. код коментари, не product docs).

## Types

| Type | Употреба |
|------|----------|
| `feat` | Нова способност (Core engine функция, Application command, UI компонент) |
| `fix` | Поправка на бъг в съществуващ код |
| `refactor` | Преструктуриране без промяна на поведение |
| `test` | Добавяне/промяна на тестове, без production код промяна |
| `docs` | Продуктова/архитектурна документация (`docs/**`) |
| `chore` | Tooling, зависимости, CI, конфигурация — нито feature, нито doc |

## Scope

Съответства на архитектурните граници, вече наложени от `eslint.config.js` (`boundaries/element-types`, 21_ARCHITECTURE §3) — един scope на слой, за да остане git history и module graph четими едно през друго:

`core` · `application` · `adapters` · `ui` · `docs`

По-тесен scope е добре дошъл при нужда (`feat(application/commands)`, `fix(core/measurement)`), стига да остава под някой от петте.

## Примери

```
docs: synchronize architecture after application review

feat(application): add bounded command stack

feat(core): implement measurement entities

test(application): add round-trip undo tests

fix(core): correct interior angle calculation

refactor(application): extract calibration service

chore: update engineering documentation
```

## Documentation Synchronization

> Whenever a code change invalidates architectural or product documentation,
> documentation must be updated before the implementation checkpoint is considered complete.
>
> No silent documentation drift is allowed.

Не е ново правило за проекта — вече е практикувано (напр. 19_IMPORT_EXPORT §4 корекцията и ADR-001 addendum-ът от Application Layer Review checkpoint-а, 2026-07-14), тук само се формализира изрично. Прилага се и в двете посоки: код промяна, която прави документ невалиден (архитектурен или продуктов), блокира checkpoint-а/feature-а като "готово", докато документът не се синхронизира — в отделен `docs:` commit по правилото за два коловоза по-горе, не смесен в имплементационния.

## UI бележка

Планираната поредица (`feat(ui): bootstrap Canvas shell` → `Project workspace` → `integrate CommandStack` → `render Shape layer` → `measurement overlays`) е приета като **реда**, в който UI работата ще влиза в историята, когато започне. UI разработка не е стартирана към момента на този commit — виж `docs/APPLICATION_LAYER_REVIEW.md` (UI gate: application-layer условията PASSED, UI boundary enforcement CONFIGURED but not yet empirically verified).
