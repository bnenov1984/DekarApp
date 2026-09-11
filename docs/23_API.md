# 23 — API

**Статус:** Draft v1 за одобрение от PO
**Мандат:** Формализира границите, скицирани в 21 (§3 module graph, §4 Command, §5 Repository, §7 Extension sandbox, §8 Map/AI adapters) в конкретни, сигнатурно точни контракти. Затваря Phase 3 архитектурния пакет — оттук нататък Phase 4 имплементира срещу тези сигнатури, не преоткрива границите.
**Обхват на думата "API" тук:** предимно **вътрешни модулни контракти** (тази е local-first PWA, не сървър-централен продукт, PD-001/012) — плюс два контракта с реални external консуматори, за които стабилност наистина има значение: **Extension API** (независимо инсталирани/обновявани модули, 12 §2) и **Cloud Sync API** (клиент и сървър се deploy-ват независимо, PD-012 стъпала 2–3).

---

## §1. Принцип на договора

Всеки интерфейс тук е **собственост на слоя, който го дефинира, не на слоя, който го извиква** (21 §3 dependency inversion): Core дефинира какво Adapters трябва да имплементират; Application дефинира какво Extensions виждат. Промяна в сигнатура е breaking change само за консуматорите ѝ — таблицата в §7 казва кой колко строго versioning изисква.

---

## §2. Core Engine APIs

### 2.1. Drawing Engine (18)

```ts
DrawingEngine.create(type: ShapeType, params: ShapeParams): Shape
DrawingEngine.editVertex(shape: Shape, vertexIndex: number, newPosition: Point): Shape
DrawingEngine.addVertex(shape: Shape, edgeIndex: number, position: Point): Shape
DrawingEngine.removeVertex(shape: Shape, vertexIndex: number): Result<Shape, InvalidGeometryReason>
DrawingEngine.snap(cursor: Point, context: SnapContext): SnapResult   // §4 (18)
DrawingEngine.canSplit(polygon: Shape, splitLine: Point[]): boolean
DrawingEngine.split(polygon: Shape, splitLine: Point[]): Result<[Shape, Shape], SplitReason>
```

**`removeVertex` и `split` връщат `Result`, не хвърлят.** И двете имат нормален, потребителски-достижим "неуспешен" път (18 §5 "canSplit false"; 18 §6 "операция, която би направила Shape невалиден, се отхвърля тихо") — това не са programmer errors, а очаквани изходи, които UI слоят превежда в неблокиращо поведение (15 §16: hint текст, не грешка). `create`/`editVertex`/`addVertex`/`snap` хвърлят само при нарушение на документиран предусловие (напр. `vertexIndex` извън обхват) — това **са** programmer errors, защото UI слоят вече валидира преди извикване (18 §2).

### 2.2. Measurement Engine (17)

```ts
MeasurementEngine.compute(shape: Shape, calibration: Calibration | null, unit: Unit): MeasurementValues
```

Тотална функция за всеки валиден Shape (17 §2) — никога не хвърля, никога не връща `Result`. `calibration = null` е валиден вход (px режим), не грешка — изходът просто носи `unit = 'px'` (17 §2).

---

## §3. Application Layer APIs

### 3.1. Repository (per aggregate root, 21 §5.1)

```ts
interface ProjectRepository {
  get(id: ProjectId): Promise<Project | null>
  save(project: Project): Promise<void>
  delete(id: ProjectId): Promise<void>        // каскада, INV-8; без inverse, INV-9
  list(): Promise<ProjectSummary[]>            // за Home Recent, 15 W4 — леко проекция, не пълни агрегати
}

interface SurfaceRepository {
  get(id: SurfaceId): Promise<Surface | null>  // цялото дърво: calibration+layers+measurements+shapes
  save(surface: Surface): Promise<void>        // атомарно, INV-3
  delete(id: SurfaceId): Promise<void>          // каскада, INV-8
}

interface WorkspaceRepository {   // read-only, App-level каталог
  get(id: WorkspaceId): Promise<Workspace | null>
  list(): Promise<Workspace[]>
}

interface ExtensionRepository {   // read-only, App-level каталог
  get(id: ExtensionId): Promise<ExtensionManifest | null>
  list(): Promise<ExtensionManifest[]>
  listInstalled(): Promise<ExtensionManifest[]>
}
```

`ProjectRepository` **не** излага метод за директен достъп до Layer/Measurement поотделно — единственият вход е `SurfaceRepository.get`, връщащ цялото дърво. Липсата на такъв метод е самата архитектурна гаранция от 21 §5.1 (aggregate root е единствената входна точка), не просто стилово предпочитание.

