import { writable } from 'svelte/store';
import type { Project, ProjectId, Surface } from '../../core/domain/entities.js';
import type { ProjectSummary } from '../../application/ports/projectRepository.js';
import { initStudioSession } from './studioSession.js';
import { projectRepository, surfaceRepository, persist } from './persistence.js';

// 11_INFORMATION_ARCHITECTURE.md §5 Navigation Tree — the app has exactly two screens (Home,
// Studio) plus overlays (15 §4); ADR-006 chose plain state over a routing library because that
// tree is this shallow. Project/Surface creation here is a plain UI-layer action, not a
// CommandStack command (21 §4.2 scopes commands to undoable Surface-content mutations, not
// Project lifecycle). Persistence slice: repositories now exist (persistence.ts) — creation
// autosaves immediately, same fire-and-forget pattern as studioSession.ts's per-command autosave.

export type Screen = 'home' | 'studio';

export interface AppState {
  readonly screen: Screen;
  readonly project: Project | null;
  readonly surfaces: readonly Surface[];
  readonly activeSurfaceId: string | null;
}

function initialState(): AppState {
  return { screen: 'home', project: null, surfaces: [], activeSurfaceId: null };
}

export const appState = writable<AppState>(initialState());

/** 15 §6 W4 Home "Recent" cards — populated by `refreshRecentProjects` (Home.svelte, on mount). */
export const recentProjects = writable<ProjectSummary[]>([]);

function newId(): string {
  return crypto.randomUUID();
}

export async function refreshRecentProjects(): Promise<void> {
  recentProjects.set(await projectRepository.list());
}

/** 15 §6 W4 "Blank canvas" Start affordance — the only Start path buildable without an Adapter
 * (Map needs MapProvider, Import needs StorageAdapter+file parsing; neither exists yet). */
export function startBlankProject(): void {
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
  appState.set({ screen: 'studio', project, surfaces: [surface], activeSurfaceId: surfaceId });
  // fresh CommandStack per project session (21 §4.2, ADR-001) — starting a new project always
  // begins with an empty undo history, never inherits the previous session's.
  initStudioSession(surface);
  void persist(async () => {
    await surfaceRepository.save(surface);
    await projectRepository.save(project);
  });
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
  if (surfaces[0]) initStudioSession(surfaces[0]);
}

/** 15 §5 D6 — logo/back returns to Home; the project is not discarded (autosave semantics,
 * PD-012), it simply isn't the active screen — the repositories already hold everything
 * (persistence.ts's per-command autosave), so nothing extra needs saving here. */
export function goHome(): void {
  appState.update((s) => ({ ...s, screen: 'home' }));
}
