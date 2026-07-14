# 20 — AI Strategy (Engine Specification)

**Статус:** Draft v1 за одобрение от PO
**Мандат (Bible):** AI подпомага потребителя; не извършва необратими действия без потвърждение. v1 функция по PD-011: Boundary Detection.
**Позиция в модела:** Bounded Context (14 §1), консуматор на Drawing Engine (произвежда Shape кандидат), никога директен консуматор на Measurement/Repository. Формализира Ghost lifecycle (14 §5/§8) в изпълнима оркестрация; обвързва `AIProvider` (21 §8.2, 23 §4) с UX договора от 15 §18 и решението PD-013 (AI-forward, human-committed).

---

## §1. Граница на отговорност

### Прави
- Оркестрира заявка към `AIProvider.detectBoundary` (23 §4) и управлява резултата като session-scoped Ghost.
- Прилага confidence policy (§3) — филтрира какво изобщо стига до потребителя.
- Превежда commit жест в нормална Drawing Engine операция (§4).
- Гарантира INV-5 (14 §4: Ghost никога не се персистира) на архитектурно ниво, не по конвенция.

### Изрично НЕ прави (PD-013 guardrail проверка)
- Не решава геометрия — Shape кандидатът идва готов от `AIProvider`; AI Context не пипа vertex позиции.
- Не пише в Repository никога, докато Ghost е в proposed състояние — единственият path към persisted данни минава през explicit commit (§4), който е неразличим архитектурно от ръчно чертане.
- Не автоматично приема нищо — липсва timer, липсва auto-accept код path (22 §10 PD-013 regression тест го проверява буквално).
- Не съдържа никаква Medical detection способност — PD-016 (PARKED) означава нула референции тук, не просто "неактивна функция".

---

## §2. Ghost lifecycle — state machine (формализация на 14 §8)

```
                    detectBoundary() резултат
                              │
                    ┌─────────▼─────────┐
                    │  confidence check  │  (§3)
                    └────┬───────────┬───┘
                под праг │           │ над праг
                         ▼           ▼
                  (не се предлага) PROPOSED ──(Esc / нова selection / край на сесия)──▶ REJECTED
                                      │
                                      │ (Enter / ✓ / vertex drag редакция, 15 §18.2)
                                      ▼
                                  COMMITTED
                          → DrawingEngine.create(shape, provenance='AIGenerated')
                          → CommandStack.execute(...)  (21 §4 — обикновена, undoable команда оттук нататък)
```

**PROPOSED е единственото състояние, в което Ghost съществува като различим тип от Measurement.** REJECTED не е state, който се пази — преходът към него е изтриване на in-memory стойността, не запис (14 §8: "никаква следа"). COMMITTED не е Ghost вече — той е обикновен Measurement с `provenance='AIGenerated'`; state machine-ът "приключва" в момента на commit, защото оттам нататък обектът живее в Drawing/Measurement domain, не в AI Context.

---

## §3. Confidence policy

```ts
AIContext.propose(region: SurfaceRegion): GhostCandidate[]
  candidates = AIProvider.detectBoundary(region)   // 23 §4 — може да върне []
  return candidates.filter(c => c.confidence >= CONFIDENCE_THRESHOLD)
```

- `CONFIDENCE_THRESHOLD` е app-level конфигурация (не product decision, фиксирана числово тук) — Phase 4 калибрира по реални модел резултати; архитектурно изискване е само че **филтрирането е задължителна стъпка между `AIProvider` резултата и каквото и да е показано на потребителя** (15 §18.4: "под праг AI изобщо не предлага").
- Под праг **не е грешка** (23 §8 error taxonomy: празен резултат от `AIProvider` е нормален изход, не rejection) — но AI Context прави разлика между "провайдърът върна []" (нищо намерено) и "провайдърът върна кандидати под нашия праг" (намерено нещо, но недостатъчно уверено) единствено за телеметрия/бъдещо калибриране на прага; към UI и двата случая изглеждат еднакво: "Draw it manually — I'm not confident here" (15 §18.4).

---

## §4. Commit — превод, не мутация

**Ключовата архитектурна гаранция (PD-013, наследена от 18 §8):** commit на Ghost минава през **същия** `DrawingEngine.create()` интерфейс като ръчно чертане (23 §2.1). AI Context не притежава собствен "запис" метод — той конструира параметрите на `create()` от `Ghost.shape` и делегира изцяло:

```ts
AIContext.commit(ghost: GhostCandidate): void
  shape = ghost.shape                              // директно от AIProvider резултата
  CommandStack.execute(
    new CreateMeasurementCommand(shape, provenance: 'AIGenerated')
  )
  // от този момент: обикновен Measurement, обикновена undo/redo команда (21 §4)
```

**Редакция на връх като имплицитен commit (15 §18.2):** ако потребителят влачи връх на Ghost преди explicit Accept, драгът сам предизвиква commit (с редактираната позиция) — архитектурно, това е `commit()` извикан с модифициран `shape` преди `CreateMeasurementCommand`, не специален "полу-committed" state. Няма трето състояние между PROPOSED и COMMITTED.

