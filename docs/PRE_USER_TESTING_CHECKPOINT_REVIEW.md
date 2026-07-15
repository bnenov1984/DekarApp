# Pre-User-Testing Checkpoint Review

**Дата:** 2026-07-15
**Обхват:** Затваряне на текущата имплементационна фаза (Tool Dock → Calibration UI → PropertyPanel/Vertex Editing → Split → Persistence) преди PO hands-on тестване. **AI изрично не е част от този milestone** — вижте `docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` ISS-009 (остава DEFERRED, тригер за отваряне: изрично PO одобрение след тестването този документ подготвя).
**Правило на документа:** Консолидиран преглед на вече свършеното + honest gap list + acceptance чеклист. Нула production код тук.

---

## 1. Features currently usable end to end

**Home:**
- "Blank canvas" — стартира нов проект, автоматично записан (autosave).
- **Recent** списък (реален, не placeholder) — карти с име + обща площ; клик зарежда целия проект обратно в Studio, включително всички измервания, календриране, имена/цветове/бележки.

**Studio — чертане** (Tool Dock, шест инструмента): Select, Rectangle, Polygon, Circle, Freehand, Distance/Line. Клавишни shortcuts `V/R/P/C/F/D`; `Shift`+инструмент за серийно чертане; `⌥`(Alt) временно изключва snap; `S` toggle-ва snap; жива числова обратна връзка (площ/дължина) по време на чертене; snap към върхове/ръбове на други фигури.

**Studio — календриране:** ScaleChip в StatusBar (клик → чертане на референтна линия → въвеждане на реална дължина в m/ft → Enter) презаписва мащаба; всички измервания на Surface-а живо преизчисляват единиците си; ненатрапчиво предупреждение при implausible мащаб (напр. "стая 2 km").

**Studio — редакция:** PropertyPanel (десен панел) при селекция — преименуване (inline текстово поле), смяна на цвят (8-цветен swatch picker), бележки (textarea). Vertex editing — двоен клик върху Polygon/Freehand/Curve влиза в режим на редакция; drag на връх го мести; drag на ръб вмъква нов връх; Alt+клик върху връх го изтрива (с тих отказ, ако би оставил <3 върха или самопресичане).

**Studio — Split:** `X` върху селектиран Polygon → чертане на разделителна (поли)линия → живо dual-area ghost preview щом линията пресече границата точно два пъти → `Enter` потвърждава, `Esc` разтваря без следа. Родителят остава непокътнат; частите се показват групирани и с отстъп в списъка; повторно разделяне на вече получена част работи без допълнителен код (потвърдено на живо до 3 части).

**Studio — Undo/Redo:** `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl+Y` — обхваща буквално всяка мутация (чертане, календриране, преименуване, vertex editing, split) в една обща история за сесията.

**Studio — селекция:** клик върху платното и клик върху ред в списъка сочат към едно и също store — винаги синхронизирани; списъчните редове са нативни `<button>` елементи (Tab + Enter/Space работят без мишка).

**Persistence:** всяка сетнала се мутация autosave-ва fire-and-forget (без Save бутон); проверено на живо чрез пряка IndexedDB инспекция (не dev hook) през пълен page reload — Recent картата показва точната площ, зареденият проект е бит-за-бит същият, и **продължава да autosave-ва коректно** след зареждане (не read-only snapshot).

---

## 2. Known limitations

Всички изрично декларирани в съответния checkpoint review при появата им, не открити сега за пръв път:

