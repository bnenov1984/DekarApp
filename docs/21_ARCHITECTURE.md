# 21 — Architecture

**Статус:** Draft v1 за одобрение от PO
**Мандат:** Свързва bounded contexts/aggregates (14), engine спецификациите (17, 18) и UX слоевете (15 §1.1) в изпълнима системна структура. Разрешава двата въпроса, изрично оставени отворени в 14 §5/7 и 18 §7: **механизъм на Undo** и **как aggregate границите стават persistence граници**.
**Дисциплина:** Архитектура, не имплементация — избори тук са структурни (граници, посоки на зависимост, кой какво притежава), не библиотечни (кой конкретен framework — Phase 4).

---

## §1. Архитектурни принципи (изведени, не нови)

| Принцип | Произход | Архитектурна последица |
|---------|----------|--------------------------|
| Engines без бизнес логика (PD-002/003) | Bible | Drawing/Measurement Engine са **чисти, framework-agnostic модули** — нула зависимост от UI framework, DOM, или мрежа. Тестваеми напълно изолирано (17 §9, 18 §9). |
| Local-first → Backup → Sync (PD-012) | 05 | Локалното хранилище е **единствената задължителна** зависимост; cloud е adapter, включван опционално, никога на критичния път. |
| Web-first, една кодова база (PD-001) | Bible | Никакво platform-specific разклоняване в Core/Application слоевете (§2) — само UI adapter слоят познава PWA спецификата. |
| Undo обхваща всичко освен изтриване на проект (INV-12) | 14 | Command Pattern с explicit inverse (§4) — избран пред event sourcing, обосновка в §4.1. |
| Extension никога не пише данни (PD-014) | 14 §2.4 | Sandbox граница, наложена архитектурно, не по конвенция (§7). |
| Map/AI провайдъри носят известни рискове (PHASE_2_REVIEW §5) | 07, 17 §4 | Изолирани зад adapter интерфейси от ден 1 (§8). |
| i18n от първия commit, без промяна на кода за нов език (PD-010) | 05 | Runtime locale resolution, не compile-time вграждане (§10.1). |

---

## §2. Системни слоеве

Мапинг на 15 §1.1 (Shell/Studio/System) към изпълнима структура, добавяйки два слоя, невидими за UX спецификацията, но необходими архитектурно:

```
┌─────────────────────────────────────────────────────────┐
│  UI  (Shell · Studio · System — 15 §1.1)                │
│  Рендер, компоненти (16), потребителски input             │
├─────────────────────────────────────────────────────────┤
│  APPLICATION  (оркестрация, невидима за UX)               │
│  Command/Undo стек · Repositories · Sync engine ·           │
│  AI Context (20) — оркестрира AIProvider + CommandStack     │
├─────────────────────────────────────────────────────────┤
│  CORE  (чисти domain модули — 14, 17, 18, 19)              │
│  Drawing Engine · Measurement Engine · Calibration          │
│  Service (19 §3) · Domain типове                            │
├─────────────────────────────────────────────────────────┤
│  ADAPTERS  (граници към външния свят)                     │
│  MapProvider · AIProvider · Extension Sandbox · Storage    │
└─────────────────────────────────────────────────────────┘
```

**Посока на зависимост: само надолу.** UI зависи от Application зависи от Core. Adapters **имплементират** интерфейси, дефинирани от Core/Application (dependency inversion) — Core никога не импортира adapter код директно. Това е механизмът, който прави 17 §9/18 §9 тестовите изисквания ("directly unit-testable без mock-ове") изпълними: Core няма какво да mock-ва, защото няма external зависимости.

---

## §3. Module / Dependency Graph

```
                         ┌──────────┐
                         │    UI    │
                         └────┬─────┘
                              │ извиква
                    ┌─────────▼─────────┐
                    │   APPLICATION      │
                    │ ┌───────────────┐  │
                    │ │ CommandStack   │  │◀── §4
                    │ ├───────────────┤  │
                    │ │ Repositories   │──┼──▶ StorageAdapter (§5)
                    │ │ (per aggregate)│  │
                    │ ├───────────────┤  │
                    │ │ SyncEngine     │──┼──▶ CloudAdapter (§5.3, опционален)
                    │ ├───────────────┤  │
                    │ │ AIContext (20) │──┼──▶ AIProvider (§8.2)
                    │ └───────┬───────┘  │
                    └─────────┼──────────┘
                              │ използва (само типове/функции, без обратна зависимост)
                    ┌─────────▼──────────┐
                    │       CORE          │
                    │ DrawingEngine (18)  │
                    │ MeasurementEngine(17)│
                    │ CalibrationService(19)│
                    │ Domain types (14)   │
                    └─────────┬───────────┘
                              │ Core дефинира интерфейси, adapters ги имплементират
                    ┌─────────▼──────────┐
                    │      ADAPTERS       │
                    │ MapProvider (§8.1)  │
                    │ AIProvider  (§8.2)  │
                    │ ExtensionSandbox(§7)│
                    └──────────────────────┘
```

