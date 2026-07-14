# Application Layer Review

**Дата:** 2026-07-14
**Обхват:** CommandStack, Repository портове, 8-те задължителни Application commands (PO чеклист).
**Цел:** UI gate проверка — потвърждава дали Studio UI работата може да започне.

---

## UI Gate — статус

| Условие | Статус | Доказателство |
|---------|--------|----------------|
| CommandStack тестовете са зелени | ✅ PASSED | `commandStack.test.ts` — 10 теста (single/sequence/redo invalidation/bounded eviction/failed command/deterministic redo), всички зелени |
| Repository ports frozen | ✅ PASSED | 4 порта дефинирани (`ports/`), нула IndexedDB/filesystem/cloud/HTTP/framework типове в сигнатурите — виж §2 |
| Основните application commands дефинирани | ✅ PASSED | 8/8 от чеклиста + `shapeToParams` helper — виж §3 |
| Няма директна зависимост UI → domain engine за mutating операции | ✅ **VERIFIED EMPIRICALLY (2026-07-15)** — след като проверката ХВАНА реален дефект | Задължителната проверка при първия UI→Application integration commit се проведе с умишлен violation probe (application→ui импорт) и **първоначално правилото НЕ гръмна**: без TS-aware import resolver, NodeNext-стил `.js`-суфиксираните импорти между `.ts` файлове не се резолвираха и eslint-plugin-boundaries тихо ги игнорираше — правилото никога не бе работило реално, за нито един импорт. Поправено (eslint-import-resolver-typescript + `import/resolver` настройка); повторен probe: `error: File is of type 'application'. Dependency is of type 'ui'`, exit 1; легитимните посоки минават чисто. Скептицизмът на това gate условие ("configured ≠ verified") се оказа не формалност, а точната причина дефектът да бъде намерен |
| Кратък Application Layer Review | ✅ PASSED | Този документ |

**Заключение: Application-layer gate: PASSED.** Останалите четири условия са изпълнени безусловно. Петото (UI boundary enforcement) е конфигурирано, но статусът му е "configured, not verified" до първия реален UI импорт — Studio UI работата може да започне върху вече frozen командите и портовете по-долу, като първият commit, който добавя `src/ui/`, е моментът, в който това правило за пръв път реално ще бъде изпитано.

---

## §1. CommandStack — какво е доказано

`src/application/commandStack.ts` + `commandStack.test.ts` (10 теста) + `commands/roundtrip.test.ts` (12 теста) = **22 теста, покриващи целия чеклист на PO**: единична команда, поредица, split undo/redo, AI ghost commit undo/redo, redo invalidation при нова команда, bounded undo eviction, failed command без замърсяване на стека, validation error без промяна на state, deterministic redo.

**Bounded Undo (ADR-001 Условие B):** count-based (по подразбиране 200), FIFO евикция на най-старата команда при препълване, евикцията е тиха и никога не чупи обратимостта на задържаните команди — тествано изрично (`достигане на undo лимита`).

**Едно съзнателно отклонение от 23_API.md §3.2:** `undo(): void` там е скица; тук `undo(): T` връща възстановената стойност — правя round-trip тестовете от чеклиста директно проверими с domain equality. Формата на договора (хвърля при грешка, никога не пипа persistence директно, target-scoped) е непроменена. Документирано inline в `commandStack.ts`.

---

## §2. Repository ports — какво е frozen и защо

Проверени срещу Bible/11_INFORMATION_ARCHITECTURE за независим lifecycle, не механично създадени:

| Порт | Файл | Обосновка за независим lifecycle |
|------|------|-------------------------------------|
| `ProjectRepository` | `ports/projectRepository.ts` | Home Start/rename/archive/delete — собствен, ясен lifecycle; единствената операция без inverse (INV-9) |
| `SurfaceRepository` | `ports/surfaceRepository.ts` | **Добавен извън минималния списък на PO** — обоснован в 21 §5.1/§2.1: Surface е транзакционната граница (атомарно рекалибриране), различна от Project границата. Не механично създаден repo, а вече ревюирано архитектурно решение |
| `ReportRepository` | `ports/reportRepository.ts` | Append-only snapshot генериране (INV-11) — различна операционна форма от Project CRUD |
| `SettingsRepository` | `ports/settingsRepository.ts` | App-level настройки съществуват независимо от всеки Project; project-level override-и остават поле в Project entity, не отделен порт |

**Изрично НЕ създадени** (проверени и отхвърлени): `AssetRepository`/`ImportSourceRepository` — изходният файл е атрибут на Surface (blob през StorageAdapter), няма собствен lifecycle извън притежаващата го Surface (11 §7). `WorkspaceRepository`/`ExtensionRepository` — съществуват концептуално в 21 §5.1 за read-only каталози, но нито една от днешните 8 команди ги докосва — отложени, не изградени без нужда.

**Нула leak:** всяка сигнатура е `Promise<domain-type>` — проверено ръчно, нищо от IndexedDB/File System Access/HTTP/framework не се появява в нито един порт.