| Ограничение | Произход |
|---|---|
| Pan/Zoom на платното не съществува (Surface-space == CSS-pixel-space опростяване) | ISS-010, Tool Dock checkpoint |
| Curve (Bézier) инструмент не е имплементиран — UX не е достатъчно специфициран | Tool Dock checkpoint |
| Import (Image/PDF/Map surfaces) не съществува — няма MapProvider/file parsing | UI Checkpoint / многократно потвърдено |
| Клавиатурно чертане (стрелки местят прицел) не съществува — геометрията изисква мишка/pointer | Tool Dock checkpoint, повторено при всеки следващ |
| Ротация на правоъгълник чрез дръжка не съществува | Tool Dock checkpoint |
| Плъзгане на цяла форма (не само върхове) не съществува | PropertyPanel/Vertex Editing checkpoint |
| Редакция на стойност директно от списъка не съществува (неясна семантика) | PropertyPanel/Vertex Editing checkpoint |
| Двоен клик върху chip за преименуване не съществува (chip е `pointer-events:none` по дизайн) | PropertyPanel/Vertex Editing checkpoint |
| Snap за Split линията не съществува (умишлено — избягва провокиране на ISS-001) | Split checkpoint |
| Extensions панел/marketplace не съществува | Не построено още — Bible-ниво способност, извън обхват до сега |
| Multi-select не съществува никъде в приложението | Отбелязано при всеки следващ checkpoint като deferred |
| Workspace switching UI не съществува (само "general" workspace) | Не построено още |
| SettingsRepository/ReportRepository имплементации не съществуват — нищо не ги консумира | Persistence checkpoint (умишлено decision) |
| Cloud Sync (PD-012 стъпала 2-3) не съществува | По дизайн, следващо PD стъпало |

---

## 3. Deferred functionality

- **AI (ghost detection, propose/commit UI)** — изрично отложено с това решение (ISS-009 DEFERRED, тригер: PO одобрение след hands-on тестване). Архитектурните seam-ове са запазени, нищо изпълнено — виж §10 на предходния Persistence checkpoint и актуализирания ISS-009 запис.
- **Report / Export (PNG/PDF/CSV/JSON)** — **не съществува никакъв генериращ код или UI.** Нито Report generation command, нито `ReportRepository` имплементация (портът е дефиниран, но изрично deferred в Persistence slice-а поради липса на consumer). Това е реален, не козметичен gap — вижте §7 по-долу.
- **Import** (Image/PDF/Map surfaces) — нужни адаптери (MapProvider, file parsing) не съществуват.
- **Workspace switching, Extensions marketplace** — концептуално дефинирани в Bible/докс, не построени.
- **Cloud Sync** — PD-012 стъпала 2-3, извън обхвата на local-first v1 фазата.
- **Settings UI** — няма consumer за `AppSettings` още (нито език, нито default единици preference UI).

---

## 4. Open implementation issues

От `docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md`:

| ID | Статус | Същина |
|----|--------|--------|
| ISS-001 | 🔴 OPEN (PARKED от PO) | Split: линия през съществуващ връх на родителя — degenerate случай без explicit правило |
| ISS-002 | 🔴 OPEN | Extension sandbox сериализация overhead — неизмерена (moot, докато няма extensions) |
| ISS-003 | 🔴 OPEN | AI CONFIDENCE_THRESHOLD калибрация — блокира ISS-009, вече без спешност предвид отлагането |
| ISS-006 | 🔴 OPEN | PWA/iOS Safari spike все още непроведен |
| ISS-008 | ✅ RESOLVED 2026-07-15 | StorageAdapter/Repository имплементации — виж Persistence checkpoint |
| ISS-009 | 🔵 DEFERRED (актуализирано 2026-07-15) | AI orchestration — тригер за отваряне вече изрично PO одобрение след тестване, не автоматичен следващ slice |
| ISS-010 | 🔴 OPEN | Surface-space == CSS-pixel-space опростяване (viewport/pan/zoom) |

**Housekeeping дълг, не блокиращ:** "Candidate ISS-011" (plausibility проверката в Calibration UI използва viewport CSS-pixel размера като заместител на реален Surface pixel extent) е споменаван в три поредни checkpoint review-та (Calibration UI, PropertyPanel/Vertex Editing, Split) като "чака формален запис при следващия docs sync" — все още не е формално заведен в issues таблицата. Не блокира нищо; флагвам го тук изрично, за да не се изгуби между checkpoint-ите.

