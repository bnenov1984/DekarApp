# UI Checkpoint Review

**Дата:** 2026-07-15
**Обхват:** Петте UI commit-а от `CONTRIBUTING.md` UI бележката — bootstrap на Studio до measurement overlays.
**Правило на документа:** Само преглед на вече свършеното + препоръка за следваща стъпка. Нула production код тук.

---

## 1. Scope completed

Studio вече може, реално, не хипотетично:

- Отваря се от Home ("Blank canvas" → Studio, с идентичност на проекта в TopBar).
- Показва Surface измервания на Canvas2D платно — полигон (вкл. non-convex), правоъгълник (вкл. ротация), кръг, линия, freehand/curve.
- Селектира измерване с клик върху платното (hit-test) или с клик/Tab+Enter в списъка отляво — двете винаги в синхрон, защото пишат в един и същ store.
- Показва живи стойности (площ/дължина) едновременно като DOM chip върху фигурата и като ред в Measurement List, захранени от един и същ Measurement Engine извик, не от два отделни модела.
- Undo/Redo през клавиатура (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y), обвързано с реалния Application CommandStack.
- Следва системната тема (светла/тъмна) на живо, включително цвета на селекцията.

Това, което Studio **все още не може**: да чертае нищо интерактивно (всяко измерване по-горе е създадено през dev hook/тестове, не през инструмент), да календрира, да показва property панел, да презапазва между презареждания.

---

## 2. Commit range и роля на всеки commit

Диапазон: `44f8529..268a968` (9 commit-а, вкл. 2 chore/docs). UI-специфичните пет:

| # | Hash | Заглавие | Роля |
|---|------|----------|------|
| 1 | `37ce239` | `feat(ui): bootstrap Canvas shell` | Vite+Svelte tooling (ADR-006), design tokens като CSS custom properties, Shell скелет (TopBar 48px + празно DPI-aware платно + StatusBar 28px). Нула Project данни. |
| 2 | `1de8c81` | `feat(ui): implement Project workspace` | Home екран (3 Start карти, Blank жив), Studio wrapping, `appState` store за Home⇄Studio навигация, in-memory Project/Surface създаване. `SurfaceKind` разширен с `'blank'` (декларирана Core корекция). |
| 3 | `72cb087` | `feat(ui): integrate CommandStack` | Първата UI→Application връзка. `studioSession` store: един CommandStack на сесия, `executeCommand` срещу винаги-текущия Surface, keyboard undo/redo. Решен ADR-006-те отложен въпрос: module-level stores, не context. |
| 4 | `1b2a586` | `feat(ui): render Shape layer` | Core `hitTestShape` (нов, тестван) + `sceneRenderer.ts` (чист Canvas2D scene graph) + click-селекция. Намерен и поправен реален бъг: canvas не се предисуваше при смяна на темата. |
| 5 | `268a968` | `feat(ui): measurement overlays` | Core `shapeCentroid` (нов, тестван) + `computeMeasurementDisplay` (UI formatting над Measurement Engine) + `MeasurementChip.svelte` (DOM overlay) + `MeasurementList.svelte` (a11y път, D8). |

Междинни: `44f8529` ADR-006 (docs), `e4dae49` chore (ESLint resolver поправка), `e8d3f04` docs (verification record) — вижте §8 за drift върху първия от тях.

---

## 3. Проверени user flows

Всички проверени **на живо в браузъра** (не само unit тестове) — pixel-level (`getImageData`) или accessibility-tree четене, не приемане на вяра:

| Flow | Как е проверено |
|------|-------------------|
| Home → Blank canvas → Studio | Реален клик + accessibility snapshot потвърждава "Untitled" в TopBar |
| Създаване на measurement през CommandStack | Реален `createMeasurementCommand` през dev hook → `canUndo` true, форма се появява |
| Рендиране на форма (polygon/circle/rotated rectangle) | `getImageData` на точни dpr-коригирани координати → верни RGBA цветове/прозрачност |
| Селекция: клик на платно → списък се откроява | `classList.contains('selected')` проверка на реалния DOM елемент |
| Селекция: клик в списък → платно показва accent контур | `getImageData` на ръба на формата → точен accent цвят |
| Keyboard селекция в списъка | `.focus()` + Enter dispatch → `selectedMeasurementId` коректно сменен |
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Реални `KeyboardEvent` dispatch-и → measurement се маха/връща |
| Живо превключване на тема | `matchMedia` promise resolve → accent stroke цвят се сменя без презареждане |
| Resize (tablet/desktop viewport) | `preview_inspect` bounding box потвърждава 768px пълна ширина след resize |
| Chip ↔ List консистентност | И двете четени от accessibility tree — идентични стойности (10000 px² / 7854 px² / сума 17854 px²) |

