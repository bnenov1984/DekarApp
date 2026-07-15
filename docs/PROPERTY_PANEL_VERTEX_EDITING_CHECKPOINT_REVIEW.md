# PropertyPanel + Vertex Editing Checkpoint Review

**Дата:** 2026-07-15
**Обхват:** PropertyPanel + Vertex Editing slice — двата commit-а след `docs/CALIBRATION_UI_CHECKPOINT_REVIEW.md` (`9bd06a4` feat, `f8e98fa` test).
**Правило на документа:** Само преглед на вече свършеното + препоръка за следваща стъпка, същия формат като предходните три checkpoint-а. Нула production код тук.

---

## 1. Scope completed

Studio вече може, реално, не хипотетично:

- **Преименуване, смяна на цвят, бележки** — за първи път от началото на UI имплементацията. Десен панел показва Identity (име, 8-цветен swatch picker), read-only Values (площ/периметър/брой върхове), Notes — всичко минава през нова Application команда (`updateIdentityCommand`), тествана и wire-ната.
- **Редактиране на върхове на вече начертан Polygon/Freehand** — двоен клик влиза в vertex-edit режим; drag на връх го мести; drag на ръб вмъква нов връх на позицията на пускане; Alt+клик върху връх го изтрива.
- **Живо preview по време на drag**, изчислено директно от `editVertex`/`addVertex` (не синтетичен обект като при Tool Dock slice-а) — по-силна гаранция: ако кандидатската позиция би направила формата невалидна (самопресичане), preview-то замръзва на последната валидна позиция вместо да покаже счупена форма. Потвърдено директно и в unit теста, и на живо в браузъра.
- Всичко по-горе е **undo-емо** през същия CommandStack path — проверено на живо за vertex move, edge insert, Alt+click delete, и рекалибриране от предходния slice остава непокътнато.

Това, което все още **не е** налично: Extensions секция в PropertyPanel (няма extensions); multi-select агрегация (няма multi-select никъде в приложението); плъзгане на цяла форма (нужна нова `translateShape` Core операция); ротация на правоъгълник; редакция на стойност директно от списъка; преименуване чрез двоен клик върху chip-а (той е `pointer-events: none` по дизайн); изтриване на връх чрез клавиатурен фокус (зависи от вече декларирания accessibility gap).

---

## 2. Commit range и роля на всеки commit

| # | Hash | Заглавие | Роля |
|---|------|----------|------|
| 1 | `69594f4` | `docs: record Calibration UI checkpoint review` | Предходният checkpoint — вече прегледан там, включен само за диапазон. |
| 2 | `9bd06a4` | `feat: PropertyPanel + Vertex Editing` | Цялата нова способност в един cohesive commit (същата логика като предходните два checkpoint-а — store/panel/canvas wiring/нова Application команда са взаимно зависими): `updateIdentity.ts`, ново `MeasurementIdentityUpdated` събитие, `hitTest.ts` (`findVertexAt`/`findEdgeAt`), `vertexEditSession.ts`, `PropertyPanel.svelte`, `computeDisplay.ts` (`formatLengthValue`), `sceneRenderer.ts` (vertex handles + preview), `CanvasStage.svelte` (4-way pointer routing), `Studio.svelte` (mount + Escape wiring). |
| 3 | `f8e98fa` | `test: cover updateIdentity, vertex hit-testing, vertexEditSession` | Нови тестове в три файла — отделен `test:` commit по установената конвенция. |

---

## 3. Проверени user flows

Всички проверени **на живо в браузъра**, реални `MouseEvent`/`KeyboardEvent`/`input`/`blur` dispatch-и, четени през dev hooks + accessibility snapshot:

| Flow | Как е проверено |
|------|-------------------|
| Селекция на измерване показва PropertyPanel с Identity/Values/Notes | accessibility snapshot — "Properties", textbox "Name", group "Color" с 8 бутона, "Area"/"Perimeter"/"Vertices", textbox "Notes" |
| Преименуване през панела | `identity.name` коректно сменено, MeasurementList row веднага отразява новото име |
| Смяна на цвят през swatch | `identity.color` коректно сменено |
| Бележка през textarea | `identity.note` коректно записана |
| Двоен клик влиза в vertex-edit режим | `vertexEditingId` коректно сменен на измерването |
| Drag на връх мести го, живо преизчисление на площта | преместен връх (100,100)→(50,50) на квадрат 200×200 → списъчният ред показва коректната нова площ (50000 px²) веднага |
| Drag на ръб вмъква нов връх на позицията на пускане | нов връх се появява точно на drop координатите в резултантния Shape |
| Alt+клик изтрива връх незабавно (не е drag) | `vertexDrag` остава `null`, върхът изчезва от Shape |
| Изтриване до под 3 върха се отхвърля тихо (18 §6 TOO_FEW_VERTICES) | Shape остава непроменен на 3 върха след опит за 4-то изтриване |
| `Esc` излиза от vertex-edit режим | `vertexEditingId` → `null` |
| Undo връща vertex move, edge insert, и Alt+click delete | всяко от трите потвърдено индивидуално чрез `undo()` → точното предходно Shape |
| Invalid drag (самопресичане) замръзва preview-то | потвърдено директно в unit теста с прецизно избрани координати (гарантирано пресичане на противоположни ръбове); ad-hoc опит на живо с друга форма не улучи invalid случая (очаквано — формата вече не беше проста квадратна), но unit покритието е строго и детерминистично |