**Несъответствие, повдигнато, не потулено:** 19_IMPORT_EXPORT.md §4 казва Report е "част от ProjectRepository" — това описваше физическо съхранение (валидно и под ADR-004: една и съща IndexedDB база), не логическата порт граница, която тук е отделна. Предлагам малка редакция на 19 §4 за прецизност (виж финалния доклад).

---

## §3. Application commands — 8/8 + AI invariant

| # | Команда | Файл | Ключова гаранция |
|---|---------|------|---------------------|
| 1 | Create shape | `createMeasurement.ts` | единственият вход към `MeasurementDrawn` |
| 2 | Delete shape | `deleteMeasurement.ts` | parent→cascade / child→dissolve group (11 §4) |
| 3 | Move vertex | `editVertex.ts` | throws при self-intersection precondition |
| 4 | Insert vertex | `addVertex.ts` | — |
| 5 | Delete vertex | `removeVertex.ts` | Core `Result` → Application throw (уеднаквен CommandStack договор) |
| 6 | Split | `split.ts` | родителят никога не се пипа — само добавя 2 деца (PD-009) |
| 7 | Commit AI ghost | `commitGhost.ts` | **буквално delegate** към `createMeasurementCommand` — не поведенческа прилика, а един и същ код path |
| 8 | Calibration change | `recalibrate.ts` | атомарността на INV-3 идва безплатно от чистотата на Measurement Engine (нищо за каскадно обновяване) |

Нито един от 8-те съдържа геометрична формула — всички делегират на Core (`drawingEngine`, `split`, `calibrationService` са извикани отвън, не тук). Нито един не съдържа rendering или UI код.

---

## §4. Проверени инварианти (по искане на PO)

| Инвариант | Статус | Как е проверен |
|-----------|--------|-----------------|
| AI commit използва същия create path като ръчното чертане | ✅ | `commitGhost.ts` буквално вика `createMeasurementCommand`; тест доказва структурна идентичност на резултата + че self-intersecting ghost се отхвърля по същия начин като ръчен |
| Report остава immutable snapshot | ✅ (по дизайн) | `ReportRepository.save()` приема цял `Report` с fresh `ReportSnapshot`; портът няма partial-update метод — мутация не е изразима операция. Report generation command не е в днешния обхват (не е част от 8-те) |
| CalibrationService остава чист domain service | ✅ | `recalibrateCommand` не вика CalibrationService изобщо — приема вече конструирана `Calibration` стойност; CalibrationService (Core) остава недокоснат от Application слоя |
| Split остава допълнение, не замяна | ✅ | Тест: manually-drawn sibling измерение оцелява split+undo+redo непокътнато; родителят е byte-identical преди/след |
| Offline AI failure не чупи основен flow | ✅ (по дизайн, извън днешния обхват) | Проектирано в 20_AI_STRATEGY §7 (`AIContext.propose` graceful `[]` при `NetworkError`); `propose()`/AIContext оркестрацията не е част от 8-те команди днес — само `commitGhost` (приемане на вече предложен ghost) е в обхват |

---

## §5. Известни рискове / отворени точки

**Актуализация (2026-07-14, documentation-only checkpoint след PO review):**

1. ~~ESLint boundary правилото не е тествано срещу реално нарушение~~ — **резолвирано (2026-07-15), с реална находка.** Проверката при първия UI integration commit разкри, че правилото никога не бе работило (липсващ TS-aware резолвер → тихо игнорирани импорти). Поправено и емпирично потвърдено в двете посоки — виж UI Gate таблицата.
2. ~~`undo(): T` отклонението от 23 §3.2 не е формално ADR-записано~~ — **резолвирано.** Addendum добавен към [ADR-001](26_ADR/ADR-001-command-stack-undo.md#addendum-2026-07-14--undo-t-не-undo-void): отклонението е приет, формален contract, не временен TODO. Изрично очертана граница: `T` остава домейнов тип, никога UI-specific projection.
3. ~~19_IMPORT_EXPORT §4 формулировка подвежда спрямо ReportRepository port~~ — **резолвирано.** 19 §4 актуализиран: ownership (Report под Project, 14 §2.2) и port granularity (отделен `ReportRepository`) са изрично разграничени като два различни въпроса.
4. **AssetRepository решението разчита на StorageAdapter (23 §4), който все още не е имплементиран в код** — остава **проследен engineering risk, не блокер** (PO решение). Записан формално като [ISS-008](27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md), с explicit acceptance критерий за валидация при първата реална StorageAdapter имплементация.
5. **AI orchestration** (`propose()`, `AIContext`, offline деградация) — изрично **не** е разширение на този commit (PO решение). Записано като [ISS-009](27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md), маркирано DEFERRED за самостоятелен следващ Application-layer slice. `commitGhostCommand` (§3/§4 по-горе) остава достатъчен за доказване на write path инварианта днес.
