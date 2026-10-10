# 14 — Domain Model

**Статус:** Draft v1 за одобрение от PO
**Обхват:** Превод на [11_INFORMATION_ARCHITECTURE.md](11_INFORMATION_ARCHITECTURE.md) в domain-моделен речник: bounded contexts, aggregates, entities, value objects, инварианти, domain events. **Нула нови продуктови концепции** — всяко понятие тук вече съществува в 11; тук получава точност (граници на консистентност, идентичност срещу стойност), нужна за 17–23.
**Метод:** DDD-lite — достатъчно строгост, за да пише TDD (22) тестове срещу инварианти, без тежест, несъразмерна на single-user local-first продукт (PD-012).

---

## §1. Bounded Contexts

Всеки context се съди по Bible engine-а, който ще го имплементира (17–20), плюс два cross-cutting context-а без собствен engine документ.

| Context | Отговорност | Engine (Phase 3) | Downstream от |
|---------|-------------|-------------------|----------------|
| **Drawing** | Мутация на геометрия: create, vertex edit, snap, split | 18_DRAWING_ENGINE | — (upstream, никого не чете) |
| **Measurement** | Чисто изчисление: (Shape, Calibration) → стойности | 17_MEASUREMENT_ENGINE | Drawing (чете Shape, никога не пише) |
| **Import/Export** | Surface ingestion; Report генериране | 19_IMPORT_EXPORT | Measurement (чете стойности за отчет) |
| **AI** | Ghost lifecycle: proposal → commit/reject | 20_AI_STRATEGY | Drawing (произвежда Shape кандидат) |
| **Workspace** | Конфигурационен каталог (12 §2 слотове) | cross-cutting → 21_ARCHITECTURE | — (чист provider, никой context не му пише) |
| **Extension** | Derived изчисления върху селекция | cross-cutting → 21_ARCHITECTURE | Measurement (чете стойности, само за четене) |

**Context map, с думи:** Drawing е единственият, който пише геометрия. Measurement е чист функция отгоре му. Всичко останало (Import/Export, AI, Extension) е низходящ консуматор — тази еднопосочност е буквалният domain еквивалент на IA §3 инварианта "всички стрелки към данните сочат навън от ядрото". Workspace не е в тази верига изобщо: той не носи данни, той конфигурира как другите се показват/именуват (Open-Host-Service — контекст, който другите *питат*, не context, който произвежда събития).

---

## §2. Aggregates

Граница на консистентност ≠ граница на притежание (owndership от IA §2 е lifecycle/cascade-delete; aggregate boundary тук е *транзакционна* граница — кое се променя заедно, атомарно). Двете съвпадат почти навсякъде, с едно съзнателно разминаване, отбелязано по-долу.

### 2.1. Surface (Aggregate Root)

```
Surface (root)
├── Calibration          — 0..1, VO, заменяем изцяло (не се "редактира на части")
└── Layer* (entity)
     └── Measurement* (entity)
          └── Shape       — VO, заменяем изцяло при всяка геометрична промяна
```

**Защо Surface, не Project, е границата.** Инвариант IA §3 — "смяна на Calibration → преизчисляване на всички Measurements на Surface-а" — трябва да е атомарно: няма валидно междинно състояние с нова калибрация и стари стойности. Project не участва в тази транзакция изобщо (друга Surface на същия проект не мърда). Затова Surface, не Project, е aggregate root-ът, който гарантира този инвариант.

**Инварианти на Surface:**
- Всеки Shape принадлежи на точно едно Measurement, което принадлежи на точно един Layer, който принадлежи на тази Surface (без cross-surface референции).
- Промяна на Calibration е атомарна спрямо всички Measurement стойности на Surface-а — нула частично преизчислени състояния.
- Split (PD-009): в рамките на една Surface транзакция, `Σ(children.area) == parent.area` се проверява при commit; операцията е all-or-nothing.

### 2.2. Project (Aggregate Root — плитък)

```
Project (root)
├── ProjectSettings          — VO (override-и + Workspace reference по ID)
├── Surface* (референция по ID — отделен aggregate, не embedded transaction)
└── Report* (entity)
```

**Съзнателно разминаване с ownership от IA §2:** Project *притежава* Surfaces в жизнен цикъл (изтрий Project → изтриват се Surfaces — cascade delete), но Surfaces **не са част от Project транзакцията** — редакция на една Surface не отваря/заключва целия Project. Причината е практическа: чертане в реално време (F1) не бива да съперничи транзакционно с нищо друго в проекта. Проекцията "Project владее списък от Surface ID-та" е достатъчна за IA §2 дървото; изпълнението на cascade delete е orchestration (изтрий всяка Surface aggregate поотделно), не единична голяма транзакция.