---

## 5. Test and static-analysis status

```
Test Files  25 passed (25)
Tests       229 passed (229)
tsc --noEmit       exit 0
svelte-check       383 files, 0 errors, 0 warnings
eslint .           exit 0
```

Разбивка по слой: Core (drawing/measurement/calibration engines) — golden fixtures (L/U-shape non-convex split), property-based INV-4 тест (200 runs), geo golden anchor (latitude-varying, 12 теста). Application (commands) — 13 round-trip теста (execute→undo→exact initial→redo→exact mutated) за всичките 9 команди. Adapters — 3 contract suite-а (StorageAdapter, ProjectRepository, SurfaceRepository), всеки изпълнен два пъти (fake + реален IndexedDB чрез `fake-indexeddb`), 30 теста общо. UI stores (drawingSession/calibrationSession/vertexEditSession/splitSession/persistence) — 89 теста, интеграционен подход (реален CommandStack, не мокнат).

---

## 6. Persistence and reload verification

Верифицирано **на живо в браузъра чрез пряка IndexedDB инспекция** (не dev-hook четене на in-memory store):

1. Начертано измерване (правоъгълник) в нов Blank проект.
2. Директна `indexedDB.open('areaflow')` заявка към `projects`/`surfaces` object stores потвърждава реален запис веднага след чертенето (autosave, без експлицитно Save действие).
3. Пълен `window.location.reload()` — не soft navigation.
4. Home Recent картата се появява с точната обща площ ("Untitled — 8000 px²"), съвпадаща с нарисуваната форма.
5. Клик върху картата зарежда проекта в Studio — Measurement List, canvas рендиране, ScaleChip състояние всички коректни.
6. Ново начертана фигура върху **заредената** сесия autosave-ва коректно (потвърдено пак чрез пряк IndexedDB read) — сесията е напълно жива, не read-only snapshot.
7. INV-3 (атомарен Surface save) и INV-8 (Project delete каскадира към Surfaces) потвърдени в автоматизирания contract suite (не само на живо).

**Не е тествано:** реално изчерпване на browser storage quota (браузърните квоти са обикновено гигабайти, нереалистично да се провокира в живо демо) — покрито само с unit тест, форсиращ типизираната грешка (`StorageQuotaExceededError`) на call site-а.

---

## 7. Report/export readiness

**Не е готово. Изрично не съществува:**
- Нито един Report generation command (не е част от 9-те съществуващи Application commands).
- `ReportRepository` няма имплементация (портът е дефиниран, но изрично deferred в Persistence slice-а поради липса на consumer — вижте §3 по-горе).
- Никакъв Export UI (PNG/PDF/CSV/JSON per Bible) не съществува никъде в приложението.

Това означава: **точка 10 от изисквания acceptance чеклист по-долу ("generate and inspect a report") не може да бъде изпълнена в текущия milestone.** Флагвам това изрично тук, а не мълчаливо в чеклиста, за да е ясно на PO, че липсата не е пропуск в тестването, а genuinely неизградена функционалност.

---

## 8. Exact local run instructions

Работна директория: `C:\Users\Home\Desktop\Projects\Claude\AreaFlow`

```bash
# еднократно, ако node_modules липсва
npm install

# dev сървър — Vite, hardcoded порт 5174 (vite.config.ts, за да не колидира с друг проект)
npm run dev
# → http://localhost:5174

# автоматизирани проверки
npm test               # vitest, 229 теста
npm run typecheck       # tsc --noEmit
npm run typecheck:svelte # svelte-check
npm run lint            # eslint

# статичен production build (не е нужен за ръчно тестване през dev сървъра)
npm run build            # → dist-ui/
```

Няма нужда от backend, база данни, или environment променливи — local-first (PD-012), всичко живее в браузърния IndexedDB под origin-а на dev сървъра.

