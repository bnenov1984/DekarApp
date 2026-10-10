# 22 — TDD / Test Strategy

**Статус:** Draft v1 за одобрение от PO
**Мандат:** Формализира тестовата таксономия, скицирана в 21 §11, и превръща инвариантите от 14 §4 в конкретен, traceable тестов договор. Дефинира и дисциплината за Phase 4 (истинско test-first TDD), не само "какви тестове съществуват".
**Принцип:** **Инвариантите са спецификацията.** Всеки INV-# (14 §4) има точно един ред в §3 тук — ако инвариант няма тест, той не е гарантиран, колкото и убедително да звучи в прозата на 14/17/18.

---

## §1. Тестова философия

- **Core е доказуем, не просто тестван.** Drawing/Measurement Engine (17, 18) са чисти функции без external зависимости (21 §1) — за тях "не мога да го тествам изолирано" никога не е валидно извинение. Ако се появи такова извинение, архитектурната граница (21 §3) е нарушена някъде, не тестовата стратегия е недостатъчна.
- **Пирамида, не престъпление на пропорцията:** много unit тестове на Core (евтини, бързи, точни), умерено integration тестове на Application, малко но целенасочени contract/E2E тестове на Adapters/UI. Обратната пирамида (много бавни E2E, малко unit) е забранена архитектурно от 21 §3 — UI зависи от Application interface, не от Core директно, точно за да не се налага E2E за всяка Core проверка.
- **TDD workflow за Phase 4 (истинска дисциплина, не само тестова таксономия):** за всяка Core операция — напиши INV/table-driven теста от §3/§4 **преди** имплементацията (red) → минимална имплементация, която го минава (green) → рефакторинг без промяна на теста (refactor). Инвариантите в §3 не са "неща за проверка след факта" — те са входната точка на всяка Core задача.
- **Тестовете надживяват дизайна на кода.** Golden/regression котвите в §5 не се трият/отслабват при рефакторинг без изричен PD еквивалент — те кодират продуктови обещания (доверие, PD-013, PD-009), не имплементационни детайли.

---

## §2. Тестова таксономия по архитектурен слой

Формализация на 21 §11:

| Слой | Тип тест | Скорост | Test doubles | Кой пише |
|------|----------|---------|----------------|----------|
| **Core** (Drawing, Measurement) | Unit — table-driven, property-based, golden | мс | Нула (чисти функции, 21 §1) | Всеки, който пипа 17/18 |
| **Application** (Command stack, Repositories, Sync) | Integration | мс–10мс | In-memory fake Storage adapter (не mock на реална IndexedDB) | Всеки, който пипа 21 §4/§5 |
| **Adapters** (Map, AI, Extension sandbox) | Contract — един suite, N имплементации | варира | Fake имплементация минава същия contract като реалната | Всеки, който добавя/сменя adapter |
| **UI/Flow** | Structural E2E (F1–F7 завършват коректно) | секунди | Реален Core+Application, fake Adapters | Feature владелец |
| **Accessibility** | Parity checklist (§9) | секунди–мин | — | Feature owner + review |

**Явно разграничение (PHASE_2_REVIEW риск "Невалидиран UX"):** тестовете тук доказват **функционална коректност** на F1–F7 (примерно: "F1 завършва без диалог, стойността се появява"). Те **не** доказват UX целите (<60 сек, "изненадана позитивно") — тези остават Known Risk до потребителска валидация; TDD не е заместител на UX research, само пази функционалната основа, върху която UX резултатът зависи.

---

## §3. INV → Test Traceability Matrix

Пряко от 14 §4. Всеки ред е задължителен тест, не препоръка.

