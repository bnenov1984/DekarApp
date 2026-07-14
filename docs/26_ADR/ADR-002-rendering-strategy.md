# ADR-002 — Rendering: Canvas2D + успореден DOM (не pure SVG, не pure Canvas, не WebGL)

**Статус:** Accepted (PD-018 Условие A, 2026-07-14)
**Отговаря на:** "С какво се рисува платното?" — решено в 21 §6.

## Контекст

Live computation при всяко движение (15 §14.2), freehand с хиляди точки, professional сесии с десетки измервания (Performance First). Едновременно: WCAG 2.2 AA със пълен канвас еквивалент (15 §12).

## Решение

**Canvas2D за платното** в два слоя (raster фон + vector overlay, отделно прерисуеми, 21 §6.2) + **успореден DOM** (Measurement List) като accessibility път.

Ключът към решението: D8 (15 §12) вече дефинира Measurement List като пълната a11y алтернатива на платното — успореден DOM **трябва** да съществува независимо от рендер избора. Това елиминира главния аргумент за pure SVG (native accessibility) и оставя Canvas2D да спечели по performance. WebGL е overkill за 2D векторна геометрия в PD-011 обхвата.

## Последици

- Hit-testing се пише ръчно (Canvas няма DOM events per фигура) — 21 §6.3.
- Двете проекции (canvas + DOM списък) се захранват от **един** Shape/Measurement VO поток — не два модела (21 §10.2); разминаване между тях е bug по конструкция, не възможна конфигурация.
- A11y parity checklist (22 §9) е задължителният тест на този ADR.
