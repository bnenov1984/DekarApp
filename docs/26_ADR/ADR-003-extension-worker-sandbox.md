# ADR-003 — Extension Sandbox: Web Worker изолация

**Статус:** Accepted (PD-018 Условие A, 2026-07-14)
**Отговаря на:** "Как се налага PD-014 (Extension никога не пише данни) технически?" — решено в 21 §7, типово в 23 §5.

## Контекст

PD-014: Extensions консумират изчислени стойности, никога не мутират данни. PermissionTag (15 §20) декларира договора към потребителя — но UI декларация без техническа граница е обещание по конвенция.

## Решение

Extension код се изпълнява в **Web Worker**: без DOM достъп, без Repository референции, вход само `ExtensionContext` (23 §5 — `ReadonlyMeasurementSnapshot` без Shape поле, без write методи), изход само `DisplayResult[]` през postMessage. Забраната е структурна: write API **не съществува в типа**, не е "забранен".

Изгражда се **сега**, при first-party extensions (PD-011), защото retrofit след отваряне на P-04 (SDK за трети страни) би засегнал всеки съществуващ extension.

## Последици

- Extension crash/timeout не сваля приложението (Worker изолация); host показва "Extension unavailable" (23 §8).
- Contract тестът (22 §7) активно опитва забранени операции отвътре и проверява структурен провал.
- **Известен, приет trade-off (PD-018 т.7):** postMessage сериализация на голяма multi-select снимка е неизмерен overhead. Решение на PO: **benchmark first, не се оптимизира преждевременно** — ако измерването покаже проблем, отговорът е batch/throttle на сериализацията, никога премахване на sandbox границата. Проследява се като ISS-002 (27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md).
