# Persistence Checkpoint Review

**Дата:** 2026-07-15
**Обхват:** Persistence slice — двата commit-а след `docs/SPLIT_CHECKPOINT_REVIEW.md` (`7f3747e` feat, `3b00033` test).
**Правило на документа:** Само преглед на вече свършеното + препоръка за следваща стъпка, същия формат като предходните пет checkpoint-а. Нула production код тук.

---

## 1. Scope completed

За разлика от предходните четири slice-а (UI wiring върху вече готов Core/Application код), този затвори **нова архитектурна повърхност** — `src/adapters/` не съществуваше изобщо преди този slice:

- **Първата реална Adapters-layer имплементация** — точно ISS-008-ото собствено условие за валидиране ("validate at the moment of the first real StorageAdapter implementation").
- **IndexedDB-backed `StorageAdapter`, `ProjectRepository`, `SurfaceRepository`** (ADR-004), всеки с in-memory fake и **споделен contract test suite** (22_TDD.md §7) — fake-ът и реалната имплементация минават **един и същ** suite, доказвайки поведенческа еквивалентност, не просто поотделно тествани.
- **Autosave** (PD-012 D6, "без Save бутон") — създаване на Project/Surface и всяко сетнало се командно изпълнение (execute/undo/redo) persist-ва fire-and-forget.
- **Реален "Recent" списък на Home** (15 §6 W4) — истински карти от `ProjectRepository.list()`, клик зарежда Project + Surface(и) обратно в Studio.
- **`StorageQuotaExceededError`** (23 §8) — типизирана грешка, хваната на call site-а, показана ненатрапчиво в StatusBar.

**Проверено на живо, не само в unit тестове:** нарисувано измерване → истинска проверка чрез директно IndexedDB inspection (не dev hook) потвърждава Project+Surface реално записани → пълен презареждане на страницата → Recent картата се появява с точната площ → клик я зарежда → Studio показва точно същото измерване → продължено чертане на заредената сесия autosave-ва коректно (потвърдено пак чрез директен IndexedDB read).

Това, което все още **не е** налично: SettingsRepository/ReportRepository (нищо не ги консумира още); Cloud Sync (PD-012 стъпала 2-3); File System Access blob вариант; loading skeleton за Recent списъка; реална live репродукция на quota-exceeded (обяснено защо в §7).

---

## 2. Commit range и роля на всеки commit

| # | Hash | Заглавие | Роля |
|---|------|----------|------|
| 1 | `3419455` | `docs: record Split checkpoint review` | Предходният checkpoint — вече прегледан там, включен само за диапазон. |
| 2 | `7f3747e` | `feat: Persistence` | Цялата нова архитектурна повърхност в един cohesive commit: нов `application/ports/storageAdapter.ts` порт, `src/adapters/indexeddb/**` (реални имплементации), `src/adapters/memory/**` (fakes), `projectSummary.ts` (споделена total-area логика), `ui/stores/persistence.ts` (composition root), autosave wiring в `appState.ts`/`studioSession.ts`, Recent списък в `Home.svelte`, storage грешка в `StatusBar.svelte`. |
| 3 | `3b00033` | `test: cover Persistence adapters and contract suites` | Три contract suite-а + техните fake/real test файлове + `persistence.test.ts` (quota грешка) — отделен `test:` commit по установената конвенция. |

---

## 3. Проверени user flows

Всички проверени **на живо в браузъра** — **пряка IndexedDB инспекция** (не dev hook четене на in-memory store), реален page reload, не симулиран:

| Flow | Как е проверено |
|------|-------------------|
| Създаване на Blank проект autosave-ва веднага | `indexedDB.open('areaflow')` директна заявка към `projects`/`surfaces` object stores потвърждава реални записи веднага след чертане |
| Пълен page reload → Recent картата показва точната площ | "Untitled — 8000 px²" карта се появява след `window.location.reload()`, точно съвпада с нарисуван 100×80 правоъгълник |
| Клик на Recent картата зарежда целия проект в Studio | Measurement List, canvas рендиране, ScaleChip — всичко коректно възстановено |
| Заредената сесия остава напълно жива, не read-only snapshot | Ново начертан кръг върху заредената сесия → незабавно потвърден в реалния IndexedDB запис (2 измервания, съвпада с in-memory) |
| Autosave няма видима латентност/блокиране | Всички horní действия (чертане, презареждане, зареждане) се усещат мигновени, никакъв loading spinner не бе нужен |