**Правило за преглед на код:** import на UI символ (компонент, DOM тип) в Core или Application модул е автоматично провален architectural review — не стилистично предпочитание, а тестваемостта на 17/18 зависи от него.

---

## §4. Undo/Redo архитектура

**Решение: Command Stack (не event sourcing).**

### 4.1. Обосновка

Три причини, всяка достатъчна сама по себе си:

1. **Undo е сесийно, не трайно** (11 §7: "Undo историята — сесийна, затваряне на проекта я нулира"). Event sourcing печели там, където историята трябва да преживее сесията (одит, time-travel през дни/месеци) — тук изрично не се изисква.
2. **Shape/Calibration са VO, заменяни изцяло, не мутирани** (14 §3). Inverse на "замени VO с нов" е тривиално: пази старата стойност. Не е нужен event log, за да се възстанови предишно състояние — старото състояние вече е буквално в паметта на командата.
3. **Няма колаборация в v1** (PD-012, изрично). Event sourcing/CRDT си заслужават сложността най-вече при multi-user конкурентна редакция — отсъстващ проблем тук. Ако P-04/колаборация влезе в обхват по-късно, това е момент за преразглеждане на §4, не сега.

### 4.2. Модел

```
Command {
  do():      извиква Core операция (напр. DrawingEngine.editVertex), връща нов Shape VO
  undo():    връща предходния Shape VO (пазен вътре в командата при create)
  target:    Surface ID (кой aggregate засяга)
}

CommandStack (per Project session):
  past:   Command[]   // за Undo
  future: Command[]   // за Redo, изчиства се при нова команда след undo
```

**Обхват: глобален command stack per Project session**, не per Surface — undo връща последното действие на потребителя независимо на коя Surface tab е било извършено (най-малко изненадващото поведение: "отмени последното нещо, което направих", не "последното нещо на този таб"). Всяка команда носи `target` (Surface ID), за да могат Repositories (§5) да приложат промяната към правилния aggregate.

**Изтриване на проект** (INV-9) не влиза в стека — единствената команда без `undo()`, архитектурно наложено чрез липсващ метод, не runtime проверка.

### 4.3. Граница с Application слоя

Core (Drawing/Measurement Engine) **не знае за CommandStack** — той е чист функционален слой (§1). CommandStack е Application-level concept, който обвива Core извиквания и пази резултата. Това пази 18 §7 обещанието буквално: "Drawing Engine само гарантира, че операцията е логически обратима; кой механизъм я обръща е архитектурен избор" — сега отговорено: Application слоят.

### 4.4. Bounded Undo — архитектурен constraint (PD-018 Условие B)

**Constraint (задължителен): Undo стекът е ограничен.** Горна граница по брой операции ИЛИ паметен бюджет — Engineering избира механизма и стойностите (имплементацията е свободна, ограничението не е). При достигане на границата най-старите команди се евиктват първи; евикцията никога не нарушава INV-12 за задържаните команди (всичко в стека остава пълноценно обратимо) и е тиха за потребителя. **Обосновка:** freehand фигури с хиляди точки × дълга сесия → неограничен паметен растеж (PHASE_3_REVIEW §5); продуктовото обещание "Undo покрива всичко" (US-015) означава "в рамките на разумната работна сесия", не "неограничено назад" — сесийната природа на историята (11 §7) вече поставя по-силната граница. Пълен запис: [26_ADR/ADR-001](26_ADR/ADR-001-command-stack-undo.md).

---

## §5. Persistence архитектура

### 5.1. Repository по aggregate (директно от 14 §2)

```
ProjectRepository    — CRUD на Project (плитък: settings, workspace reference, surface ID list, report configs)
SurfaceRepository    — CRUD на Surface aggregate (calibration + layers + measurements + shapes, цялото дърво)
WorkspaceRepository  — read-only достъп до App-level каталога (12)
ExtensionRepository  — read-only достъп до инсталирани модули (App-level каталог)
```

Едно repository на aggregate root — **не** едно repository на всеки entity (Layer/Measurement нямат собствен repository; те се зареждат/пазят като част от Surface aggregate транзакцията, точно защото Surface е консистентностната граница, 14 §2.1). Това прави INV-3 (атомарно преизчисляване при рекалибриране) естествено изпълнимо: `SurfaceRepository.save()` записва цялото дърво в една транзакция.

### 5.2. Локално хранилище (задължителен слой, PD-012 стъпало 1)

