# Tool Dock Checkpoint Review

**Дата:** 2026-07-15
**Обхват:** Interactive Drawing Tool Dock slice — трите commit-а след `docs/UI_CHECKPOINT_REVIEW.md` (`aee9b93` docs housekeeping вече прегледан там; `9b506fb` feat, `44b19e6` test — новите тук).
**Правило на документа:** Само преглед на вече свършеното + препоръка за следваща стъпка, същия формат като предходния checkpoint. Нула production код тук.

---

## 1. Scope completed

Studio вече може, реално, не хипотетично:

- **Потребителят чертае** — за първи път от началото на UI имплементацията. Всичките шест инструмента работят: Select, Rectangle (drag), Polygon (click-по-връх), Circle (drag), Freehand (trace), Distance/Line (click-click).
- Показва **живи числови стойности** (площ/дължина) до курсора, докато чертаенето е в процес — синтетичен Shape, никога минаващ през `drawingEngine.create()`, само display (`computeMeasurementDisplay`, вече съществуващ).
- Прилага **реален snap** (не placeholder): връх/ръб/ъгъл 0°/45°/90°/self-close, през вече тествания `snap.ts` без промяна в него.
- `Esc` отменя чертенето без следа; `Enter`/двоен клик затваря полигон; click-по-първия-връх (self-snap) затваря полигон без да добавя допълнителен връх.
- Клавишни shortcuts: `V/R/P/C/F/D` за инструменти, `S` за snap toggle, `Shift`-задържане при активиране на инструмент за серийно чертене.
- **Auto-select + връщане на Select** след всяко завършено чертене (освен при serial-armed).
- Всяка нарисувана фигура минава през **същия CommandStack път** като dev hook/AI ghost commit (PD-013) — потвърдено структурно (виж §4).
- Undo/Redo обхваща и новочертани фигури (вече обхванато инвариантно от CommandStack, потвърдено емпирично тук за drawing-специфичния path).

Това, което Studio **все още не може**: Pan/zoom на платното, Curve инструмент, AI detect, Import, календриране, property панел, персистентност между презареждания — всички извън обхвата на този slice (виж §7).

---

## 2. Commit range и роля на всеки commit

| # | Hash | Заглавие | Роля |
|---|------|----------|------|
| 1 | `aee9b93` | `docs: close UI checkpoint drift and record UI checkpoint review` | Housekeeping преди новата feature работа — ADR-006 addendum, ISS-010 запис, UI_CHECKPOINT_REVIEW.md commit. Вече прегледан в предходния checkpoint; включен тук само за пълнота на диапазона. |
| 2 | `9b506fb` | `feat(ui): interactive drawing Tool Dock` | Цялата нова способност в един cohesive commit (не изкуствено разделен по файл-редове, тъй като store/dock/canvas wiring/shortcuts са взаимно зависими до степен, че никоя частична версия не е независимо разбираема): `drawingSession.ts`, `ToolDock.svelte`, `sceneRenderer.ts` (ghost preview + snap glyphs), `CanvasStage.svelte` (pointer routing по активен инструмент), `Studio.svelte` (shortcuts), `StatusBar.svelte` (snap индикатор). |
| 3 | `44b19e6` | `test(ui): cover drawingSession tool interactions` | 19 нови теста — отделен `test:` commit по CONTRIBUTING.md типовете таблица (тестове без production код промяна). |

---

## 3. Проверени user flows

Всички проверени **на живо в браузъра** (Chrome preview, реални `MouseEvent`/`KeyboardEvent` dispatch-и, четени през dev hook + accessibility snapshot + screenshot), не само unit тестове:

| Flow | Как е проверено |
|------|-------------------|
| Rectangle: mousedown→drag→mouseup commit | `MouseEvent` dispatch на реалния `<canvas>`; резултатна `Measurement` (origin/width/height) прочетена през `__areaflowDev` hook |
| Polygon: click-по-връх натрупване + self-snap затваряне при ≥3 точки | 3 click-а + click близо до първия връх → commit с точно 3 върха (без добавяне на 4-ти closing връх) |
| Live label по време на чертене | `data-testid="draft-label"` DOM текст прочетен между кликове — "1250 px²" за триъгълник (10,10)/(60,10)/cursor(60,60), математически коректно |
| Circle: drag radius | commit с `radius` = точното drag разстояние |
| Freehand: отворена следа (release далеч от старта) | `closed: false`, ≥2 точки в резултата |
| Freehand: затворена следа (release близо до старта) | `closed: true` |
| Distance/Line: click-click commit + жива дължина | live label "50 px" между двата клика; commit при втория клик без нужда от Enter |
| `Esc` отменя чертене без следа, без смяна на инструмента | draft → `null`, `activeTool` непроменен (остава на чертожния инструмент) |
| Клавишни shortcuts (`C` за Circle, `F` за Freehand, `S` за snap toggle) | `KeyboardEvent('keydown')` dispatch на `window` → `activeTool`/`snapEnabled` коректно променени |
| Auto-return към Select след commit | `activeTool` == `'select'` след всяко не-serial чертене |
| Undo маха прясно нарисувана фигура | `measurements.length` 7→6 след `undo()` |
| Select tool click-to-select — регресия непокътната | click вътре в правоъгълник → `selectedMeasurementId` коректно сменен; screenshot потвърждава accent контур |

---

## 4. Проверени архитектурни инварианти

| Инвариант | Статус |
|-----------|--------|
| PD-013 — AI/manual/Tool Dock споделят един commit path | ✅ `drawingSession.commitDraft()` вика **същия** `createMeasurementCommand`, нула отделен "draw create" path |
| `drawingEngine.create()` е единствената validation порта, вика се само при commit | ✅ Потвърдено структурно — `buildShapeParams()` никога не импортира/вика `create()`; синтетичните preview Shape-ове минават директно към `computeMeasurementDisplay`, никога към `createMeasurementCommand` |
| Drawing Engine (`snap.ts`, `geometry.ts`, `formulas.ts`) консумирани непроменени | ✅ Нулева промяна в `src/core/**` за целия slice — потвърдено с `git diff --stat` преди commit |
| UI → Application → Core посока на зависимост | ✅ `drawingSession.ts` внася от `core/drawing`, `core/domain`, `application/commands`, `ui/stores` (studioSession) — никога обратното |
| Canvas никога не притежава геометрия (ADR-002) | ✅ `drawInProgress`/`drawSnapGlyph` в `sceneRenderer.ts` остават чисти/параметризирани, четат draft/snap данни подадени отвън |

---

## 5. Accessibility verification

**Проверено:**
- ToolDock: `role="toolbar"`, `aria-pressed` на активния слот, tooltip = име + shortcut, стрелки ляво/дясно местят фокуса между слотовете (16 §3.1 изискване) — имплементирано и типово проверено (`svelte-check` 0 грешки/предупреждения след `tabindex="-1"` поправка).
- Snap индикатор в StatusBar е реален бутон (native focus + click), не декоративен текст.

**Не е проверено / не съществува още** (честно декларирано, същия принцип като предходния checkpoint):
- **Клавиатурно чертене** (15 §12.1 — стрелки местят прицел, Enter поставя връх) — не съществува. Дока и shortcuts работят с клавиатура, но самото чертене изисква мишка/pointer events.
- **Live region announcements** (15 §12.2 — "Vertex added...") — не съществуват, защото клавиатурното чертене (нужният тригер) не съществува.
- Фокус-ринг на платното при чертене (различен от selection ring) — не е отделно имплементиран.

Тези два пункта бяха предварително flag-нати като disclosed gap в implementation плана за този slice ("бърз accessibility follow-up slice"), не пропуснати мълчаливо.

---

## 6. Test and static-analysis results

```
Test Files  15 passed (15)
Tests       152 passed (152)   [133 preexisting + 19 нови в drawingSession.test.ts]
tsc --noEmit       exit 0
svelte-check       353 files, 0 errors, 0 warnings
eslint .           exit 0
```

---

## 7. Known limitations

### Intentionally out of scope (декларирано в implementation плана преди началото на работата)
- **Pan (`H`)** — няма Surface↔screen viewport transform все още (ISS-010, вече заведен в предходния checkpoint). Няма да се build-не фалшиво преди трансформацията да съществува.
- **Curve (`B`)** — Bézier control-point UX не е достатъчно специфициран (15 казва само "Bézier/spline") за безопасна имплементация без собствен кратък design pass.
- **AI (`✦`)** — ISS-009, самостоятелен Application slice.
- **Import (`+`)** — ISS-008, изисква StorageAdapter.
- **Ротация чрез drag дръжка** за правоъгълници — property-panel/vertex-editing грижа (15 §14.5), извън обхвата тук.

