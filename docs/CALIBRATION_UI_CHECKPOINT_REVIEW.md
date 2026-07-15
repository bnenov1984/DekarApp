# Calibration UI Checkpoint Review

**Дата:** 2026-07-15
**Обхват:** Calibration UI slice — двата commit-а след `docs/TOOL_DOCK_CHECKPOINT_REVIEW.md` (`58bf27d` feat, `3730636` test).
**Правило на документа:** Само преглед на вече свършеното + препоръка за следваща стъпка, същия формат като предходните два checkpoint-а. Нула production код тук.

---

## 1. Scope completed

Studio вече може, реално, не хипотетично:

- **Потребителят декларира мащаб.** Клик върху ScaleChip (StatusBar) → CalibrationBar подсказва "Draw a line along a known distance" → две клика чертаят референтна линия → числово поле `[value] [m▾]` до средата на линията → Enter → Surface-ът получава реален `Calibration`.
- Съществуващите измервания **живо преизчисляват** дисплея си: тествано е директно — правоъгълник от 10000 px² стана 25 m² веднага след Enter, без презареждане, без допълнителен код (`measurementEngine.compute` вече е чиста функция на (Shape, Calibration) — нищо тук не пипна нея).
- **ScaleChip показва актуалния мащаб** постоянно (`⚖ 1 px = 0.05 m` / `⚖ Not calibrated`) и е кликаем за рекалибриране по всяко време — не само при първо календриране.
- **Non-blocking plausibility warning** (US-033): implausible мащаб оцветява ScaleChip в warning цвят + tooltip с конкретните implied размери ("This scale makes the surface ~114000m × 182800m — is that right?") — проверено на живо с умишлено абсурден вход.
- `Esc` анулира календрирането без следа по всяко време; `Redraw` изчиства само линията, оставайки в календриращ режим.
- **Рекалибрирането е undo-емо** — минава през същия CommandStack path (`recalibrateCommand`, вече съществуващ и тестван) като всичко останало; проверено на живо (`undo()` върна `calibration` към `null`).
- Tool Dock се деактивира по време на календриране (визуално `disabled` + функционален guard) — календриране и чертане никога не се преплитат.

Това, което все още **не е** налично: автоматично стартиране на CalibrationBar при Import (Import не съществува, ISS-008); warning стил на MeasurementChip за некалибрирани измервания (15 §5 F2 стъпка 4); Map/geo Surface поддръжка в ScaleChip (не е достижимо все още — няма Map surfaces).

---

## 2. Commit range и роля на всеки commit

| # | Hash | Заглавие | Роля |
|---|------|----------|------|
| 1 | `8ade47e` | `docs: record Tool Dock checkpoint review` | Предходният checkpoint — вече прегледан там, включен само за диапазон. |
| 2 | `58bf27d` | `feat(ui): Calibration UI` | Цялата нова способност в един cohesive commit (същата логика като Tool Dock checkpoint-а — store/bar/canvas wiring/StatusBar са взаимно зависими): `calibrationSession.ts`, `CalibrationBar.svelte`, `StatusBar.svelte` (ScaleChip), `CanvasStage.svelte` (pointer routing + числов вход), `ToolDock.svelte` (disabled state), `Studio.svelte` (mount + Escape wiring), `sceneRenderer.ts` (`drawCalibrationLine`). |
| 3 | `3730636` | `test(ui): cover calibrationSession flows` | 15 нови теста — отделен `test:` commit по установената конвенция (CONTRIBUTING.md типове). |

---

## 3. Проверени user flows

Всички проверени **на живо в браузъра**, реални `MouseEvent`/`KeyboardEvent`/`input` dispatch-и, четени през dev hooks + accessibility snapshot + screenshot:

| Flow | Как е проверено |
|------|-------------------|
| ScaleChip показва "Not calibrated" на некалибриран Surface | accessibility snapshot преди всяко календриране |
| Клик на ScaleChip стартира календриране + деактивира Tool Dock | `calibrating === true`, `tool-rectangle` бутон `disabled === true` |
| CalibrationBar текстът минава през и трите състояния | "Draw a line..." → "Click the other end..." → "Confirm the real-world length below" |
| Числовият input се появява и получава фокус автоматично | `document.activeElement === calibration-value input` (ръчен `.focus()` след DOM insert, не `autofocus` атрибут — a11y lint причина, виж CanvasStage.svelte коментар) |
| Enter в полето потвърждава календрирането | `Surface.calibration` = точната `{kind:'linear', metersPerPixel: 0.05}` стойност за 200px=10m вход |
| **Живо преизчисляване на съществуващо измерване** | Правоъгълник 200×50 px (10000 px²) → "25 m²" в Measurement List веднага след Enter, без ръчно опресняване |
| ScaleChip текстът се обновява следствие | "⚖ 1 px = 0.05 m" |
| Undo връща календрирането | `calibration` → `null` след `undo()`, ScaleChip → "Not calibrated" |
| `Esc` анулира по средата на чертане на линията, без следа | `calibrating === false`, CalibrationBar изчезва |
| `Redraw` изчиства линията, остава в календриращ режим | `calibrationDraft === null`, `calibrating === true` |
| Implausible мащаб → warning стил + tooltip | `classList` съдържа `warning`; `title` = "This scale makes the surface ~114000m × 182800m — is that right?" за умишлено абсурден 10px=5000m вход |

---

## 4. Проверени архитектурни инварианти

| Инвариант | Статус |
|-----------|--------|
| Рекалибриране минава през същия CommandStack path (undo-емо по конструкция, ADR-001) | ✅ Потвърдено на живо — `undo()` след `commitCalibration` |
| `CalibrationService`/`recalibrateCommand`/`measurementEngine` недокоснати | ✅ Нулева промяна в `src/core/**` и `src/application/commands/recalibrate.ts` за целия slice — потвърдено с `git diff --stat` преди commit |
| Референтната линия е **транзитна**, никога Measurement | ✅ Структурно потвърдено — `calibrationSession.ts` никога вика `createMeasurementCommand`, само `recalibrateCommand` |
| Календриране и чертане не се преплитат | ✅ `startCalibration()` вика `setTool('select')`; Tool Dock `disabled` по време на календриране; глобалните tool shortcuts (V/R/P/C/F/D) са guard-нати зад `$calibrating` в `Studio.svelte` |
| UI → Application → Core посока на зависимост | ✅ `calibrationSession.ts` внася от `core/calibration`, `core/drawing`, `application/commands`, `ui/stores` — никога обратното |

---

## 5. Accessibility verification

**Проверено:**
- ScaleChip и CalibrationBar-ните бутони (`Redraw`/`Cancel`) са реални `<button>` елементи — нативен focus/click.
- Числовият вход получава фокус чрез явен `.focus()` след DOM insertion, не чрез `autofocus` атрибута (`svelte-check` a11y lint го флагна и предпочитанието towards explicit focus management беше приложено) — резултатът е същият UX, но без изненадващо фокус поведение за screen reader потребители, каквото `autofocus` атрибутът би причинил при неочаквано зареждане.
- `Escape` в полето за unit (`<select>`) вече не тригира глобалните tool shortcuts (`isTypingTarget` guard в `Studio.svelte` разширен с `'SELECT'` — открито и поправено по време на имплементацията, не след live проверка: натискането на "f" в unit dropdown-а би тригирало Freehand shortcut-а едновременно с browser native typeahead, ако не беше guard-нато).

**Не е проверено / не съществува още:**
- Warning tooltip-ът (`title` атрибут) е screen-reader достъпен само индиректно (native `title` behavior, не ARIA live announcement) — приемливо за v1, но не е пълноценен a11y announcement path.
- Числовият вход не е тестван с реален screen reader за label association (`aria-label`/`<label>` липсва — визуалният "This line is" текст е декоративен `<span>`, не формален label). Дребен, нискорисков пропуск за следващ polish pass.

---

## 6. Test and static-analysis results

```
Test Files  16 passed (16)
Tests       167 passed (167)   [152 preexisting + 15 нови в calibrationSession.test.ts]
tsc --noEmit       exit 0
svelte-check       356 files, 0 errors, 0 warnings
eslint .           exit 0
```

---

## 7. Known limitations

### Intentionally out of scope (декларирано в плана преди началото на работата)
- **Auto-trigger при Import** — Import не съществува (ISS-008). ScaleChip е manual-only еквивалент, проектиран да поеме auto-trigger-а без преработка, когато Import кацне.
- **MeasurementChip warning стил за некалибрирани измервания** (15 §5 F2 стъпка 4) — реален UI polish елемент, но не е нужен, за да работи самото календриране; държан извън обхвата нарочно.
- **Map/geo Surface** — `Calibration.kind === 'geo'` не е достижим (няма Map surfaces); ScaleChip просто не рендира за този kind (defensive clause, неупражнена).

