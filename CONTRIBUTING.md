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

## UI бележка

Планираната поредица (`feat(ui): bootstrap Canvas shell` → `Project workspace` → `integrate CommandStack` → `render Shape layer` → `measurement overlays`) е приета като **реда**, в който UI работата ще влиза в историята, когато започне. UI разработка не е стартирана към момента на този commit — виж `docs/APPLICATION_LAYER_REVIEW.md` (UI gate: application-layer условията PASSED, UI boundary enforcement CONFIGURED but not yet empirically verified).