### 3.2. Command Stack (21 §4.2)

```ts
interface Command<T> {
  do(): T
  undo(): void          // липсва (не undefined — липсва като метод) за ProjectDeleteCommand, INV-9
  readonly target: SurfaceId | ProjectId
}

interface CommandStack {
  execute<T>(command: Command<T>): T   // do() + push в past, изчиства future
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
}
```

`ProjectDeleteCommand` е отделен тип, който **не имплементира** `Command<T>` изцяло — по-точно, той е специален случай, обработен директно от `ProjectRepository.delete`, никога обвит в `CommandStack.execute`. Това прави INV-9 проверимо на compile-time (TypeScript: `ProjectDeleteCommand` просто няма `undo`, не може да мине type-check-а за `Command<T>`), не runtime защита, която може да се пропусне.

---

## §4. Adapter APIs (21 §5.2/5.3/§8)

```ts
interface MapProvider {
  search(query: string): Promise<Location[]>
  getTile(coords: GeoCoordinates, zoom: number): Promise<ImageryTile>
}

interface AIProvider {
  detectBoundary(region: SurfaceRegion): Promise<GhostCandidate[]>
  // празен масив = "не съм уверен" (15 §18), НЕ грешка — виж §8 error taxonomy
}

interface StorageAdapter {
  read(key: string): Promise<Blob | StructuredData | null>
  write(key: string, value: Blob | StructuredData): Promise<void>
  transaction(ops: StorageOp[]): Promise<void>   // атомарност за SurfaceRepository.save
}

interface CloudAdapter {
  push(snapshot: AggregateSnapshot): Promise<void>
  pull(aggregateId: string, sinceVersion: number): Promise<AggregateSnapshot | null>
}

interface AuthAdapter {
  getSession(): Promise<AuthSession | null>
  signInWithPassword(email: string, password: string): Promise<Result<AuthSession, AuthError>>
  signUpWithPassword(email: string, password: string, name?: string): Promise<Result<AuthSession, AuthError>>
  signOut(): Promise<void>
  requestPasswordReset(email: string): Promise<void>
  onSessionChange(callback: (session: AuthSession | null) => void): () => void
  // AuthAdapter изолира Better Auth (26_ADR/ADR-007) зад същата граница като другите четири —
  // Core/Application никога не импортират неговия client SDK директно, само този тесен порт.
}
```

**`AuthAdapter` добавен при Phase 1 на SaaS миграцията** (26_ADR/ADR-007) — Application слоят се нуждае от абстрактно понятие за "текуща сесия", преди да съществува конкретен auth provider зад него. Не заменя, нито ограничава PD-012 local-first поведението: ако потребителят никога не влезе, адаптерът просто никога не се вика — UI и Application продължават да работят изцяло срещу `ProjectRepository`/`SurfaceRepository` както днес.

Всеки от петте адаптера има **точно един contract test suite** (22 §7) — fake имплементация (за тестове) и реална имплементация (Phase 4) минават eднакъв suite, за да е гарантирано поведенческо еквивалентни.

---

## §5. Extension API — публичният контракт (12, 15 §20, 21 §7, PD-014)

Единственият API повърхност, изложена директно на код, който AreaFlow не пише сам (first-party в v1 по PD-011, но проектирана за P-04 бъдеще).

```ts
interface ExtensionContext {
  readonly selection: ReadonlyMeasurementSnapshot[]   // MeasurementValues + identity, НИКОГА Shape
  readonly workspace: WorkspaceId                      // за relevance филтриране, 12 §4
  readonly locale: string                               // PD-010
}

interface ReadonlyMeasurementSnapshot {
  readonly id: string
  readonly name: string
  readonly values: MeasurementValues   // 17 §2 — area, perimeter, и т.н., вече изчислени
  readonly provenance: 'Manual' | 'AIGenerated'
  // геометрия (Shape) умишлено отсъства от типа — не "скрита", буквално не съществува в тази структура
}

// Всеки Extension export-ва точно тази функция:
type ExtensionCompute = (context: ExtensionContext) => DisplayResult[]

interface DisplayResult {
  readonly label: string
  readonly value: string
  readonly unit?: string
}
```

**Ключовото инженерно решение: няма write метод в `ExtensionContext`, не защото е забранен, а защото не съществува в типа.** PermissionTag (15 §20: "Reads: area, perimeter") е UI обещание; тази сигнатура е защо обещанието е вярно структурно — Extension код, изпълняван в Worker sandbox (21 §7), физически няма reference към Repository, CommandStack, или Shape данни. `ReadonlyMeasurementSnapshot` изключва Shape изрично (коментарът в типа) — Extension никога не вижда геометрия, само вече изчислени стойности, точно колкото PermissionTag декларира.