**Инварианти на Project:**
- `ProjectSettings.workspaceRef` винаги сочи съществуващ Workspace в каталога (fallback: General, ако referenced workspace изчезне — не блокира отваряне на проекта).
- Изтриване на Project е единствената операция без undo (IA §4, D7) — domain-но: единствената команда без inverse.
- **`ownerId`** (Phase 3, 26_ADR/ADR-007) — `undefined` за всеки Project, който никога не е бил запазен в акаунт (PD-012: local-first, акаунт не се изисква); зададен веднъж, само от сървъра, при първия успешен `PUT /v1/projects/{id}` (23 §6) — никоя локална команда не го задава. Смяна на собственик не съществува като операция.

### 2.3. Workspace (Aggregate Root, отделен bounded context — App-level каталог)

Плитък: идентичност + 7-те конфигурационни слота (12 §2). Референциран, никога embedded в Project. Няма собствени инварианти отвъд "всеки слот има валиден default за непознат workspace" (graceful degradation).

### 2.4. Extension (не е aggregate — Domain Service)

Extension **няма персистентно състояние в рамките на Project** (IA §3: „резултатите му са производни и не се съхраняват"). Моделира се като **stateless Domain Service**: вход = стойности на селектирано Measurement (read-only snapshot), изход = derived изчисление, показано, никога записано. Самата инсталация (кой Extension е наличен) е App-level каталожен запис — отделен, тривиален aggregate, извън Project изцяло.

### 2.5. Ghost (не е aggregate — Session-scoped Value)

Ghost не участва в persistence модела изобщо (IA §8: „никога"). Domain-но е **временна стойност в Drawing Session**-а (in-memory, extends нито един aggregate). При commit, Ghost.shape се "ражда" като нормален Shape в целевия Surface aggregate чрез същата операция, която ражда ръчно начертан Measurement — commit е *превод*, не мутация на Ghost.

---

## §3. Entities срещу Value Objects

Правилото: **entity, ако има идентичност, която оцелява промяна на съдържанието му; value object, ако е изцяло определен от съдържанието си и се заменя, не се редактира на място.**

| Име | Вид | Обосновка |
|-----|-----|-----------|
| Project | Entity | ID оцелява всяка промяна на име/съдържание |
| Surface | Entity | ID оцелява рекалибриране, import на нов файл не сменя ID |
| Layer | Entity | ID оцелява преименуване/пренареждане |
| Measurement | Entity | ID оцелява vertex editing, преименуване, split |
| Report | Entity | ID оцелява смяна на template/подбор |
| Workspace | Entity | ID е референтен ключ от Project |
| **Calibration** | Value Object | Няма собствена идентичност отделно от "текущата истина на тази Surface"; рекалибриране = замяна с нов VO, не редакция |
| **Shape** | Value Object | Vertex edit заменя цялата геометрия като нова стойност (не мутация точка-по-точка на persisted обект) — това прави undo (US-015) естествен: пази се предишната стойност, не diff |
| **MeasurementValues** (area, perimeter, ъгли…) | Value Object | Чисто производни от (Shape, Calibration); никога independent state |
| **Identity** (име, цвят, бележка) | Value Object, вграден в Measurement | Заменяем изцяло при inline редакция |
| **Provenance** | Value Object, immutable след създаване | `Manual \| AIGenerated`; зададен веднъж при създаване на Measurement, никога не се редактира — това е одитируемостта (PD-013) буквално: полето не притежава setter след construction |
| **Unit** | Value Object | m, m², ft²… — чист low-level тип |
| **SplitGroup** (parent ID + children IDs) | Value Object | Носи само груповата гаранция; не е самостоятелен персистентен обект отделно от Measurement записите, които участва |
| **Ghost** | Value Object (session-only) | Виж §2.5 — никога persisted, така че identity е ирелевантна |

**Забележка за Shape-като-VO:** това е моделно решение с пряка последица за 22 (TDD): тестовете за vertex editing/undo не бива да очакват "мутация на съществуващ обект", а "замяна на Shape стойността, старата пазена в командния стек". Ако Phase 3 архитектурата предпочете mutable Shape заради performance (голям freehand path), заменянето остава семантичното намерение — имплементационен detail за 21, не промяна на domain модела.

---

## §4. Ключови инварианти (речник за TDD, 22)

Номерирани за директно цитиране в бъдещи test suite-ове.

| # | Инвариант | Произход |
|---|-----------|----------|
| INV-1 | Всеки Shape принадлежи на точно едно Measurement; Measurement без Shape не съществува | IA §1.3 |
| INV-2 | MeasurementValues са чиста функция на `(Shape, Surface.Calibration)` — никога независимо зададени | IA §1.3, §3 |
| INV-3 | Рекалибриране на Surface преизчислява **всички** Measurements на тази Surface атомарно | IA §3, §4 |
| INV-4 | При Split (PD-009): `Σ(children.MeasurementValues.area) == parent.MeasurementValues.area` към момента на commit | PD-009, 11 §3 |
| INV-5 | Ghost никога не се появява в persisted store, в суми, или в Report | IA §8, PD-013 |
| INV-6 | Provenance е immutable след създаване на Measurement | PD-013, IA §8 |
| INV-7 | Extension изчисления никога не се персистират в Measurement или Project | IA §3, PD-014 |
| INV-8 | Изтриване на Surface каскадно изтрива Layers→Measurements→Shapes; изтриване на Project каскадно изтрива всичко под него | IA §4 |
| INV-9 | Изтриване на Project е единствената команда без inverse (без undo) | IA §4, D7 |
| INV-10 | Workspace/Extension update или премахване от каталога никога не мутира съществуващи Project данни | PD-014, IA §3 |
| INV-11 | Report съдържание е снимка към момента на генериране — последваща редакция на Measurement не променя вече генериран Report артефакт | PD-015, IA §7 |
| INV-12 | Всяка команда, различна от изтриване на Project, има inverse (undo) | US-015, IA §4 |
| INV-13 | Заключен (`locked`) Measurement отказва преместване/resize/vertex-edit/изтриване/Split — проверява се на Application ниво, от самите команди, не само от UI слоя | entities.ts (PO request — retroactively документирано, без подадена формална PD) |
| INV-14 | При Split-into-parts (N-way, PO request): `Σ(children.MeasurementValues.area) == parent.MeasurementValues.area` към момента на commit — същия договор като INV-4, приложен към N деца вместо 2 | entities.ts, splitParts.ts (PO request — retroactively документирано, без подадена формална PD) |
| INV-15 | `manualArea`, когато е зададена, е area-per-px² фактор, изведен веднъж от текущата геометрична площ към момента на задаване — последващи геометрични редакции преизчисляват показаната площ пропорционално вместо да "остарява". **За Split група (PD-021):** децата на Split/Split-into-parts на измерване със зададена `manualArea` делят *запазен* общ сбор — сумата на показаните им площи винаги е равна на показаната площ на родителя; редакция на геометрията на кой да е член преразпределя площта между членовете (`application/splitGroup.ts`), вместо всеки да дрейфа независимо. Групата не е самостоятелно съхранено състояние: тя е производна от съществуващия `parentId` + оцеляващия родител (PD-009). В момента на самия Split двете правила съвпадат точно — запазването е обобщение на наследяването, не замяна | entities.ts + PD-021 (2026-09-15) |
| INV-16 | Скрит (`identity.hidden`) Measurement не се чертае и не е hit-testable на платното, но остава напълно избираем/преименуваем/изтриваем от Layers списъка и продължава да участва в Σ Total на площта | entities.ts (PO follow-up, "UX review item A5" — не съществува като документ в `docs/`; retroactively документирано, без подадена формална PD) |
| INV-17 | `vertexLabels` остават index-aligned със своя връх през addVertex/removeVertex — вмъкване/премахване на връх измества съответно етикетите нагоре/надолу, премахнат връх губи своя етикет | entities.ts, vertexLabels.ts (PO request — retroactively документирано, без подадена формална PD) |
| INV-18 | `Surface.imageLocked` (undefined/true = заключено, безопасен default) блокира преместване/resize на фоновото изображение, докато не бъде изрично отключено | entities.ts (PO request — retroactively документирано, без подадена формална PD) |
| INV-19 | Vertex редакция (местене/добавяне/изтриване) се прилага атомарно, в една команда, към всички **точно** съвпадащи върхове на Shapes в същата Surface, които не са предшественик/наследник на редактирания; заключен участник (INV-13) блокира цялата операция; невалиден резултат в който и да е участник я отхвърля изцяло. Свързаността е изведена от координатите при редакция — не се съхранява, INV-1 остава в сила | PD-024 (2026-10-10), 18 §6.1 |

**Актуализация (2026-09-15):** за INV-15 отвореният по-долу въпрос е **затворен** — hands-on тестване показа, че буквалното наследяване на фактора не отговаря на продуктовото очакване след редакция на дете, и решението е записано като **PD-021** (запазена сума в Split група). Останалите пет (INV-13, 14, 16, 17, 18) остават както са описани по-долу.

**Забележка за INV-13…INV-18 (документационен дълг):** тези шест инварианта вече са имплементирани и тествани (виж 22 §3), но влязоха в кода без предхождаща `docs:` промяна — нарушение на `CONTRIBUTING.md`'s Documentation Synchronization правило, коригирано тук ретроактивно. Произходният им "Произход" колона цитира `entities.ts`, не формален PD/ADR/US, защото такъв не е подаван; кодовите коментари цитират несъществуващ в `docs/` "UX review" документ с номерирани точки (A5, A13, B2…) — самите тези точки не са проследими извън кода. Дали някои от тези шест представляват нова продуктова способност, изискваща собствена PD (PD-019 границата), е отворен въпрос за PO, не решен едностранно тук.

---

## §5. Domain Events

Речникът, върху който Phase 3 архитектурата (21) ще реши механизма на Undo (event-sourced команден стек срещу inverse-command стек — **това е архитектурно решение, не domain-модел решение**, затова не се фиксира тук). Събитията описват *какво семантично се е случило*, независимо от избрания механизъм.

```
SurfaceImported          (Project, source: Image|PDFPage|Map)
SurfaceCalibrated        (Surface, Calibration)              — покрива и рекалибриране
MeasurementDrawn         (Surface, Layer, Shape, Provenance=Manual)
MeasurementShapeEdited   (Measurement, newShape)              — vertex editing
MeasurementSplit         (parentMeasurement → childMeasurement[], SplitGroup)
MeasurementIdentityChanged (Measurement, newIdentity)          — име/цвят/бележка
MeasurementDeleted       (Measurement)                        — родител: разтваря SplitGroup (§4 IA)
GhostProposed            (Surface, candidateShape, confidence) — session-only, не се записва траен log
GhostCommitted            → произвежда MeasurementDrawn(Provenance=AIGenerated)
GhostRejected             (session-only, IA §8: „никаква следа" — не се логва траен domain event)
ReportGenerated           (Project, ReportSnapshot)
ProjectArchived / ProjectRestored
ProjectDeleted             — терминално, без inverse (INV-9)
```

**Забележка:** `GhostProposed`/`GhostRejected` са включени за пълнота на речника (AI Context се нуждае от вокабуляр), но INV-5 забранява персистирането им — ако 21/22 решат да имплементират event-sourcing, тези две събития живеят само в session паметта, никога в event store-а, който захранва Undo/Redo след затваряне на проекта.

---

## §6. Ubiquitous Language — бърз речник

За избягване на терминологичен дрифт между документи/код:

| Термин | Значение (единствено вярното) | Не се бърка с |
|--------|-------------------------------|----------------|
| **Measurement** | Domain entity: геометрия + изчислени стойности + идентичност + произход | „резултат" (UI дума, 15 говори за chip/стойност — same entity, различна проекция) |
| **Shape** | Value object: чиста геометрия, без стойности | „фигура" (UI дума за same VO) |
| **Calibration** | Value object: мащабната истина на Surface | „scale" (UI име на статус елемента ScaleChip, 15 §3.1 — same VO) |
| **Surface** | Aggregate root: Image \| PDF Page \| Map | „платно"/"canvas" (UI/рендер термин, 15 — различен слой: canvas е *как* се вижда Surface, не самата тя) |
| **Provenance** | Value object: `Manual | AIGenerated`, immutable | „badge" (UI представяне на same VO) |
| **SplitGroup** | Value object: parent-children връзка с Σ гаранция | „подялба" (продуктова дума за операцията, PD-009) |
| **Ghost** | Session-only VO: неперсистиран Shape кандидат | „предложение" (UI дума, 15 §18) |
| **Report** | Entity: конфигурация + last-export маркер | „отчет"/"export" (UI/продуктова дума) |

---

## §7. Проверка срещу 11 и замразените решения

| Твърдение тук | Произход | Не противоречи на |
|----------------|----------|--------------------|
| Surface е aggregate root, не Project | IA §3 (calibration инвариант) | Не пипа ownership дървото на IA §2 — само добавя транзакционна граница отгоре му |
| Shape и Calibration са VO, заменяеми изцяло | IA §1.3, D2 | PD-002/003 (engines без бизнес логика) — VO моделът пази изчисленията чисти функции |
| Extension е Domain Service, не aggregate | IA §3, §7 | PD-014 (Extension не притежава данни) |
| Provenance е immutable VO | IA §8 | PD-013 (одитируемост) |
| Undo механизмът не се фиксира тук | — | Явно делегирано на 21_ARCHITECTURE, за да не заключи domain модела в конкретна имплементация преждевременно |

**Отворено за Phase 3 архитектурата (21), не за този документ:** event-sourcing срещу command-stack за Undo; как се сериализира Shape VO ефективно за freehand path с хиляди точки; дали Surface aggregate се държи изцяло в паметта или частично зарежда Layers при голям проект.