**Не е проверено** (защото не съществува още): F1 North Star flow "карта→полигон→площ" в реалната му форма (изисква drawing tool + Map surface), F2 календриране, F6 export.

---

## 4. Проверени архитектурни инварианти

| Инвариант | Статус |
|-----------|--------|
| UI → Application → Core посока на зависимост (21 §3) | ✅ Емпирично потвърдено — но **само след намерен и поправен бъг**: ESLint boundary правилото никога не бе гръмвало преди `e4dae49` (липсващ TS resolver, тихо игнорирани импорти). Поправено, потвърдено и в двете посоки с умишлен violation probe. |
| Canvas никога не притежава геометрия (ADR-002) | ✅ `sceneRenderer.ts` е чист/параметризиран, чете Shape VOs, не ги пипа |
| Един Shape източник → две проекции (canvas + DOM), не два модела (21 §6.3/10.2) | ✅ Потвърдено чрез идентични стойности в chip и list за едни и същи measurements |
| CommandStack round-trip през реален UI код (не само тестове) | ✅ execute/undo/redo верифицирани с реални keyboard events, не само `vitest` |
| Hit-testing е чиста Core функция, UI само я вика | ✅ `hitTestShape` (Core) консумиран от `studioSession` (UI), нула geometry код в UI слоя |
| Repository/Adapters граница | ⚠️ **Непроверена — `src/adapters/` не съществува изобщо.** Нито един Repository port има implementation. Вижте §7 "tracked risks" и §10. |

---

## 5. Accessibility verification

**Проверено:**
- `MeasurementList` редовете са реални `<button>` елементи — нативен Tab focus, Enter/Space активиране (не bespoke ARIA layer) — потвърдено с реален `.focus()` + `KeyboardEvent('Enter')`.
- Селекцията през списъка и през платното пише в един и същ store — няма разминаване между "мишка" и "клавиатура" резултат.
- Празно състояние: панелът не рендира нищо при 0 measurements (15 §15 "най-добрият празен панел е никакъв") — компонентно, не CSS-скрито.

**Не е проверено / не съществува още** (честно декларирано, не пропуснато мълчаливо):
- Live region announcements (15 §12.2 — "Vertex added", "Polygon closed") — няма ги, защото няма интерактивно чертане още.
- Клавиатурно чертане (15 §12.1 — стрелки местят прицел) — зависи от Tool Dock, не съществува.
- Контраст на chip текст върху произволен фон — тривиално вярно сега (fill е `--af-surface-panel`, непрозрачен), но не е формално тестван срещу WCAG праговете от 16 §2.4.
- Focus ring визуална диференциация спрямо selection ring (15 §12.3) — списъкът има `:focus-visible` стил, платното няма отделен focus concept още (селекцията е единственото визуално състояние).

---

## 6. Test and static-analysis results

```
Test Files  14 passed (14)
Tests       133 passed (133)
tsc --noEmit       exit 0
svelte-check       350 files, 0 errors, 0 warnings
eslint .           exit 0
```

Разбивка на новите тестове по commit: 10 (bootstrap — 0 нови, tooling only) → 0 (Project workspace) → 7 (CommandStack integration, `studioSession.test.ts`) → 10+7 нови (`hitTest.test.ts` + selection тестове) → 9 нови (`centroid.test.ts` + `computeDisplay.test.ts`). Core тестове (103) от предходния checkpoint остават непроменени.

---

## 7. Known limitations