---

## 9. Exact demo/test data or workflow

Няма seed данни — local-first по дизайн, всеки нов проект стартира празен. Препоръчан демо скрипт (≈5 минути):

1. Отвори `http://localhost:5174` → **"Blank canvas"**.
2. Начертай правоъгълник (`R`, drag на платното).
3. Начертай неправилен полигон (`P`, кликай 5-6 точки, затвори с двоен клик или click близо до първия връх).
4. Селектирай полигона → `X` → изтегли разделителна линия през него → `Enter` → потвърди, че се появяват две части, групирани в списъка отляво.
5. Клик върху ScaleChip (StatusBar) → изтегли референтна линия → въведи напр. `10` `m` → потвърди, че всички измервания преминават от `px²` към `m²`.
6. Двоен клик върху полигон (или негова част) → изтегли връх → потвърди, че площта се преизчислява live.
7. Селектирай измерване → в десния панел: смени името, избери нов цвят, добави бележка.
8. `Ctrl+Z` няколко пъти, после `Ctrl+Shift+Z` (или `Ctrl+Y`) — потвърди, че всичко по-горе се отменя/връща коректно.
9. Презареди страницата (`F5`) → на Home провери, че проектът се появява в **Recent** с правилната обща площ → клик → потвърди, че всичко се възстановява точно.

---

## 10. Recommended manual acceptance checklist

| # | Действие | Наличност |
|---|----------|-----------|
| 1 | Create and reopen a project | ✅ Достъпно — Blank canvas + Recent списък |
| 2 | Import supported input | ⛔ **Не съществува тази milestone** — само Blank canvas; Map/Import картите са видимо disabled |
| 3 | Calibrate scale | ✅ Достъпно — ScaleChip flow |
| 4 | Draw each supported shape | ✅ Достъпно — Rectangle/Polygon/Circle/Freehand/Distance (Curve не съществува, вижте §2) |
| 5 | Edit measurements | ✅ Достъпно — PropertyPanel (rename/recolor/notes) + Vertex Editing (move/insert/delete vertex) |
| 6 | Use undo/redo | ✅ Достъпно — обхваща всичко в §1 |
| 7 | Select from canvas and list | ✅ Достъпно — двупосочно синхронизирани |
| 8 | Split where supported | ✅ Достъпно — Polygon само, `X` shortcut |
| 9 | Verify units and totals | ✅ Достъпно — StatusBar ScaleChip, Measurement List Σ Total area (коригирана за split double-counting) |
| 10 | Generate and inspect a report | ⛔ **Не съществува тази milestone** — вижте §7, изрично неизградено |
| 11 | Reload the application | ✅ Достъпно — потвърдено многократно на живо, §6 |
| 12 | Confirm persisted state | ✅ Достъпно — Recent списък + пълно възстановяване на Studio |
| 13 | Confirm error handling | ⚠️ **Частично** — StorageQuotaExceededError path тестван само unit-ниво (реална квота нереалистична да се провокира); non-blocking UI грешки (15 §16 принцип) навсякъде другаде вече проверени на живо във всеки checkpoint |
| 14 | Confirm keyboard accessibility | ⚠️ **Частично** — Tab/Enter/Space работят за списъчна селекция, ToolDock arrow-key навигация, всички текстови полета; **самото чертане/vertex editing/split изисква мишка** (клавиатурен crosshair не съществува, §2) |

**Легенда:** ✅ напълно тестваемо сега · ⚠️ частично, с изрично декларирана граница · ⛔ не съществува тази milestone, не пропуск в тестването.

---

## Заключение

Продуктът е готов за PO hands-on тестване в границите, описани по-горе. AI остава изрично извън обхвата — отваря се само след явно PO решение, последвало това тестване. Report/Export и Import са единствените "истински липсващи" точки от заявения чеклист (не ограничения, а неизградена функционалност) — маркирани изрично, не премълчани.