### Tracked risks (актуализация върху вече съществуващи записи)
- **ISS-010** (Surface-space == CSS-pixel-space) сега има **втори консуматор**: `drawingSession.ts`'s pointer→Surface конверсия (наследена директно от `CanvasStage.svelte`'s съществуващо опростяване, никаква нова инстанция на проблема — точно предвидено в самия ISS-010 текст при завеждането му). Не изисква нов запис, само потвърждение, че прогнозата се сбъдна.
- Останалите ISS-001…009 от `docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` непроменени от този slice.

### Нов, все още незаписан наблюдателен пункт
Freehand "затворена ли е" решението (self-close distance-check при release) използва същия `SNAP_TOLERANCE_SURFACE_UNITS` (8) като vertex/edge snap — работи добре за тестваните мащаби, но не е формално валидирано срещу много бързо/грубо начертани форми (потребител, който пуска far from start но случайно минава близо). Нискорисково, не блокира — маркирам за наблюдение при реални потребителски тестове, не за незабавно действие.

### Intentionally out of current scope (повторение от плана, за пълнота на checkpoint формата)
- Vertex editing UI, Split UI, AI ghost UI, Report/Export UI, Workspace switching UI, Extensions панел, Persistence.

---

## 8. Documentation drift check

| Документ | Находка |
|----------|---------|
| `docs/UI_CHECKPOINT_REVIEW.md` §10 | Без drift — препоръката там ("Interactive Drawing Tool Dock") е точно изпълнена от този slice; документът е point-in-time snapshot и не се редактира ретроактивно, само се надгражда с този нов review. |
| `docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` (ISS-010) | Без drift — записът вече изрично предвиждаше `drawingSession.ts` като бъдещ консуматор на риска (виж §7 по-горе); реализацията потвърждава прогнозата, не я противоречи. |
| `docs/15_UX_SPECIFICATION.md` §13/§14 | Без drift — implementираните shortcuts/interaction patterns са точно подмножество на специфицираните (Pan/Curve/AI клавиши просто не са закачени за нищо още, не работят грешно). |
| `docs/16_DESIGN_SYSTEM.md` §3.1 ToolDock | Без drift — implementацията следва описанието буквално (`role=toolbar`, ≤10 слота, tooltip формат, active state). |

**Заключение:** Нула drift, нула housekeeping дълг оставен след този slice.

---

## 9. Gate status

| Условие | Статус |
|---------|--------|
| Шестте инструмента чертаят и commit-ват реални Measurement-и | ✅ проверено на живо |
| Един и същ commit path за ръчно/AI/dev-hook (PD-013) | ✅ структурно потвърдено |
| Live numeric feedback по време на чертене | ✅ проверено на живо |
| Реален snap (vertex/edge/angle/self-close) | ✅ self-close проверено функционално на живо; vertex/edge/angle покрити от съществуващите `snap.test.ts` (9 теста, непроменени) + нови `drawingSession.test.ts` интеграционни проверки |
| Undo обхваща нарисувани фигури | ✅ проверено на живо |
| Select-tool регресия | ✅ непокътната, проверено на живо |
| 152 теста | ✅ зелени |
| tsc / svelte-check / eslint | ✅ чисти |
| Core слой недокоснат | ✅ `git diff --stat` потвърждава нула промени в `src/core/**` |
| Docs drift | ✅ нула, виж §8 |

**Заключение: Checkpoint milestone PASSED.** F1 North Star flow-ът (15 §5) е сега реално ходим path — потребител може да отвори Studio и да начертае измерване с мишка, от нула до commit-нат Measurement, без dev hook.

---

## 10. Recommendation for the next implementation slice

Съгласно вече одобрената последователност (PO, при review на `UI_CHECKPOINT_REVIEW.md`): **Tool Dock → Calibration UI → PropertyPanel/vertex editing → Split → Persistence → AI**.

**Calibration UI** е следващата стъпка. Обосновката от предходния checkpoint остава валидна и сега е по-силна: тогава Calibration UI носеше "мека зависимост" от чертане (нужна е реално начертана референтна линия) — тази зависимост вече е затворена, защото Distance/Line инструментът съществува и работи (§3 по-горе). `CalibrationService` (19 §3) е 100% тестван от по-рано; остава само UI wiring по вече доказания модел (store → command → live label), директно аналогичен на това, което Distance/Line инструментът тук вече демонстрира работещо.

Не е започната работа по Calibration UI. Чакам потвърждение преди да продължа.
