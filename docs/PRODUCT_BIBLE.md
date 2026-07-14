# AreaFlow – Product Bible v1.0 (FROZEN)

**Status:** 🟢 Frozen v1.0 · 🔒 **READ-ONLY от 2026-07-14 (PD-020)** — този документ и целият docs корпус не се редактират тихо; продуктова еволюция само през нови записи в [05_PRODUCT_DECISIONS.md](05_PRODUCT_DECISIONS.md) ("какво") и [26_ADR/](26_ADR/) ("как"). Engineering получава корпуса като contractual input (PD-018/020).
**Purpose:** Единствен източник на истина (Single Source of Truth) за продукта AreaFlow.

---

## Product Philosophy

AreaFlow не е просто Area Calculator.
AreaFlow е **Spatial Intelligence Platform**.

Основната цел е да направи пространствените измервания максимално лесни, точни и достъпни.

Философия:

> **Simple enough for beginners. Powerful enough for professionals.**

---

## Product Vision

Да създадем най-интуитивната платформа за:

- измерване на площ
- периметър
- разстояния
- пространствен анализ

върху:

- Google Maps
- изображения
- PDF
- CAD
- архитектурни планове
- сателитни снимки

---

## Core Principles

1. Simplicity First
2. Visual First
3. Zero Learning Curve
4. Progressive Disclosure
5. AI Assisted
6. Workspace Driven
7. Modular by Design
8. Offline Friendly
9. Performance First

---

## Product Architecture

```
                    AreaFlow
                        │
         ┌──────────────┴──────────────┐
         │                             │
    Core Platform                User Experience
         │                             │
┌────────┼────────┐          ┌─────────┼─────────┐
│        │        │          │         │         │
Drawing Measurement Import  Workspaces Extensions AI
Engine   Engine     Engine
```

---

## Platform Strategy

**Web-first (PWA)**

Причини:

- една кодова база
- Windows / macOS / Linux / Android / iOS
- offline support
- лесно разпространение
- cloud-ready

---

## Core Engines

### Drawing Engine

Отговаря за:

- Polygon
- Rectangle
- Circle
- Curve
- Freehand
- Vertex Editing
- Snap
- Undo/Redo

### Measurement Engine

Отговаря само за геометрията. Изчислява:

- Area
- Perimeter
- Distance
- Angles
- Radius
- Diameter
- Coordinates

Без бизнес логика.

### Import Engine

Поддържа:

- PNG
- JPG
- TIFF
- PDF
- SVG
- DWG
- DXF
- Google Maps
- OpenStreetMap (future)

### Export Engine

Поддържа:

- PNG
- PDF
- CSV
- JSON

---

## Workspaces

AreaFlow използва **един общ Measurement Engine**.
Различните професии използват различни Workspaces.

Планирани Workspaces:

- General
- Real Estate
- Surveying
- Construction
- Roofing
- Landscaping
- Agriculture
- Medical

Всеки Workspace използва едно и също ядро. Различават се само:

- интерфейс
- панели
- шаблони
- отчети
- настройки

---

## Extensions (Modules)

AreaFlow е разширяема платформа. Основното приложение остава леко.
Професионалните функции се добавят чрез Extensions.

Планирани Extensions:

- Roof Estimator
- Paint Calculator
- Flooring Calculator
- Fence Calculator
- Irrigation Planner
- Solar Planner
- Landscape Planner
- Medical Analysis

Extensions използват вече изчислените данни. **Не извършват повторно измерване.**

---

## AI Strategy

- AI подпомага потребителя.
- AI не извършва необратими действия без потвърждение.

Бъдещи AI функции:

- Boundary Detection
- Object Recognition
- Room Detection
- Roof Detection
- Smart Suggestions
- Automatic Reports

---

## UX Principles

Интерфейсът трябва да бъде:

- модерен
- чист
- визуален
- минималистичен

**Вдъхновение:** Figma, Canva, Google Maps

**Не:** AutoCAD, инженерски панели, претрупани менюта

---

## Development Methodology

| Phase | Focus | Съдържание |
|-------|-------|------------|
| Phase 1 | Product Discovery | Документи. Без код. |
| Phase 2 | UX Design | Wireframes, Mockups, Design System |
| Phase 3 | Architecture | Domain, TDD, API |
| Phase 4 | Development | Frontend, Backend, QA |

---

## Product Bible Structure

```
/docs
  00_PRODUCT_MANIFESTO.md
  01_PRODUCT_VISION.md
  02_PRD.md
  03_PRODUCT_PRINCIPLES.md
  04_PRODUCT_GUARDRAILS.md
  05_PRODUCT_DECISIONS.md
  06_MARKET_ANALYSIS.md
  07_COMPETITIVE_ANALYSIS.md
  08_PERSONAS.md
  09_USER_JOURNEYS.md
  10_USER_STORIES.md
  11_INFORMATION_ARCHITECTURE.md
  12_WORKSPACES.md
  13_EXTENSIONS.md
  14_DOMAIN_MODEL.md
  15_UX_SPECIFICATION.md
  16_DESIGN_SYSTEM.md
  17_MEASUREMENT_ENGINE.md
  18_DRAWING_ENGINE.md
  19_IMPORT_EXPORT.md
  20_AI_STRATEGY.md
  21_ARCHITECTURE.md
  22_TDD.md
  23_API.md
  24_MONETIZATION.md
  25_ROADMAP.md
  26_ADR/
  27_NOTES/
```

---

## PRODUCT_GUARDRAILS (Summary)

Всички AI агенти и разработчици трябва да спазват следните правила:

1. Product Bible е единственият източник на истина.
2. Не се добавят нови функционалности без одобрение.
3. UX има приоритет пред технологичните решения.
4. Простотата е по-важна от броя функции.
5. Core Engines не съдържат бизнес логика.
6. Workspaces и Extensions не променят ядрото.
7. AI подпомага, но не замества потребителя.
8. Всяко предложение трябва да бъде аргументирано.
9. Конкурентите се анализират, но не се копират.

---

## PRODUCT_DECISIONS (Initial)

| ID | Decision | Status |
|----|----------|--------|
| PD-001 | Web-first (PWA) | ✅ Approved |
| PD-002 | Measurement Engine като независимо ядро | ✅ Approved |
| PD-003 | Drawing Engine отделен от бизнес логиката | ✅ Approved |
| PD-004 | Workspaces | ✅ Approved |
| PD-005 | Extensions (Modules) | ✅ Approved |
| PD-006 | AI като асистент | ✅ Approved |
| PD-007 | UX-first процес | ✅ Approved |
| PD-008 | Product Bible като Single Source of Truth | ✅ Approved |