### Tracked risks (нов запис)
- **Плаузибилити проверката използва viewport CSS-pixel размера като заместител на "истински pixel размер на Surface-а"** — декларирана опростяваща предпоставка в плана преди работата (същата категория като ISS-010). Blank Surfaces нямат собствено понятие за extent; веднъж влязат Image/PDF surfaces с реален raster размер, тази проверка трябва да чете истинските pixel dimensions на асета, не viewport-а на браузъра. **Препоръка: заведете като ISS-011 при следващия docs sync** (аналогично на ISS-010 workflow-а от предходния checkpoint) — не е направено тук по правилото "нула production код в review".
- Плаузибилити резултатът се кешира само в момента на календриране, не се преизчислява при resize на прозореца — приемливо (viewport размерът рядко се променя драстично по средата на сесия), но е дребна, нискорискова несъответствие с "напълно реактивен" модел.

### Intentionally out of current scope (повторение за пълнота)
- Vertex editing UI, PropertyPanel, Split UI, AI ghost UI, Report/Export UI, Workspace switching UI, Extensions панел, Persistence.

---

## 8. Documentation drift check

| Документ | Находка |
|----------|---------|
| `docs/TOOL_DOCK_CHECKPOINT_REVIEW.md` §10 | Без drift — препоръката ("Calibration UI, зависимостта от чертане вече затворена") е точно изпълнена. |
| `docs/19_IMPORT_EXPORT.md` §3 | Без drift — `fromReferenceLine`/`assessPlausibility` използвани точно по договора, нула промяна в самия файл. |
| `docs/15_UX_SPECIFICATION.md` §5 F2 / W3 | Частично подмножество, не drift — авто-тригерът от Import не е имплементиран (изрично декларирано в плана като scope constraint), но целият останал flow (ScaleChip клик → линия → числов вход → Enter → ScaleChip обновен) следва F2/W3 копирайтинга буквално. |
| `docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` | **Липсващ запис, не грешен** — новият viewport-как-Surface-extent риск (§7 по-горе) няма ISS номер още. |

**Заключение:** Един housekeeping елемент чака (нов ISS-011) — не направен в този checkpoint по изричното правило "нула production код тук", по същия begin модел като ISS-010 в предходния review.

---

## 9. Gate status

| Условие | Статус |
|---------|--------|
| ScaleChip старт/рекалибриране, CalibrationBar трите състояния | ✅ проверено на живо |
| Референтна линия — транзитна, не Measurement | ✅ структурно потвърдено |
| Живо преизчисляване на съществуващи измервания | ✅ проверено на живо (10000 px² → 25 m²) |
| Рекалибрирането е undo-емо | ✅ проверено на живо |
| Esc / Redraw | ✅ проверено на живо |
| Plausibility warning стил + tooltip | ✅ проверено на живо |
| Tool Dock деактивиран по време на календриране | ✅ проверено на живо |
| Core/Application слой недокоснат | ✅ `git diff --stat` потвърждава нула промени извън `src/ui/**` |
| 167 теста | ✅ зелени |
| tsc / svelte-check / eslint | ✅ чисти |
| Docs drift | ⚠️ един нов ISS запис чака (виж §7/§8) |

**Заключение: Checkpoint milestone PASSED** (с една дребна, нискорискова housekeeping точка за следващия docs sync). F2/W3 Import-независимата половина на календрирането е сега реално ходим path.

---

## 10. Recommendation for the next implementation slice

Съгласно вече одобрената последователност (PO): **Tool Dock → Calibration UI → PropertyPanel/vertex editing → Split → Persistence → AI**.

**PropertyPanel + Vertex Editing** е следващата стъпка. И двете споделят инфраструктура (десен панел за селектираното измерване; vertex editing е директна манипулация на вече селектирана Polygon/Freehand фигура) и логично следват сега, когато потребителят може реално да чертае (Tool Dock) и да календрира (тази стъпка) — двата основни входа за съдържание вече съществуват; следващата естествена нужда е да редактираш вече начертаното. `editVertex`/`addVertex`/`removeVertex` в `drawingEngine.ts` вече са 100% тествани и чакат UI wiring — същия модел като предходните два slice-а.

Не е започната работа по PropertyPanel/Vertex Editing. Чакам потвърждение преди да продължа.