---

## 4. Проверени архитектурни инварианти

| Инвариант | Статус |
|-----------|--------|
| INV-8 — `ProjectRepository.delete` каскадира към всеки референциран Surface | ✅ Contract тест (и двете имплементации) — Surface не оцелява изтриването на своя Project |
| INV-3 — `SurfaceRepository.save` е атомарен | ✅ Contract тест — презапис никога не се наблюдава наполовина приложен |
| Fake и реалната имплементация са поведенчески еквивалентни (22 §7) | ✅ Един и същ contract suite, изпълнен два пъти; `computeTotalArea` е споделен код между fake/real `ProjectRepository.list()`, не дублирана логика — не могат да се разминат |
| StorageAdapter остава резервиран за blob съхранение, не generic route за структурирани данни | ✅ Repositories ползват собствени IndexedDB object stores директно; `StorageAdapter` документира тази граница в собствения си коментар |
| UI → Application → Adapters посока на зависимост | ✅ `persistence.ts` (composition root) внася от `adapters/indexeddb`, `application/ports` — Core/Application недокоснати от IndexedDB типове |
| Split/vertex-editing/calibration логиката недокосната | ✅ `git diff --stat` потвърждава нула промяна извън новите/изрично изброените модифицирани файлове |

---

## 5. Accessibility verification

**Проверено:**
- Recent картите и storage-error банерът са реални DOM елементи (`<button>`/`<span>`), нативен focus/click.

**Не е проверено / не съществува още:**
- Loading indicator по време на `ProjectRepository.list()` заявката — не е добавен (декларирано в плана като умишлено пропуснато, IndexedDB четенето е близо до мигновено при този обем данни).
- Live region announcement при успешен/неуспешен autosave — не съществува; storage-error банерът е визуален текст, не ARIA live announcement.

---

## 6. Test and static-analysis results

```
Test Files  25 passed (25)
Tests       229 passed (229)   [195 preexisting + 30 нови adapter contract теста + 4 нови persistence.test.ts теста]
tsc --noEmit       exit 0
svelte-check       383 files, 0 errors, 0 warnings
eslint .           exit 0
```

---

## 7. Known limitations

### Intentionally out of scope (декларирано в плана преди началото на работата)
- **SettingsRepository/ReportRepository** — и двата frozen портове, но нищо в приложението не чете/пише `AppSettings` или генерира `Report` още. Имплементирането им сега би било строене за нужда, която все още не съществува.
- **Cloud Sync** (PD-012 стъпала 2-3) — изрично разположено по-късно в същото PD.
- **File System Access API** blob вариант (ADR-004: "Phase 4 преценка") — само IndexedDB blob съхранение тази слайс.
- **Реална репродукция на quota-exceeded условие** — браузърните квоти обикновено са гигабайти, нереалистично да се провокират в live проверка. Покрито с unit тест, който форсира типизираната грешка на call site-а (`persistence.test.ts`) — честно декларирано като environment-dependent, същия модел като AI plausibility-warning бележката от Calibration checkpoint-а.
- **Loading skeleton за Recent списъка** — пропуснато умишлено, IndexedDB четенето при този обем данни е близо до мигновено.

### Real gap found and fixed during this slice (не production код промяна извън самата слайс, документирано за прозрачност)
`ProjectSummary.totalArea` е бил `number | undefined` без единица — двусмислено веднъж щом Calibration UI вече съществува (Surface може да отчита px или реална единица). Поправено с добавяне на `totalAreaUnit?: Unit` към порта (`ports/projectRepository.ts`) — обосновано в самия коментар на полето: v1 ограничението "един Surface на Project" е това, което пази изчислението еднозначно днес; ще се нуждае от преразглеждане, ако multi-surface проекти влязат в бъдеще.

