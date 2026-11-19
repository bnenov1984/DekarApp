# 19 — Import / Export Engine

**Статус:** Draft v1 за одобрение от PO
**Мандат (Bible):** Import Engine (v1 обхват по PD-011: PNG/JPG/PDF/Google Maps) + Export Engine (PNG/JPEG/PDF/CSV/JSON — PDF съществува като два различни артефакта, Picture и Report, PD-029/§5).
**Позиция в модела:** Bounded Context (14 §1), downstream от Measurement (чете стойности за отчет), upstream спрямо Surface provisioning (произвежда Surface aggregate). Затваря празнина, оставена отворена от 11/14: **къде живее Calibration establishment логиката** — отговорът е тук (§3).

---

## §1. Граница на отговорност

Два потока в един context, защото и двата боравят с превода между "вън от системата" и "вътре в системата":

- **Import**: външен файл/Map → Surface aggregate (провизиране, не мутация на съществуваща геометрия — това е Drawing Engine).
- **Export**: Project/Surface данни → артефакт извън системата (PNG/PDF/CSV/JSON), плюс Report като конфигурационен entity (14 §2.2).

### Изрично НЕ прави
- Не смята измервателни стойности (Measurement Engine, 17) — Import/Export само ги *чете* при export, никога не ги произвежда.
- Не мутира Shape (Drawing Engine, 18) — Import провизира нова Surface с празни Layers, не пипа съществуваща геометрия.
- Не решава кой Extension се показва в отчета — това е Workspace конфигурация (12 §6), Import/Export само изпълнява генерирането по подадена конфигурация.
- Не решава бизнес логика по формата на отчета (кое поле къде стои) — това е Workspace отчетен template (12 §2.6); Import/Export Engine е изпълнител, не автор на template-а.

---

## §2. Import pipeline

```
File/Map source
    → format detection & validation
    → (Image/PDF) blob съхранение през StorageAdapter (21 §5.2)
      (Map) не се съхранява blob — само geo viewport (11 §7)
    → Surface entity създаден (14 §2.1), Calibration = null (px режим) за Image/PDF
      или Calibration = geo-referenced (born-calibrated) за Map (11 §6)
    → SurfaceRepository.save() (23 §3.1) — атомарен запис на празната Surface (без Layers/Measurements все още)
```

### 2.1. Image (PNG/JPG)

Директно raster зареждане; Surface = едно платно, едно Calibration слот. Некалибрирано по подразбиране — CalibrationBar (15 §5 F2) подканва, но не блокира.

### 2.2. PDF

**Всяка страница е отделна Surface** (решение вече взето в 11 §1.1, потвърдено тук като pipeline детайл): parse на PDF произвежда N Surface entities, всяка със собствен `Calibration = null`. Ако PDF съдържа котиран мащаб (напр. "1:1000" в заглавния блок), **Import Engine не го извлича автоматично в v1** — това би било OCR/parsing способност извън PD-011 обхвата; потребителят календрира ръчно (F2), както при обикновено изображение. PDF рендерът към raster (за canvas показване) е implementation detail на Phase 4 (PDF.js или еквивалент), не архитектурно решение тук.

