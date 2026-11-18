import { writable, get } from 'svelte/store';
import type { Project, ProjectId, Surface, SurfaceKind } from '../../core/domain/entities.js';
import type { ProjectSummary } from '../../application/ports/projectRepository.js';
import { initStudioSession } from './studioSession.js';
import { projectRepository, surfaceRepository, storageAdapter, persist } from './persistence.js';
import { imageAssetKey } from '../../application/imageAsset.js';
import { setBackgroundImage, loadBackgroundImageFor } from './imageAssetSession.js';
import { renderSinglePagePdf } from '../pdf/pdfRender.js';
import { resetViewport } from './viewportSession.js';

// 11_INFORMATION_ARCHITECTURE.md §5 Navigation Tree — the app has exactly two screens (Home,
// Studio) plus overlays (15 §4); ADR-006 chose plain state over a routing library because that
// tree is this shallow. Project/Surface creation here is a plain UI-layer action, not a
// CommandStack command (21 §4.2 scopes commands to undoable Surface-content mutations, not
// Project lifecycle). Persistence slice: repositories now exist (persistence.ts) — creation
// autosaves immediately, same fire-and-forget pattern as studioSession.ts's per-command autosave.

// PO follow-up ("simplify entry flow") — Home is no longer the default entry point: every app
// start opens directly into Studio with a fresh blank project (the exact same construction
// `startBlankProject()` already performed for the "Blank canvas" button — this just runs it once
// at module-eval time instead of waiting for a click). `Screen` keeps 'home' as a value (rather
// than collapsing to a single-screen type) since `Home.svelte` itself is untouched, just
// unreachable from the default flow — cheap to keep, cheap to reverse. "Restore last persisted
// project on launch" is a documented aspiration that was never actually implemented (no
// `lastProjectId` field exists anywhere in settingsRepository) — explicitly deferred, not built
// here; this always opens a fresh blank project, same as clicking "Blank canvas" used to.
export type Screen = 'home' | 'studio';

export interface AppState {
  readonly screen: Screen;
  readonly project: Project | null;
  readonly surfaces: readonly Surface[];
  readonly activeSurfaceId: string | null;
}

function newId(): string {
  return crypto.randomUUID();
}

/** Pure construction — shared by the module-eval-time default state below and the (still
 * reachable, e.g. for a future "New Project" affordance) `startBlankProject()`. No side effects
 * of its own; callers decide whether/when to `initStudioSession`/persist. */
function buildBlankSurfaceAndProject(): { readonly surface: Surface; readonly project: Project } {
  const surfaceId = newId();
  const surface: Surface = {
    id: surfaceId,
    kind: 'blank',
    calibration: null,
    layers: [{ id: newId(), name: 'Default', visible: true, order: 0, measurements: [] }],
  };
  const project: Project = {
    id: newId(),
    name: 'Untitled',
    workspaceId: 'general',
    surfaceIds: [surfaceId],
    reportIds: [],
  };
  return { surface, project };
}

/** Every app start's default state — a real, freshly-initialized Studio session (not just the
 * `screen` flag flipped), since `Studio.svelte` itself never calls `initStudioSession`
 * defensively and assumes it has already happened by the time it mounts. Persists immediately,
 * same fire-and-forget autosave every other project-creation path here already uses. */
function buildDefaultStudioState(): AppState {
  const { surface, project } = buildBlankSurfaceAndProject();
  initStudioSession(surface);
  resetViewport();
  void persist(async () => {
    await surfaceRepository.save(surface);
    await projectRepository.save(project);
  });
  return { screen: 'studio', project, surfaces: [surface], activeSurfaceId: surface.id };
}

export const appState = writable<AppState>(buildDefaultStudioState());

/** 15 §6 W4 Home "Recent" cards — populated by `refreshRecentProjects` (Home.svelte, on mount). */
export const recentProjects = writable<ProjectSummary[]>([]);

/** PO follow-up (UX review, item B9 "post-import calibration banner") — a one-time nudge shown
 * only right after a fresh image import (never on reopening an existing project from Recent,
 * calibrated or not — that would be a nag, not a nudge). `ImportCalibrationBanner.svelte` also
 * gates on the Surface's own calibration being null and on Ctrl/dismiss, so this flag alone
 * doesn't need to track "already handled" — every path below that leaves/replaces the Studio
 * session resets it, so it can never leak into an unrelated project. */
export const showImportCalibrationHint = writable(false);

export function dismissImportCalibrationHint(): void {
  showImportCalibrationHint.set(false);
}

export async function refreshRecentProjects(): Promise<void> {
  recentProjects.set(await projectRepository.list());
}

/** 15 §6 W4 "Blank canvas" Start affordance — still reachable (e.g. a future "New Project"
 * action) even though it's no longer the only way to reach a blank Studio session (the default
 * app state above already is one). Shares `buildBlankSurfaceAndProject()` with that default. */