| INV | Твърдение | Тест ID | Тип | Слой |
|-----|-----------|---------|-----|------|
| INV-1 | Всеки Shape принадлежи на точно едно Measurement | T-INV-1 | Unit (конструктор/инвариант проверка) | Core |
| INV-2 | MeasurementValues е чиста функция на (Shape, Calibration) | T-INV-2 | Property-based: същия вход → същия изход, N пъти | Core |
| INV-3 | Рекалибриране преизчислява всички Measurements на Surface атомарно | T-INV-3 | Integration (Surface repository, multi-measurement fixture) | Application |
| INV-4 | Σ(children.area) == parent.area при Split | T-INV-4 | Property-based + golden (§5.2) | Core |
| INV-5 | Ghost никога не се появява в persisted store/суми/Report | T-INV-5 | Integration (симулирай Ghost сесия → провери storage snapshot празен) | Application |
| INV-6 | Provenance е immutable след създаване | T-INV-6 | Unit (опит за промяна извън конструктора се проверява compile-time/runtime) | Core |
| INV-7 | Extension изчисления не се персистират | T-INV-7 | Contract (Extension sandbox, §7) | Adapters |
| INV-8 | Каскадно изтриване (Surface→Layers→Measurements→Shapes; Project→всичко) | T-INV-8 | Integration (repository delete + verify children gone) | Application |
| INV-9 | Изтриване на Project е единствената команда без inverse | T-INV-9 | Unit (CommandStack: ProjectDeleted няма `undo()` метод — compile-time, не runtime проверка) | Application |
| INV-10 | Workspace/Extension каталожна промяна не мутира Project данни | T-INV-10 | Integration (промени каталога, провери Project снимка непроменена) | Application |
| INV-11 | Report е снимка към момента на генериране | T-INV-11 | Integration (генерирай Report, редактирай Measurement, провери Report непроменен) | Application |
| INV-12 | Всяка команда освен ProjectDeleted има inverse | T-INV-12 | Property-based round-trip: `apply(inverse(op), apply(op, state)) == state` за всеки Command тип | Application |
| INV-13 | Заключен Measurement отказва move/resize/vertex-edit/delete/split на Application ниво | T-INV-13 | Integration (`roundtrip.test.ts` — "Locked measurement refuses geometry-mutating commands", 12 случая) | Application |
| INV-14 | Split-into-parts: Σ(children.area) == parent.area за N деца | T-INV-14 | Property-based (`core/drawing/splitParts.test.ts`) + Integration inheritance (`roundtrip.test.ts` — "SplitIntoParts") | Core + Application |
| INV-15 | `manualArea` фактор пропорционално точен през геометрични редакции; Split група дели **запазен** общ сбор (PD-021) | T-INV-15 | Integration (`roundtrip.test.ts` — "SetManualArea", "SplitIntoParts — inherits manualArea", "PD-021 — Split group conserves the parent manual area": редакция/вмъкване/премахване на връх, N-way, вложен Split, редакция на родителя, undo/redo, липса на дрейф) + Unit за чистия helper (`application/splitGroup.test.ts`) | Application |
| INV-16 | Скрит Measurement не се чертае/hit-test-ва, но остава в Layers списъка и Σ Total | T-INV-16 | Unit (`sceneRenderer.test.ts`) + Integration (`studioSession.test.ts` — "skips a hidden measurement") | UI |
| INV-17 | `vertexLabels` index-aligned през addVertex/removeVertex | T-INV-17 | Integration (`roundtrip.test.ts` — "AddVertex/RemoveVertex — shifts vertex labels") | Application |
| INV-18 | `Surface.imageLocked` блокира преместване/resize на фоновото изображение | T-INV-18 | Integration (`roundtrip.test.ts` — "SetImageLocked") | Application |
| INV-19 | Vertex редакция се прилага атомарно към всички точно съвпадащи върхове (без родител ↔ наследник); заключен участник блокира (PD-024) | T-INV-19 | Unit table-driven за откриване на свързаните върхове (Core) + Integration (`roundtrip.test.ts`: местене/добавяне/изтриване, Ctrl-откачане, заключен/скрит съсед, T-съединение след повторен Split, undo, PD-021 ребалансиране): Core `coincidence.test.ts`; Application `sharedVertices.test.ts` ("findLinkedVertices", "findSharedEdges", "splitJunctions", "closeTJunctions"); Integration `roundtrip.test.ts` — "PD-024 — shared vertices (INV-19, T-INV-19)" (вкл. fast-check свойство: частите покриват преместения контур); UI `vertexEditSession.test.ts` — "PD-024 — linked vertex drag" | Core + Application |

**Правило:** нов Command тип, добавен в бъдеще, не влиза в codebase без съответен T-INV-12 round-trip случай — CI проверка (не само code review) в Phase 4.

**Забележка за INV-13…INV-18:** добавени ретроактивно (14 §4-та собствена бележка) — тестовете вече съществуваха преди тази таблица да ги цитира изрично; редовете тук само правят traceability-то, което §1-вия принцип на този документ изисква, явно.

---

## §4. Core engine test suites (детайлизация на 17 §9 / 18 §9)

### 4.1. Measurement Engine (17)

- **Table-driven по §3 формули:** известни фигури (правоъгълник 10×5, кръг r=3, полигон с ръчно изчислена Shoelace стойност) срещу очакван резултат, включително ъгли (atan2 стабилност по квадранти).
- **Property-based INV-2:** случаен валиден Shape + Calibration → изчисли N пъти → идентичен резултат всеки път (гарантира липса на скрито мутируемо състояние в Core).
- **Numerically-stable edge cases:** "иглен" полигон (площ близка до нула), полигон с колинеарни последователни върхове.
- **Прецизност (17 §5):** тест, който проверява закръгляне следва входната прецизност, не float64 капацитета — regression срещу бъдещо "подобрение", което тихо покаже фалшива прецизност.