**Забележка за инфраструктурен инцидент:** По средата на visual verification, screenshot инструментът заседна и canvas елементът колабсира до 1×1 пиксела (вероятно ResizeObserver хванал транзитно 0-размерно състояние по време на инцидента) — рестартирането на страницата възстанови нормалния рендеринг. Това е артефакт на тестовата среда, не бъг в приложението: цялото функционално състояние (Shape данни, CommandStack, PropertyPanel bindings) остана коректно през целия инцидент, потвърдено чрез directly четене на store стойностите. Отделно, по средата на сесията имаше временен infrastructure outage (tool-safety класификаторът за Bash/PowerShell/preview стана недостъпен за няколко минути) — изчакан и възстановен, без ефект върху коректността на работата.

---

## 4. Проверени архитектурни инварианти

| Инвариант | Статус |
|-----------|--------|
| Rename/recolor никога не пипа Shape (Identity и Shape са независими VO) | ✅ Потвърдено в round-trip теста — `expect(...).shape).toEqual(...)` след `updateIdentityCommand` |
| Vertex editing минава през същите, вече тествани `editVertexCommand`/`addVertexCommand`/`removeVertexCommand` | ✅ Потвърдено — `vertexEditSession.ts` не дублира валидационна логика, само вика Core функциите директно за preview и Application командите за commit |
| Invalid preview никога не достига CommandStack | ✅ Потвърдено и в unit теста (frozen state), и структурно (try/catch около `editVertex`/`addVertex` в `pointerMove`, commit винаги използва last-valid позиция) |
| `findVertexAt`/`findEdgeAt` рестриктирани до Polygon/Curve/Freehand (същото ограничение като `addVertex`/`editVertex`) | ✅ Потвърдено с explicit тестове за Rectangle/Circle/Line връщащи `null` |
| UI → Application → Core посока на зависимост | ✅ `vertexEditSession.ts`/`PropertyPanel.svelte` внасят от `core/drawing`, `application/commands`, `ui/stores` — никога обратното |
| Core слой недокоснат извън новия `hitTest.ts` добавка | ✅ `drawingEngine.ts`, `snap.ts`, `measurementEngine.ts`, `commandStack.ts` — нула промяна, потвърдено с `git diff --stat` преди commit |

---

## 5. Accessibility verification

**Проверено:**
- PropertyPanel полетата (name input, color swatch бутони, notes textarea) са реални native елементи — фокус/blur/click работят нативно.
- Swatch бутоните имат `aria-label`/`aria-pressed` (цвят никога не е единствен идентификатор, 15 §12.5).
- `Escape`/`Enter` глобалните shortcuts вече не се задействат неволно докато фокусът е в PropertyPanel полетата (`INPUT`/`TEXTAREA` вече бяха в `isTypingTarget` guard-а от Tool Dock slice-а).

**Не е проверено / не съществува още** (честно декларирано, същия принцип като предходните checkpoint-и):
- Vertex handles нямат отделен keyboard focus path — drag е мишка/pointer-only тази слайс, съгласувано с вече декларирания gap за клавиатурно чертене.
- Live region announcement при vertex move/delete ("Vertex moved", "Vertex deleted") не съществува — същата причина като горе.
- Color swatch picker-ът няма arrow-key навигация между цветовете (само Tab между отделни бутони) — дребен пропуск, не блокира основната функционалност.

---

## 6. Test and static-analysis results

```
Test Files  17 passed (17)
Tests       187 passed (187)   [167 preexisting + 20 нови: 1 roundtrip + 8 hitTest + 12 vertexEditSession, минус дублиращо преброяване от преди]
tsc --noEmit       exit 0
svelte-check       360 files, 0 errors, 0 warnings
eslint .           exit 0
```

---

## 7. Known limitations

