# Phase 4 — Implementation Issues (backlog при старт на Engineering)

**Произход:** PHASE_3_REVIEW находки + PD-018 gate решения. Това са **имплементационни** въпроси — нито един не разширява Product Bible (изрично условие на PD-018 т.5). Всеки носи произход и acceptance ориентир.

| ID | Issue | Произход | Насока |
|----|-------|----------|--------|
| ISS-001 | **Split: линия през съществуващ връх на родителя.** Алгоритъмът (18 §5) изисква "точно 2 пресичания"; допир до връх е degenerate случай без explicit правило | PHASE_3_REVIEW §2/§5; PD-018 т.5 (PARKED от PO) | Дефинирай правилото при имплементация (кандидат: допирът до връх се брои като една пресечна точка; изисквай истинско второ edge пресичане). Добави golden fixture в 22 §5.2 набора. Не пипай PD-009 семантиката |
| ISS-002 | **Extension sandbox: postMessage сериализация на голяма multi-select снимка** — неизмерен overhead | PHASE_3_REVIEW §5; PD-018 т.7 (benchmark first) | Измери реален overhead при 50/200/1000 селектирани measurements **преди** каквато и да е оптимизация. Ако проблем: batch/throttle сериализацията. Sandbox границата (ADR-003) не се маха при никакъв резултат |
| ISS-003 | **CONFIDENCE_THRESHOLD калибрация** (20 §3) | PHASE_3_REVIEW §2; PD-018 (AQ-2: just-in-time) | Калибрирай срещу реални модел резултати; конфигурируемо, не hardcoded. Зависи и от P-05 (on-device vs cloud) |
| ISS-004 | **Гео golden котва: имплементационна проверка** (17 §4.1, 22 §5.1) | PD-018 т.8 (Engineering-only от тук нататък) | Първата задача на Measurement Engine имплементацията: golden тестът минава срещу реален код с реални координати. Merge gate, не follow-up |
| ISS-005 | **Undo bounded policy: конкретни стойности** (21 §4.4, ADR-001) | PD-018 Условие B (constraint документиран; стойностите — Engineering) | Избери operation cap или memory budget; профилирай с freehand-тежка сесия. Constraint-ът (евикция от дъното, INV-12 за задържаното) не подлежи на промяна |
| ISS-006 | **PWA/iOS Safari spike**: памет за големи PDF/изображения, файлова система, canvas performance | PHASE_2_REVIEW §5 (носено през PHASE_3_REVIEW §5, все още непроведено) | Ранен spike върху iPad Safari + реален голям кадастрален PDF, преди тежката UI имплементация |
| ISS-007 | **Конкретните Command типове** (Create/EditVertex/Split/Delete/Calibrate…) | PHASE_3_REVIEW §2 | Изброй и имплементирай срещу `Command<T>` (23 §3.2); всеки нов тип влиза с T-INV-12 round-trip тест (22 §3 правило) |