**Versioning (§7):** `ExtensionContext` формата е versioned отделно от app release-а — Extension декларира в манифеста си коя версия на контекста очаква; sandbox host-ът шимва или отхвърля несъвместими extensions при update на каталога (12 §4 "Update от каталога").

---

## §6. Cloud Sync API (минимален, PD-012 стъпала 2–3)

Единствената граница, където клиент и сървър се deploy-ват независимо — оттам идва нуждата от explicit версиониран REST контракт (за разлика от Core/Application/Extension, които се доставят в един PWA bundle):

```
POST /v1/projects/{projectId}/surfaces/{surfaceId}
  body: AggregateSnapshot (версия + serialized Surface дърво)
  → 200 OK | 409 Conflict { serverVersion, serverSnapshot }

GET /v1/projects/{projectId}/surfaces/{surfaceId}?since={version}
  → 200 OK { snapshot } | 204 No Content (нищо ново)

Auth: per-user token (bearer) — акаунт системата извън обхвата на този документ, минимална в v1 (само колкото Backup/Sync изисква)
```

**Conflict resolution е клиентска отговорност** (21 §5.3 last-write-wins): сървърът връща `409` с текущата версия при collision, `SyncEngine` (21 §5.3) на клиента решава по timestamp — сървърът остава простичък, без бизнес логика за merge (пряко следствие от PD-002/003 духа, приложен и извън Core: engines/services без бизнес логика, дори когато не са буквално "Core").

**Извън обхвата на този документ:** пълна акаунт/auth архитектура (P-02 монетизация зависимост), rate limiting, конкретен backend framework — Phase 4/имплементация детайли.

---

## §7. Versioning стратегия

| API повърхност | Версионира се като | Защо |
|-----------------|----------------------|------|
| Core / Application / вътрешни Adapters | Заедно с app release-а (semver на целия bundle) | Един deployable PWA — UI, Core, Application винаги на една версия, няма independent consumer |
| **Extension API** (`ExtensionContext`) | Собствен semver, независим от app release | Extensions се инсталират/обновяват независимо (12 §2) — incompatible context промяна трябва да е откриваема преди crash, не след |
| **Cloud Sync API** | URL-версиониран (`/v1/`) | Клиент (кеширан PWA, може да изостане) и сървър се deploy-ват в различни моменти |

---

## §8. Error taxonomy

Консистентна конвенция across всички слоеве — UI error states (15 §16) консумират типизирани грешки, не голи strings:

| Слой | Конвенция | Пример |
|------|-----------|--------|
| Core | Хвърля само за programmer errors (нарушен предусловие); нормални "неуспешни" изходи са `Result<T, Reason>`, не exception | `removeVertex` под 3 върха → `Result.fail('WOULD_INVALIDATE')`, не throw |
| Application | Repository/CommandStack хвърлят типизирани грешки за реални failures (storage quota, corruption) — тези стигат до UI (15 §16) | `StorageQuotaExceededError` |
| Adapters | Promise rejection с типизирана грешка; **AI "не съм уверен" е `[]`, не грешка** (§4) — разлика между "не мога" (грешка) и "нямам достатъчно увереност" (нормален резултат, 15 §18) | `NetworkError`, `RateLimitError` — но НЕ `LowConfidenceError` |
| Extension | Sandbox прихваща crash/timeout; host получава "Extension unavailable", host процесът не пада (Worker изолация е самата защита) | — |

---

## §9. Проверка срещу 14/17/18/21

| Тук | Произход |
|-----|----------|
| `Result` вместо throw за canSplit/removeVertex | 18 §5/§6 (нормален, потребителски-достижим неуспешен път) |
| Repository интерфейси само по aggregate root | 21 §5.1 (Surface e aggregate root) |
| `ProjectDeleteCommand` извън `Command<T>` типа | 14 INV-9, 21 §4.2 — compile-time наложено |
| `ExtensionContext` без Shape поле, без write метод | PD-014, 15 §20 PermissionTag, 21 §7 sandbox |
| AI празен резултат ≠ грешка | 15 §18 ("не предлага, ако не е уверен") |
| Cloud Sync 409 + клиентски merge | 21 §5.3 last-write-wins, PD-012 |
| Extension API versioned отделно | 12 §2 "Update от каталога" — независим lifecycle |