**IndexedDB** за структурирани данни (Project/Surface/Measurement дървото — вложени, заявими, transactional) + **blob storage** (също IndexedDB или File System Access API, зависи от Phase 4 избор) за изходните файлове на Image/PDF surfaces (11 §7: "проектът е самодостатъчен"). Причина за IndexedDB пред localStorage/файлове: structured clone на вложени обекти, transactional writes (нужни за §5.1 атомарността), достатъчен капацитет за PDF/изображения.

**Работи изцяло offline** — нито един UI поток (F1–F7, 15 §5) минава транзакционно през мрежата; мрежата е само за §5.3.

### 5.3. Cloud Backup / Sync (PD-012 стъпала 2–3, опционални)

```
SyncEngine (Application layer)
  observes: локални промени по aggregate (Surface saved, Project saved)
  when online AND потребителят е включил Backup/Sync:
    push промяната към CloudAdapter
  conflict policy: last-write-wins per Surface aggregate
```

**Защо last-write-wins е достатъчно:** PD-012 изрично изключва колаборативно редактиране в v1 — конфликт означава "същият потребител е редактирал една Surface от две устройства почти едновременно", рядък случай без реален concurrent-editing риск. По-сложна conflict resolution (CRDT, operational transform) би решавала проблем, който не съществува в текущия обхват — премиерна сложност точно от типа, който Guardrail 3 забранява.

**Backup и Sync са отделни превключватели** (PD-012 буквално): Backup е еднопосочен upload (застраховка); Sync добавя download+merge при отваряне на друго устройство. И двата минават през същия `CloudAdapter` интерфейс — Application слоят не знае конкретния cloud доставчик.

---

## §6. Rendering архитектура

**Избор: Canvas2D за платното, с успореден DOM за accessibility (не Canvas-only, не pure-SVG).**

### 6.1. Обосновка

| Опция | Защо не самостоятелно |
|-------|------------------------|
| Pure SVG (DOM елемент на фигура) | Естествена a11y, но деградира при freehand с хиляди точки и чести live преизчисления (15 §14.2 live computation при всяко движение на курсора) — Performance First risk при professional workflows (Epic B/E, 12+ покривни равнини) |
| Pure Canvas2D | Отличен performance, но нулева native a11y — hit-testing и focus управление трябва да се пишат ръчно и без успореден DOM, screen reader няма какво да обходи |
| WebGL | Overkill за 2D векторна геометрия в v1 обхват (PD-011); резервирано за бъдещо (голям растер/point cloud обработка, не в scope) |

**Решението вече е предрешено от 15 §12/16 §3.2 (D8):** Measurement List е дефиниран като "пълна алтернатива на платното" за a11y — тоест **успореден DOM списък вече трябва да съществува независимо от рендер технологията**. Това премахва основния аргумент за pure SVG (native a11y), защото a11y пътят минава през списъка, не през платното. С това решено, Canvas2D печели по performance за professional use cases.

### 6.2. Слоева композиция на платното

```
Canvas (layered):
  ├── Raster layer   — фон: снимка/PDF render/map tiles (рядко се променя, скъпо за прерисуване)
  └── Vector layer   — Shape overlay: измервания, snap маркери, ghost, selection handles
                        (често се променя — всеки vertex drag), рисуван отделно от raster
```

Разделянето на два слоя избягва скъпо прерисуване на растерния фон при всяко влачене на връх (директна Performance First последица).

### 6.3. Data flow: Shape → рендер, никога обратно

```
Core Shape VO (18 §2) ──▶ Scene graph (Application/UI граница) ──▶ Canvas draw calls
                                    │
                                    └──▶ Hit-testing (custom, за click/selection)
                                    └──▶ DOM Measurement List (a11y път, 15 §12)
```

Сцената (scene graph) е **производна** проекция на Shape VO-та — рендерът никога не притежава геометрията, само я визуализира (същия еднопосочен принцип като 14 §1 context map, приложен и към UI границата).

---

## §7. Extension Sandbox — архитектурно наложен PD-014

PermissionTag (15 §20) декларира договора ("Reads: area, perimeter") — но декларация без техническа граница е само UI обещание. Архитектурата налага го реално:

```
Extension изпълнение:
  среда:    изолиран контекст (Web Worker — без DOM достъп, без директен достъп до Repositories)
  вход:     read-only serialized snapshot на MeasurementValues (17 §2) на текущата селекция
  изход:    само display данни (числа/текст) през postMessage
  забранено структурно (не по конвенция): достъп до Shape, до Repository API, до други Measurements извън подадената селекция
```