---

## §5. Non-persistence enforcement (INV-5)

Същият модел като Extension write API (23 §5) — **Ghost в PROPOSED състояние просто няма достъпен path до `SurfaceRepository`/`CommandStack`.** AI Context държи PROPOSED кандидатите в чиста in-memory сесийна структура (не различна от UI local state), която:

- не се сериализира от `StorageAdapter` (21 §5.2) — Surface repository записва само committed Measurements, никога не "вижда" Ghost обекти изобщо, защото те не са част от Surface aggregate дървото (14 §2.1) преди commit.
- се изчиства при затваряне на Surface/Project сесията — REJECTED прехода (§2) е буквално "спри да пазиш тази референция", не delete операция върху persisted данни.

**Защо това е по-силна гаранция от "UI не показва Rejected ghosts":** дори bug в UI слоя (напр. опит да се рендерира стар Ghost) не може да доведе до persisted грешни данни, защото persistence слоят структурно няма вход за Ghost тип — същия принцип като "write методът не съществува" от 23 §5, приложен тук към "persist методът не съществува за не-committed кандидати".

---

## §6. Входни точки (обвързване с 15 §18.5)

```ts
AIContext.detectAt(surface: SurfaceId, targetPoint: Point): GhostCandidate[]   // клик върху обект, dock ✦ / ⌘K
AIContext.detectSimilar(surface: SurfaceId, referenceShape: Shape): GhostCandidate[]  // пасивно предложение, "3 similar roofs found"
```

И двата пътя минават през §3 филтъра еднакво — "пасивно" предложение не заобикаля confidence policy-то, само се различава по UI trigger (ненатрапчив chip срещу explicit инструмент), не по data path.

**Batch accept (15 §18.6):** UI може да покаже няколко PROPOSED Ghost-а едновременно (за `detectSimilar`) и да позволи "приеми всички" — архитектурно това е N последователни `commit()` извиквания, всяко произвеждащо собствена `CreateMeasurementCommand` в стека (individually undoable, 21 §4.2) — не една batch команда, за да не се загуби гранулярността на undo (потребител може да отмени приемането на един покрив от три, не всички наведнъж).

---

## §7. Offline / достъпност на AIProvider (P-05 зависимост)

`AIProvider` е adapter (21 §8.2) — конкретната имплементация (on-device WASM срещу cloud REST) не е решена тук (изрично Pending, P-05). Архитектурната гаранция от AI Context страна: **недостъпност на AIProvider никога не блокира основния поток.**

```ts
AIContext.propose(region): GhostCandidate[]
  try:
    candidates = AIProvider.detectBoundary(region)  // може да хвърли NetworkError (23 §8)
  catch (NetworkError):
    return []  // деградира тихо към "не съм наличен" — UI показва същия "draw manually" hint като ниска увереност
```

Потребителят не вижда разлика между "AI не е уверен" и "AI не е достъпен offline" — и двата водят до same graceful fallback (ръчно чертане, което винаги работи, PD-012 local-first). Това пази F1/F2 (core flows) напълно независими от AI наличност — AI е строго добавка, никога зависимост (буквалният architecture тест за PD-013 "AI-forward, не AI-required").

---

## §8. Testability (за 22)

- State machine (§2): всеки преход като explicit unit тест (PROPOSED→COMMITTED, PROPOSED→REJECTED, недостижимост на трето състояние).
- Confidence filter (§3): table-driven — candidates под/над праг → очакван филтриран резултат.
- **INV-5 сесийна проверка (22 §5.3 котвата):** пълна сесия (propose → commit едно, reject друго) → snapshot на `StorageAdapter` не съдържа rejected кандидата, съдържа само committed-ия с коректен `provenance`.
- **PD-013 regression (22 §10):** статичен/структурен тест, че единствените извиквания към `CreateMeasurementCommand` с `provenance='AIGenerated'` минават през explicit `AIContext.commit()`, никога през timer/interval код path.
- Offline деградация (§7): fake `AIProvider`, който хвърля `NetworkError` → `propose()` връща `[]`, не пропагира грешка нагоре.

---

## §9. Проверка срещу 14/15/21/23

| Тук | Произход |
|-----|----------|
| Ghost state machine, REJECTED без запис | 14 §8 |
| Commit минава през DrawingEngine.create() | 18 §8, PD-013 |
| Confidence filter като задължителна стъпка | 15 §18.4 |
| Persist path структурно отсъства за PROPOSED | INV-5 (14 §4), модел еднакъв с 23 §5 Extension |
| Batch accept = N individually undoable команди | 21 §4.2, 15 §18.6 |
| AIProvider недостъпност → graceful [] | PHASE_2_REVIEW риск (AI доверие), P-05, PD-012 (local-first не зависи от AI) |
| Нула Medical референции | PD-016 |