**Първа реализирана резка (grilling сесия, 2026-11-18): само едностраничен PDF.** Многостраничният path по-горе остава валидният целеви дизайн, но все още не е построен — защото нищо в UI днес не позволява навигация между повече от един Surface в един Project (няма Surface-tab превключвател; `appState.ts`'s `surfaces`/`activeSurfaceId` вече подготвят структурата, но никой компонент не я чете отвъд първия елемент). PDF с повече от 1 страница се отхвърля изрично (`MULTI_PAGE_NOT_SUPPORTED`, назовава броя страници в съобщението) — никога тихо само първата страница. Рендерът е PDF.js (`pdfRender.ts`), 2x база 96 DPI (~192 ефективни) — достатъчно остро за трасиране при zoom, без цената на истинска печатна резолюция. Оригиналният PDF blob се пази (не снимка) — същия "source, не derived bitmap" избор като `image` Surface-ите; декодира се наново при всяко отваряне.

### 2.3. Map

Не е "import" на файл — Surface се провизира директно през `MapProvider.search`/viewport избор (21 §8.1, 23 §4). Ражда се **вече калибрирана** (гео координати = собствената си истина, 11 §6) — CalibrationBar никога не се появява за Map Surface. Tiles не се персистират (11 §7) — Surface пази `(centerCoordinates, zoom, bounds)`, не растерни данни; при отваряне tiles се дърпат наново през `MapProvider.getTile`.

---

## §3. Calibration Service — липсващата брънка

11/14 дефинираха Calibration като VO, притежаван от Surface, но не и **как** се произвежда. Определям го тук, защото establishment-ът е част от Surface provisioning потока (F2), не от Drawing или Measurement Engine отговорностите (нито едното от двете engine-та трябва да знае за "потребител тегли линия по позната дължина" UX концепцията — това е orchestration между тях).

```ts
CalibrationService.fromReferenceLine(
  pixelDistance: number,      // измерено от Drawing Engine Line shape, в Surface space
  realLength: number,         // потребителски вход, 15 §5 F2 стъпка 3
  unit: Unit
): Calibration
```

Чиста функция (както Measurement Engine, 17 §2) — `Calibration = realLength / pixelDistance` по същество, опакован като VO. **Не живее в Measurement Engine**, защото Measurement Engine приема Calibration като готов вход (17 §2 договор), не го произвежда — разделянето пази 17 фокусиран единствено върху "geometry + calibration → values", без production логика за самия calibration.

**Рекалибриране** (11 §4/§6, US-032) минава през същата функция — нов `Calibration` VO заменя стария в Surface aggregate-а; `SurfaceRepository.save()` (атомарно, INV-3) отключва Measurement Engine преизчисление на всички Measurements на тази Surface.

**Sanity warning (US-033):** Calibration Service излага и `assessPlausibility(calibration, surfaceDimensions): PlausibilityResult` — не блокира, само маркира ScaleChip в warning стил (15 §16) при нереалистичен резултат (напр. подразбиращ 2km стая). Прагът за "нереалистично" е конфигурируем по Surface тип (Image срещу Map имат различни разумни граници) — Phase 4 детайл, не архитектурно решение тук.

---

## §4. Export pipeline — Report като снимка (INV-11, PD-015)

```
Report generation trigger (15 F6)
    → избор на Measurements (подмножество или всички)
    → Measurement Engine.compute() извикан за всяко (пресни стойности към момента на generate)
    → замразяване в ReportSnapshot VO (не референции към живи Measurement обекти)
    → рендериране по формат (§5)
    → ReportRepository пази конфигурацията + "last generated" маркер
    → артефактът (файл) напуска системата — не се пази (11 §7)
```

**Актуализация (2026-07-14, Application Layer Review):** По-ранна версия на този параграф описваше ReportRepository като "част от ProjectRepository" (14 §2.2 показва Report като entity под Project в ownership дървото — това си остава вярно за *притежанието/cascade delete*). Логическата **порт граница**, срещу която Application слоят реално пише код, е **отделен `ReportRepository`** (`src/application/ports/reportRepository.ts`), не метод на `ProjectRepository`. Обосновка: генерирането на Report е append-only операция върху immutable snapshot-и (INV-11) — структурно различна операционна форма от CRUD-with-mutation lifecycle-а на Project (create/rename/archive/delete). Ownership (11 §2 дървото) и port granularity (кой interface Application-ът вика) са два различни въпроса; предишната формулировка ги сливаше. Физическото съхранение може да остане в същата база (ADR-004) — това е implementation detail зад порта, не пипа тази граница.

**INV-11 буквално тук:** `ReportSnapshot` е value object, копие на стойностите в момента на извикване — последваща редакция на Measurement не пипа вече генериран snapshot. Ако потребителят генерира отчет отново, нов `ReportSnapshot` се произвежда (нов timestamp), старият не се презаписва мълчаливо (маркерът в 11 §6 "отчетът е отпреди промените" остава четим за стари snapshot-и, ако Phase 4 реши да ги пази история — не е задължително за v1, само не се губи възможността).

---

## §5. Формати

| Формат | Съдържание | Генериране |
|--------|-----------|------------|
| **PNG / JPEG (Picture)** | "Screenshot" на текущо видимото съдържание: composite на canvas rendering слоевете (21 §6.2: raster background + vector overlay) **плюс** иначе DOM-only текстовите overlay-та (name/value чип, vertex labels, edge-length labels — ако `showEdgeLengths` е включен), fit-to-content, без selection highlight, плътен фон, мащабна декларация (виж по-долу) | `src/ui/export/pictureExport.ts` — reuse на `sceneRenderer.ts`'s `drawMeasurements` (не преоткрива композицията), плюс собствен Canvas2D text pass за текстовите overlay-та; **не минава през `ReportSnapshot`** — директен, живи-данни рендер в момента на клик, няма frozen snapshot entity (PD-029) |
| **PDF (Picture)** | Същата картина като PNG/JPEG по-горе, само опакована в едностраничен PDF контейнер (`src/ui/export/pdfWrap.ts`, ръчно съставен single-image PDF — без зависимост от PDF-authoring библиотека) | PD-029 — **изрично различно** от реда "PDF (Report)" по-долу: няма заглавна страница, таблица, template; 1 PDF unit = 1 px, няма print/paper-size договор |
| **PDF (Report)** | Структуриран документ по 12 §6 принципите: заглавна страница+сумарна стойност, мащабна декларация, таблица на измерванията, ✦ provenance бележки, брандиране (P-02 зависимост за gate) | Template-driven по Workspace отчетен template (12 §2.6); данните идват от `ReportSnapshot` — **все още непостроен** (PD-015 остава концептуален, PD-029 не го засяга) |
| **CSV** | Ред на Measurement: име, тип, area, perimeter, unit, provenance (US-061 полета) | `src/ui/export/csvExport.ts` — директна серилизация на живите Measurement данни (не `ReportSnapshot` — същата забележка като PNG/JPEG по-горе) |
| **JSON** | Пълна структурирана снимка (същите полета като CSV + coordinates/vertices за програмна консумация) | Серилизация на `ReportSnapshot` + geometry references — все още непостроен |

**Мащабна декларация (12 §6.2) е задължително поле във всеки формат, който показва визуален контекст (PNG/JPEG/PDF Picture, и PDF Report)** — не козметика: "как е измерено" е доверителният подпис (09 J4). За PDF (Report) това е архитектурно наложено чрез задължително (non-nullable) поле в `ReportSnapshot`; за PNG/JPEG/PDF (Picture) (PD-029) е по-простата живи-данни версия — една текстова линия, долу вляво на картината, същата формула като StatusBar.svelte's ScaleChip (`src/ui/measurement/scaleLabel.ts`) — но принципът ("никога тихо изпуснат") е същият.

---

## §6. Грешки (15 §16 error states, 23 §8 taxonomy)

| Случай | Поведение |
|--------|-----------|
| Неразпознат/повреден файл при import | `Result.fail('UNSUPPORTED_FORMAT' \| 'CORRUPT_FILE')` — не throw; UI показва inline картата на несъстоялата се Surface (15 §16) |
| PDF с защита с парола | `Result.fail('PASSWORD_PROTECTED')` — извън v1 обхват да се разбива паролата; UI просто съобщава |
| PDF с повече от 1 страница (grilling 2026-11-18, §2.2 бележка по-горе) | `Result.fail('MULTI_PAGE_NOT_SUPPORTED')`, носи и броя страници — UI назовава точния брой ("This PDF has 12 pages…"), никога не внася само първата мълчаливо |
| Map provider недостъпен при провизиране | Delegира на `MapProvider` adapter грешка (23 §4/§8), Import Engine не добавя собствена логика отгоре |
| Export генериране неуспешно (напр. storage пълно за временен файл) | Application-level грешка (23 §8), стига до UI като toast, retry достъпен |

---

## §7. Testability (за 22)

- `CalibrationService.fromReferenceLine` — чиста функция, table-driven тестове (известни pixel/real двойки → очаквана Calibration).
- Import pipeline — integration тест с fake `StorageAdapter`: провизиране на Surface от валиден/невалиден файл, проверка на резултантния Surface state.
- PDF rendering (`pdfRender.ts`) — pdfjs-dist мокнат на модулно ниво (реален Worker + `<canvas>` 2D context липсват под vitest's default 'node' environment); тества се *decision logic*-ата (single-page accept, multi-page/password/corrupt reject), не реален PDF binary rendering.
- Export/Report — **INV-11 директен тест** (22 §3 вече го изисква): генерирай Report, редактирай Measurement, потвърди Report snapshot непроменен.
- PDF multi-page → N Surfaces с независими Calibration слотове (regression срещу случайно споделяне на calibration между страници).

---

## §8. Проверка срещу 11/14/17/21/23

| Тук | Произход |
|-----|----------|
| PDF страница = отделна Surface | 11 §1.1 (вече решено, тук - pipeline изпълнение) |
| Map ражда се калибрирана, tiles не се персистират | 11 §6, §7 |
| CalibrationService е чиста функция, отделна от Measurement Engine | 17 §2 договор (приема Calibration, не я произвежда) |
| Report = snapshot, INV-11 | PD-015, 14 §2.2, 22 §3 |
| Мащабна декларация задължителна в PNG/PDF | 12 §6 (Report as Product) |
| Import грешки като Result, не throw | 18 §2 конвенция приложена еднакво (23 §8) |