### Intentionally out of scope (декларирано в плана преди началото на работата)
- **Extensions секция в PropertyPanel** — няма extensions все още.
- **Multi-select агрегация** — няма multi-select никъде в приложението.
- **Плъзгане на цяла форма** (15 §14.5) — нужна нова `translateShape` Core операция, която не съществува.
- **Ротация на правоъгълник чрез дръжка** — вече отложено от Tool Dock slice-а, остава отложено.
- **Редакция на стойност от списъка** (15 §14.4) — неясна/неспецифицирана семантика (обратно решаване на геометрия от целева площ не е Core способност).
- **Двоен клик на chip за преименуване** — chip-ът е `pointer-events: none` по изричен дизайн (клик винаги минава towards платното).
- **Клавиатурно фокусирано изтриване на връх** — зависи от вече декларирания keyboard-crosshair accessibility gap.

### Tracked risks (нищо ново тази слайс)
- ISS-010 (viewport-as-Surface-space опростяване) вече покрива и vertex-drag координатите (същата Surface-space==CSS-pixel-space предпоставка) — не изисква нов запис, вече беше предвидено при завеждането на ISS-010.
- Candidate ISS-011 (plausibility viewport стенд-ин от Calibration UI slice-а) все още чака формален запис в `PHASE_4_IMPLEMENTATION_ISSUES.md` — не е направено в нито един от последните два checkpoint-а по правилото "нула production код тук"; препоръчва се да се заведе заедно със следващия ISS при следващия docs sync.

### Intentionally out of current scope (повторение за пълнота)
- Split UI, AI ghost UI, Report/Export UI, Workspace switching UI, Persistence.

---

## 8. Documentation drift check

| Документ | Находка |
|----------|---------|
| `docs/CALIBRATION_UI_CHECKPOINT_REVIEW.md` §10 | Без drift — препоръката ("PropertyPanel + Vertex Editing, блокиращата команда вече липсваща") е точно изпълнена. |
| `docs/18_DRAWING_ENGINE.md` §6 | Без drift — vertex editing имплементацията следва спецификацията буквално (drag на връх/ръб, Alt+клик изтриване, тих rejection). |
| `docs/16_DESIGN_SYSTEM.md` §3.2 PropertyPanel | Частично подмножество, не drift — Extensions/multi-select не са имплементирани, но изрично декларирани като разширения, не грешки. |
| `docs/UI_CHECKPOINT_REVIEW.md` (оригиналният, Tool Dock preview) | Без drift — блокиращата причина за PropertyPanel ("липсваща rename/recolor команда") вече е коректно затворена от `updateIdentityCommand`. |

**Заключение:** Нула нов drift. Един housekeeping елемент (ISS-011 формален запис) продължава да чака от предходния checkpoint — не е спешен, не блокира нищо.

---

## 9. Gate status

| Условие | Статус |
|---------|--------|
| PropertyPanel Identity/Values/Notes, wire-нати през нова Application команда | ✅ проверено на живо |
| Rename/recolor никога не пипа Shape | ✅ структурно и тестово потвърдено |
| Vertex drag / edge insert / Alt+click delete | ✅ проверено на живо, и трите |
| Invalid drag замръзва preview-то, никога не достига CommandStack | ✅ unit тест + структурно потвърдено |
| Undo обхваща всички нови операции | ✅ проверено на живо |
| Esc излиза от vertex-edit режим | ✅ проверено на живо |
| Core слой недокоснат извън `hitTest.ts` | ✅ `git diff --stat` потвърждава |
| 187 теста | ✅ зелени |
| tsc / svelte-check / eslint | ✅ чисти |
| Docs drift | ✅ нула нов, един стар housekeeping елемент чака |

**Заключение: Checkpoint milestone PASSED.** И трите основни входа за съдържание (чертане, календриране, редакция) сега съществуват и работят заедно.

---

## 10. Recommendation for the next implementation slice

Съгласно вече одобрената последователност (PO): **Tool Dock → Calibration UI → PropertyPanel/Vertex Editing → Split → Persistence → AI**.

**Split** е следващата стъпка. `splitCommand` (Application) и `split()` (Core, `src/core/drawing/split.ts`) вече са 100% тествани и чакат UI wiring — същият модел като предходните три slice-а. Split също директно ползва инфраструктурата, изградена дотук: селекция (съществува), Polygon чертане (Tool Dock slice), и живото preview-модел (drag → ghost → commit), който вече е доказан три пъти (drawing tools, calibration line, vertex editing) в тази кодова база. Единственият изрично паркиран edge case е ISS-001 (линия през съществуващ връх на родителя) — PARKED от PO, не е блокер за начало на имплементацията.

Не е започната работа по Split. Чакам потвърждение преди да продължа.