### Planned next slices
- Interactive Drawing Tool Dock (създаване на measurement чрез клик, не само dev hook)
- Calibration UI (inline bar, D3)
- PropertyPanel (десен панел — rename/recolor/notes)
- Persistence / StorageAdapter (реален repository implementation)

### Tracked risks (вече в `docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md`)
- ISS-001 Split през съществуващ връх (PARKED)
- ISS-002 Extension sandbox сериализация (неизмерена)
- ISS-003 CONFIDENCE_THRESHOLD калибрация
- ISS-006 PWA/iOS Safari spike
- ISS-008 StorageAdapter/AssetRepository валидация при първа реална имплементация
- ISS-009 AI orchestration (`propose`/`AIContext`) — deferred slice

**Нов, все още незаписан риск, открит по време на този checkpoint:** Surface-space == CSS-pixel space опростяването (декларирано в CanvasStage/studioSession коментари) няма формален трекинг запис. В момента е безобидно (само blank surfaces съществуват), но щом влязат Image/Map surfaces с pan/zoom, всяка hit-test/chip-позиция/click координата ще се нуждае от истинска Surface↔screen трансформация — засяга `CanvasStage.svelte`, `studioSession.selectMeasurementAt`, `sceneRenderer.ts`, `centroid.ts` консуматорите. Препоръка: заведете като ISS-010 при следващия docs sync (вижте §8).

### Intentionally out of current scope
- Интерактивно чертане (Tool Dock) — изрично не част от петте именувани commit-а
- Vertex editing UI
- Split UI
- AI ghost UI
- Report/Export UI
- Workspace switching UI
- Extensions панел

---

## 8. Documentation drift check

| Документ | Находка |
|----------|---------|
| `docs/26_ADR/ADR-006-ui-framework.md` §"Отворено за следваща UI задача" | **Drift.** Все още пише "state management стратегия... избира се при integrate CommandStack стъпката" като отворен въпрос — но той е решен именно в тази стъпка (`72cb087`: module-level Svelte stores, обосновано inline в `studioSession.ts`). Решението никога не е било backfill-нато в ADR-006 самия. Препоръка: кратко addendum към ADR-006 (по модела на ADR-001-те addendum), не пренаписване. |
| `docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` | **Липсващ запис**, не грешен — новият pan/zoom/coordinate-mapping риск (§7) няма ISS номер. |
| `docs/APPLICATION_LAYER_REVIEW.md` | Без drift — вече синхронизиран (`e8d3f04`) с находката за ESLint resolver-а; остава точен. |
| `docs/15_UX_SPECIFICATION.md` / `docs/16_DESIGN_SYSTEM.md` | Без drift — построеното е **подмножество** на документираните wireframes/компоненти (Shell, MeasurementChip, MeasurementList), не разминаване с тях. Липсващите части (Tool Dock, PropertyPanel, StatusBar съдържание) са неизградени, не грешно изградени. |
| `docs/21_ARCHITECTURE.md` | Без drift — UI framework изборът живее в ADR-006 по дизайн (ADR-ите допълват, не изискват inline редакция на главния документ). |

**Заключение:** Два малки, ниско-рискови docs fix-а чакат (ADR-006 addendum + нов ISS-010) — не направени в този checkpoint по изричната инструкция "нула production код"; docs redaction извън заявения файл също не е добавена без потвърждение.

---

## 9. UI gate status

| Условие | Статус |
|---------|--------|
| Петте планирани UI commit-а изпълнени | ✅ |
| Canvas и Measurement List използват един Shape източник | ✅ проверено на живо |
| Двупосочна selection синхронизация | ✅ проверено на живо, в двете посоки |
| Keyboard interaction | ✅ проверено на живо (списък); чертане/платно клавиатурно — не съществува още |
| 133 теста | ✅ зелени |
| tsc / svelte-check / eslint | ✅ чисти |
| UI→Application граница | ✅ емпирично потвърдена (след поправка) |
| Adapters граница | ⚠️ непроверена — нулева implementation повърхност все още |

**Заключение: Checkpoint milestone PASSED.** Studio е доказан скелет с реален, не симулиран data flow от Core до пиксел и обратно. Следващият slice е първият, който ще добави **потребителски достижим** вход (drawing или persistence), не само вътрешна демонстрация през dev hook.