**Защо сега, при v1 first-party extensions (PD-011):** retrofit на sandbox граница след като P-04 (SDK за трети страни) се отвори би засегнало всеки съществуващ extension. Изграждането ѝ сега, докато extensions са малко и first-party, е евтина застраховка — и прави PD-014 инвариант ("extension никога не пише данни") технически невъзможен за нарушение, не просто спазван по договор.

---

## §8. Външни граници (провайдър адаптери)

И двете следват идентичен модел: Core/Application дефинира тесен интерфейс; конкретен доставчик е замeним adapter.

### 8.1. MapProvider

```
MapProvider {
  search(query) → locations[]
  getTile(coordinates, zoom) → imagery
  // Drawing/Measurement Engine никога не викат Google Maps SDK директно
}
```

**Обосновка (PHASE_2_REVIEW риск):** Google Maps ToS/цена/offline ограниченията са реален риск. Изолацията зад `MapProvider` прави бъдещо добавяне на OpenStreetMap (Bible: "future") адаптерна промяна, не рефакторинг на Drawing/Measurement Engine — и двата engine-а вече работят само с абстрактни Surface координати (18 §3), нямат представа кой доставчик стои зад Map surface.

### 8.2. AIProvider

```
AIProvider {
  detectBoundary(surfaceRegion) → GhostCandidate[]  // shape + confidence, 14 §5 GhostProposed
}
```

**On-device срещу cloud inference не се решава тук** — изрично Pending (P-05 offline матрица). Архитектурната гаранция е, че смяната на имплементация (WASM модел на клиента срещу REST извикване) не пипа Drawing Engine (18 §8: приема Ghost.shape през същия интерфейс като ръчно чертане) нито AI Context логиката отвъд `AIProvider` границата.

---

## §9. PWA / Offline архитектура

- **Service Worker**: кешира приложната обвивка (UI код, шрифтове, икони) за instant load (Performance First бюджет, 15 §17: <3 сек до интерактивно платно).
- **Данните не минават през Service Worker кеш** — те са в IndexedDB (§5.2), отделен механизъм с ясна собственост.
- **Map tiles**: временен кеш само (11 §7 — не се персистират трайно, ToS ограничение), управляван от `MapProvider` adapter, не от общия Service Worker кеш на приложението.
- Всеки UI flow (F1–F7) трябва да е тестван с изключена мрежа **след** първо зареждане — офлайн не е edge case, а очаквано състояние (PD-012 стъпало 1).

---

## §10. Cross-cutting архитектура

### 10.1. i18n (PD-010)

UI компоненти не съдържат литерален текст — резолват ключове през locale slice, зареден **runtime** (не compile-time вграден per-locale build), точно защото PD-010 изисква "нов език без промяна в кода": добавянето на locale файл е достатъчно, не redeploy.

### 10.2. Accessibility hook

Успоредният DOM (§6.1) не е UI детайл, а архитектурен компонент: Measurement List репрезентацията се генерира от същия Shape/Measurement VO поток, който захранва Canvas рендера (§6.3) — едно source of truth, две проекции, гарантирано синхронизирани (не два отделни модела, които могат да се разминат).

---

## §11. Testability мост към 22_TDD

| Слой | Тестова стратегия |
|------|---------------------|
| Core (Drawing/Measurement) | Чист unit test, без mock-ове (17 §9, 18 §9) — вече архитектурно гарантирано от §1/§3 |
| Application (Command stack, Repositories) | Integration тестове с in-memory Storage adapter implementация (fake, не mock на реалната IndexedDB) |
| Adapters (Map/AI/Extension sandbox) | Contract тестове — всеки adapter implementация (реална или fake) трябва да минава един и същ тестов contract |
| UI | Тества се срещу Application interface, никога срещу Core директно — пази UI теста стабилен дори при рефакторинг вътре в Core |

---

## §12. Проверка срещу 14/17/18/05

| Решение тук | Произход |
|-------------|----------|
| Command Stack, не event sourcing | 14 §5 (отложено там), обосновка §4.1 |
| Repository per aggregate root, не per entity | 14 §2 (Surface e aggregate root) |
| Last-write-wins sync | PD-012 (без колаборация в v1) |
| Canvas2D + успореден DOM, не pure SVG/Canvas | 15 §12/16 §3.2 D8 (Measurement List вече е a11y пътят) |
| MapProvider/AIProvider абстракции | PHASE_2_REVIEW §5 рискове; 17 §4 гео риск |
| Extension Web Worker sandbox | PD-014, 15 §20 PermissionTag |
| Core няма UI/adapter зависимости | PD-002/003, 17 §9/18 §9 testability изисквания |

**Отворено за 22_TDD, не за този документ:** конкретни test doubles/fixtures; за Phase 4: избор на UI framework, конкретна cloud услуга зад CloudAdapter, WASM срещу REST зад AIProvider (чака P-05).