### Tracked risks (нищо ново тази слайс)
- ISS-010/ISS-011 кандидатите от предходните checkpoint-и остават непроменени — Persistence не добавя нов viewport-свързан риск.

---

## 8. Documentation drift check

| Документ | Находка |
|----------|---------|
| `docs/SPLIT_CHECKPOINT_REVIEW.md` §10 | Без drift — препоръката ("Persistence, различен тип работа, нова adapters/ повърхност") е точно изпълнена. |
| `docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` (ISS-008) | **Затворено чрез имплементация, не docs commit** — ISS-008 искаше точно "валидирай при първата реална StorageAdapter имплементация"; тази слайс Е тази имплементация. Формалното маркиране на ISS-008 като RESOLVED в implementation issues документа е малък housekeeping commit, останал за следващия docs sync (същия модел като ISS-010/ISS-011 преди него). |
| `docs/26_ADR/ADR-004-indexeddb-local-storage.md` | Без drift — имплементацията следва решението буквално (IndexedDB, StorageAdapter.transaction() маппинг директно на IndexedDB transactions). |
| `docs/APPLICATION_LAYER_REVIEW.md` §2 | Малко уточнение, не drift — `ProjectSummary.totalAreaUnit` добавката е дребно прецизиране на вече прегледан порт, не нова архитектурна посока (документирано inline в самия порт файл). |

**Заключение:** Нула нов drift освен housekeeping-а по-горе. ISS-008 формалното затваряне + ISS-011 формалният запис от предходния checkpoint продължават да чакат следващия docs-only sync — нито едното блокира нищо.

---

## 9. Gate status

| Условие | Статус |
|---------|--------|
| StorageAdapter/ProjectRepository/SurfaceRepository, fake + real, един contract suite | ✅ проверено — 30 теста, и двете имплементации зелени |
| INV-8 каскадно изтриване, INV-3 атомарност | ✅ проверено в contract теста |
| Autosave без Save бутон, без видима латентност | ✅ проверено на живо |
| Recent списък зарежда точния проект обратно | ✅ проверено на живо, включително пълен page reload |
| Заредената сесия остава напълно жива (не read-only) | ✅ проверено на живо |
| StorageQuotaExceededError path | ✅ unit тест (live репродукция нереалистична, честно декларирано) |
| Core/Application слой недокоснат извън изрично изброените портове | ✅ `git diff --stat` потвърждава |
| 229 теста | ✅ зелени |
| tsc / svelte-check / eslint | ✅ чисти |
| Docs drift | ✅ нула нов (housekeeping чака, не блокира) |

**Заключение: Checkpoint milestone PASSED.** Продуктът вече реално пази работата на потребителя между сесии — първият slice, чиято стойност буквално оцелява презареждане на страницата.

---

## 10. Recommendation for the next implementation slice

Съгласно вече одобрената последователност (PO): **Tool Dock → Calibration UI → PropertyPanel/Vertex Editing → Split → Persistence → AI**.

**AI (ghost detection / commit path)** е последната стъпка от оригиналния roadmap. `commitGhostCommand` вече съществува и е тестван (делегира буквално към `createMeasurementCommand`, PD-013 инвариант) — липсва само `AIContext.propose()`/оркестрацията (ISS-009, изрично deferred при Application layer review-то) и самият UI (Ghost preview, Accept/Reject жестове, 15 §18). Това е **реален AIProvider adapter** slice, аналогичен по тип работа на Persistence (нова Adapters-layer повърхност: `AIProvider` порт + fake + реална имплементация — вероятно mock/stub модел или реален API интеграция, PO решение), не UI wiring върху готово.

Преди да продължа, две отворени точки заслужават кратко PO решение:
1. **AIProvider избор**: mock/stub детекция за демонстрация на UI потока, или реална интеграция с модел от ден 1?
2. **ISS-008 формално RESOLVED маркиране** в `PHASE_4_IMPLEMENTATION_ISSUES.md` — housekeeping, може да се съчетае със следващия slice's docs sync.

Не е започната работа по AI. Чакам потвърждение (и отговор на горните две точки) преди да продължа.