---

## 10. Recommendation for the next implementation slice

Сравнение по петте измерения, поискани от PO:

| Кандидат | Dependency readiness | Product value | Architectural risk | Тестируемост | Отключва други функции |
|----------|----------------------|----------------|----------------------|----------------|---------------------------|
| **Interactive Drawing Tool Dock** | **Висока** — DrawingEngine (18), CommandStack, Shape rendering, hit-testing вече построени и тествани; остава само UI tool-state orchestration | **Много висока** — това е F1 North Star flow-ът, буквалната причина продуктът съществува; без него всичко построено досега е demo, не продукт | Ниско-средно — архитектурата вече го предвижда (Command factories съществуват); рискът е в UX state machine (in-progress polygon, snap visual), не в граници | Средна — interaction-heavy, но Core частите (100%) вече тествани; UI orchestration тества се по вече доказания модел от commit 4/5 (live pixel/DOM verification) | **Много високо** — Split UI, vertex editing, calibration reference line, AI ghost commit UI всички се нуждаят от base drawing interaction first |
| **Calibration UI** | Висока — CalibrationService (19§3) 100% тестван, `recalibrateCommand` готов | Висока, но по-тясна — пълната стойност идва само с реален Import/Map surface за календриране; на blank canvas е демонстрируемо, но не е "истинската" употреба | Ниско — следва same proven store→command pattern | Висока — Core частта е чиста функция, вече тествана | Средно — отключва реални единици (не само px), но самото календриране изисква drawing на референтна линия — **меко зависи от поне минимална drawing способност**, което на практика я поставя след Tool Dock в реда |
| **PropertyPanel** | Средна — избраното вече съществува, но rename/recolor изисква **нова** Application команда (не сред построените 8) преди панелът да прави нещо отвъд read-only | Средна — полезно за организация (08 §П2/П3), не е core "измери нещо" стойност | Ниско | Висока — same pattern | Ниско-средно — основно самостоятелно; хоства Extensions панела по-нататък (12§4), но това е няколко стъпки по-нататък |
| **Persistence / StorageAdapter** | Средна — портовете съществуват (Application), но **`src/adapters/` не съществува изобщо** — това е нова архитектурна повърхност, не UI wiring върху готово | Висока в дългосрочен план (никой не иска да губи работа при refresh), но не блокира по-нататъшна feature разработка сега | **Средно** — първата реална Adapter имплементация = вторият истински тест на ESLint boundary правилото (adapters↔application), точно каквато находка имахме с ui↔application в §4 | Висока — 22§7 вече дефинира contract-test методологията (fake+реална implementation срещу еднакъв suite) | Средно-високо — Home "Recent projects" (в момента празно, защото нищо не persist-ва), Report persistence, multi-device (PD-012) — но не отключва други **UI** функции пряко |

**Препоръка: Interactive Drawing Tool Dock.**

Обосновка накратко: единствен кандидат с едновременно най-висока product value И най-високо "отключва други функции" — и двете следствие от едно и също нещо: той е базовата interaction способност, върху която Split UI, vertex editing, calibration (реалната референтна линия), и AI ghost commit UI всички стъпват. Dependency readiness е практически пълна (нищо на Core/Application ниво липсва) — рискът е изцяло в UI orchestration, вид риск, който вече доказахме, че можем да носим и верифицираме (commit 4/5 живата pixel/DOM методология директно приложима).

Calibration UI е близък втори избор, но носи мека зависимост от чертане (нужна е линия за референтна дължина) — секвенирането Tool Dock → Calibration е естествено, не произволно.

Persistence остава важна, но е различен ТИП работа (нова Adapter архитектурна повърхност, не UI wiring) — заслужава собствен, фокусиран slice с contract-test методологията, не бързане редом с друго.

PropertyPanel е с най-нисък приоритет — блокирана е от липсваща Application команда (rename/recolor не съществува), а основната ѝ бъдеща роля (host на Extensions) е няколко стъпки по-нататък в roadmap-а.

**Не е започната никоя от тези опции. Чакам изрично одобрение за коя да продължа.**