### 4.2. Drawing Engine (18)

- **Snap table-driven:** известни курсор/target конфигурации (връх/ръб/ъгъл, вътре/извън толеранс) → очакван snap резултат.
- **Vertex editing property-based (INV-1 поддръжка):** случайна валидна редакция никога не произвежда самопресичащ се или <3-върхов полигон.
- **Split (виж §5.2 за golden anchor):** property-based генерира случаен прост полигон (вкл. non-convex) + случайна валидна пресичаща линия → `canSplit` + партиционирането коректно.
- **Undo round-trip (T-INV-12 приложено конкретно):** за create/edit/split/delete — `apply(inverse(op), apply(op, state)) == state`.

---

## §5. Golden / Regression котви (не се трият без PD)

Тези тестове кодират продуктови обещания за доверие — заличаването или отслабването им изисква explicit PD решение, не обикновен рефакторинг.

### 5.1. Гео котва (17 §4.1 — Mercator риск)

Публично документиран парцел/обект с известни gео координати и позната реална площ (напр. стандартно футболно игрище). Изчислена площ трябва да съвпада в рамките на <0.5% грешка. **Цел:** пази срещу тихото връщане на плоска Shoelace формула директно върху суров lat/lng при бъдещ рефакторинг на Measurement Engine — точно "тихата яма", идентифицирана в PHASE_2_REVIEW §5.

### 5.2. Split sum котва (INV-4, PD-009)

Фиксиран non-convex fixture (буква "L"-форма, буква "U"-форма) с ръчно проверени площи на резултатните части. Regression тест, отделен от property-based (§4.2), защото property-based тества *общия случай статистически*; golden fixture-ите тестват *конкретни известни трудни форми*, които някога вече са били източник на грешка или са representative за реален Real Estate сценарий (J2, 09).

### 5.3. Ghost non-persistence котва (INV-5, PD-013)

Integration тест, който симулира пълна Ghost сесия (proposed → committed за едно, rejected за друго) и след затваряне на сесията прави пълен snapshot на storage adapter-а — снимката не трябва да съдържа никаква следа от rejected Ghost-а. Пази буквалното "никаква следа" обещание от 14 §8.

---

## §6. Application layer тестове

- **Command stack:** T-INV-9, T-INV-12 (§3); допълнително — redo history се изчиства при нова команда след undo (21 §4.2 поведение).
- **Repositories:** T-INV-3 (атомарно преизчисляване), T-INV-8 (каскадно изтриване), transactional запис на цялото Surface дърво (21 §5.1) — тест за частичен write failure (симулиран storage грешка по средата) не оставя частично записано дърво.
- **Sync engine (PD-012):** last-write-wins contract тест — два "устройства" (fake adapter инстанции) записват различни промени на различни Surfaces в същия Project, sync резултатът съдържа и двете (различни aggregates, без конфликт по дефиниция на 21 §5.3); симулиран конфликт на **същия** Surface aggregate resolved по timestamp.

---

## §7. Adapter Contract тестове

Един contract suite на adapter тип; всяка имплементация (fake за тестове, реална за Phase 4 интеграция) минава **същия** suite — гарантира, че fake и реалната имплементация са поведенчески еквивалентни.

| Adapter | Contract проверки |
|---------|---------------------|
| MapProvider (21 §8.1) | `search` връща валидни locations за известна заявка; `getTile` връща imagery за валидни координати; коректно поведение при мрежова грешка (не хвърля, връща explicit грешка тип) |
| AIProvider (21 §8.2) | `detectBoundary` връща `GhostCandidate[]` с `confidence ∈ [0,1]`; под праг връща празен списък (не грешка) — пряко тества 15 §18 "не предлага, ако не е уверен" поведението на договорно ниво |
| Extension Sandbox (21 §7, T-INV-7) | Extension код **не може** да достигне Repository API, Shape данни извън подадената селекция, или DOM — contract тестът активно опитва забранени операции отвътре на sandbox-а и проверява, че се провалят structural (Worker без достъп), не runtime-convention проверка |

---

## §8. UI / Flow тестове (структурна коректност на F1–F7)

Тестват **завършеност и коректност на потока**, не UX усещане (виж §2 разграничението). Извадка, директно от 15 §5:

| Flow | Какво се тества (не времена/емоции) |
|------|----------------------------------------|
| F1 (карта → полигон) | Търсене → chertane → затваряне произвежда Measurement с коректни стойности; нула неочаквани диалози в пътя |
| F2 (import + календриране) | Skip оставя px режим функционален; въвеждане на мащаб коректно преизчислява съществуващи Measurements на тази Surface |
| F5 (AI ghost) | Esc не оставя следа (§5.3); Accept произвежда Measurement с ✦ provenance; редакция на връх имплицитно commit-ва |
| F7 (Split) | `canSplit` false блокира Enter; валиден split произвежда 2 деца с коректна group връзка в списъка |

**Дефиниция на "структурна коректност":** машинно проверимо (брой диалози, наличие/липса на елемент, коректност на данни) — не субективна преценка "усеща се лесно". Последното е UX валидация, отделен процес.

---

## §9. Accessibility Parity Checklist (15 §12, 21 §6.1/10.2)

Enumerable, не свободен текст — всеки ред е тест:

1. Всяко действие, достъпно чрез клик на платното, има еквивалент в Measurement List или ⌘K.
2. Всеки Measurement, видим на платното, е фокусируем чрез Tab в списъка.
3. Селекция в списъка произвежда идентичен визуален selection state като клик на платното (единствен source of truth, 21 §10.2).
4. Live region announcement произвежда се при: добавяне на връх, затваряне на полигон, приемане на Ghost (15 §12.2 конкретните три случая).
5. Контраст на chip/panel текст ≥ дефинираните прагове (16 §2) — автоматизирана проверка на token стойностите, не ръчна инспекция при всеки release.

---

## §10. PD / Guardrail Regression тестове

Продуктови решения, които са технически проверими — превърнати в permanent тестове, за да не се "изгубят" в бъдещ рефакторинг:

| PD/Guardrail | Тест |
|--------------|------|
| PD-009 „ръчен path незасегнат" | US-042 сценарий: ръчно чертане на застъпващи се полигони не се блокира/предупреждава от съществуването на Split |
| PD-011 v1 обхват | Негативен тест: DWG/DXF import път не съществува в кода (не просто "неизползван UI бутон") — предотвратява тихо разширяване на обхвата покрай процеса |
| PD-013 „Ghost никога не комитва без жест" | Contract тест: единствените пътища, водещи до `MeasurementDrawn(Provenance=AIGenerated)`, са explicit Enter/✓/vertex-edit — няма timer/auto-accept код path |
| PD-016 „Medical PARKED" | Негативен тест: нула референции към медицински домейн обекти/workspace в кодовата база (архитектурен linter правило, не unit тест) |

---

## §11. Test data & fixtures стратегия

- **Core fixtures** (полигони, calibration стойности) — версионирани заедно с кода, малки, детерминистични, без external зависимост (файл/мрежа).
- **Golden anchors** (§5) — версионирани отделно, с коментар, обясняващ произхода на очакваната стойност (напр. "футболно игрище, координати от [публичен източник], публикувана площ X m²") — възпроизводимост, не магическо число.
- **Non-convex fixtures** (§5.2) — реалистични форми, вдъхновени от 09 journeys (J2 наследствен парцел), не изкуствено опростени.

---

## §12. Coverage targets & Definition of Done

| Слой | Coverage очакване | Обосновка |
|------|----------------------|-----------|
| Core | Възможно най-близо до пълно — всяка публична функция + всеки INV | Нула extenuating обстоятелства (чист, изолиран, 21 §1) |
| Application | Висок — фокус върху INV-3/8/9/10/11/12 пътищата | Integration тестовете са по-скъпи; приоритет на инвариантите пред случайна редова покривка |
| Adapters | Contract suite пълен, имплементационни детайли извън contract-а — без изискване | Contract-ът е договорът; вътрешността на реален MapProvider е Phase 4/доставчик грижа |
| UI/Flow | F1–F7 структурна коректност покрита; извън тях — по преценка на feature owner | E2E е скъпо; не се дублира Core/Application покривка на UI ниво |

**Definition of Done за Core/Application задача:** INV тестовете от §3, засегнати от промяната, минават; нов код носи собствен tест (unit минимум) **преди** merge (test-first дисциплина от §1); golden котвите (§5) не са пипнати без explicit обосновка в PR описанието.

---

## §13. Проверка срещу 14/17/18/21

| Тук | Произход |
|-----|----------|
| §3 traceability matrix | 14 §4 (всеки INV има ред) |
| §4 Core suites | 17 §9, 18 §9 (пряко разгърнати) |
| §5 golden anchors | PHASE_2_REVIEW §5 риск (гео), PD-009 (split) |
| §7 contract тестове | 21 §7/§8 (adapter граници) |
| §8 разграничение UX/функционалност | PHASE_2_REVIEW "Невалидиран UX" риск — TDD не го затваря, само пази функционалната основа |
| §12 coverage приоритет по слой | 21 §1 (Core е "доказуем", не просто тестван) |