export function startBlankProject(): void {
  const { surface, project } = buildBlankSurfaceAndProject();
  appState.set({ screen: 'studio', project, surfaces: [surface], activeSurfaceId: surface.id });
  // fresh CommandStack per project session (21 §4.2, ADR-001) — starting a new project always
  // begins with an empty undo history, never inherits the previous session's.
  initStudioSession(surface);
  resetViewport(); // a new project always starts at 100% zoom, never a prior session's leftover
  void loadBackgroundImageFor(surface); // clears any background left over from a prior session
  showImportCalibrationHint.set(false); // a blank canvas was never imported — nothing to nudge
  void persist(async () => {
    await surfaceRepository.save(surface);
    await projectRepository.save(project);
  });
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

export type ImportImageError = 'UNSUPPORTED_FORMAT' | 'CORRUPT_FILE';

/** Shared by importImageProject/importPdfProject below — everything past "we have a decoded
 * bitmap and know what kind of Surface this is" is identical between the two formats: same
 * Surface/Project shape, same "display immediately, persist fire-and-forget" sequencing, same
 * post-import calibration nudge. `file` is the ORIGINAL blob persisted (never the bitmap) — same
 * "store the source, derive the display bitmap fresh on load" split loadBackgroundImageFor
 * already uses for images, now shared by PDF pages too (pdfRender.ts's renderPersistedPdfPage). */
function commitImportedSurface(kind: SurfaceKind, bitmap: ImageBitmap, file: File): { ok: true } {
  const surfaceId = newId();
  const surface: Surface = {
    id: surfaceId,
    kind,
    calibration: null,
    layers: [{ id: newId(), name: 'Default', visible: true, order: 0, measurements: [] }],
  };
  const project: Project = {
    id: newId(),
    name: file.name.replace(/\.[^./]+$/, '') || 'Untitled',
    workspaceId: 'general',
    surfaceIds: [surfaceId],
    reportIds: [],
  };

  setBackgroundImage(bitmap); // already decoded — display immediately, don't wait on the persist round-trip below
  appState.set({ screen: 'studio', project, surfaces: [surface], activeSurfaceId: surfaceId });
  initStudioSession(surface);
  resetViewport();
  showImportCalibrationHint.set(true); // item B9 — nudge to set the scale right after import
  void persist(async () => {
    await surfaceRepository.save(surface);
    await projectRepository.save(project);
    await storageAdapter.write(imageAssetKey(surfaceId), file);
  });

  return { ok: true };
}

/** 15 §6 W4 "Import a file" Start affordance (19_IMPORT_EXPORT.md §2.1) — PNG/JPG, PD-011's other
 * v1 image format (PDF: importPdfProject below). Returns a Result rather than throwing (19 §6
 * error taxonomy: UNSUPPORTED_FORMAT/CORRUPT_FILE are expected, not exceptional) — the caller
 * turns a failure into an inline, non-blocking message (15 §16), never a thrown error. */
export async function importImageProject(file: File): Promise<{ ok: true } | { ok: false; error: ImportImageError }> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: 'UNSUPPORTED_FORMAT' };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, error: 'CORRUPT_FILE' };
  }

  return commitImportedSurface('image', bitmap, file);
}

export type ImportPdfError = 'UNSUPPORTED_FORMAT' | 'CORRUPT_FILE' | 'PASSWORD_PROTECTED' | 'MULTI_PAGE_NOT_SUPPORTED';

/** PO request (PDF import, grilling session 2026-11-18) — PD-011's v1 scope already names PDF;
 * this is the first slice of it, deliberately narrowed to single-page files (pdfRender.ts's own
 * header explains why: no Surface-tab-switcher UI exists yet to navigate between more than one
 * Surface per Project, so a multi-page PDF is rejected rather than silently importing page 1 and
 * dropping the rest). `pageCount` rides along on a MULTI_PAGE_NOT_SUPPORTED result so the caller
 * can name the actual count in its message, not just "unsupported." */
export async function importPdfProject(
  file: File,
): Promise<{ ok: true } | { ok: false; error: ImportPdfError; pageCount?: number }> {
  if (file.type !== 'application/pdf') {
    return { ok: false, error: 'UNSUPPORTED_FORMAT' };
  }

  const rendered = await renderSinglePagePdf(file);
  if (!rendered.ok) {
    return { ok: false, error: rendered.error, ...(rendered.pageCount !== undefined && { pageCount: rendered.pageCount }) };
  }

  return commitImportedSurface('pdfPage', rendered.bitmap, file);
}

/** 15 §6 W4 Recent card click — loads the Project and every Surface it references
 * (`surfaceIds`, 14 §2.2's shallow-aggregate rule: referenced by id, never embedded) back into
 * Studio. Silently does nothing for an id that no longer resolves (defensive; not expected in
 * practice — a Recent card only ever names an id `list()` itself just returned). */
export async function loadProject(id: ProjectId): Promise<void> {
  const project = await projectRepository.get(id);
  if (!project) return;

  const surfaces = (
    await Promise.all(project.surfaceIds.map((surfaceId) => surfaceRepository.get(surfaceId)))
  ).filter((s): s is Surface => s !== null);
  const activeSurfaceId = surfaces[0]?.id ?? null;

  appState.set({ screen: 'studio', project, surfaces, activeSurfaceId });
  showImportCalibrationHint.set(false); // reopening from Recent is never "just imported"
  if (surfaces[0]) {
    initStudioSession(surfaces[0]);
    resetViewport();
    void loadBackgroundImageFor(surfaces[0]);
  }
}

/** PO follow-up (UX review, item A7 "project rename") — every project was permanently named
 * "Untitled" (Import derives a name from the file, startBlankProject hard-codes it, and nothing
 * ever changed it afterward) — the Recent list on Home becomes unusable past a couple of
 * projects. `appState.project` is replaced wholesale (same VO discipline as everywhere else),
 * autosaved fire-and-forget like every other mutation here (no Save button, PD-012 D6). A no-op
 * for an empty/unchanged trimmed name — same "revert, don't create a blank name" rule
 * MeasurementChip's inline rename already applies to measurement names. */
export function renameProject(name: string): void {
  const trimmed = name.trim();
  const state = get(appState);
  if (!trimmed || !state.project || trimmed === state.project.name) return;

  const project: Project = { ...state.project, name: trimmed };
  appState.update((s) => ({ ...s, project }));
  void persist(() => projectRepository.save(project));
}
