import { writable } from 'svelte/store';
import type { Project, Surface } from '../../core/domain/entities.js';
import { initStudioSession } from './studioSession.js';

// 11_INFORMATION_ARCHITECTURE.md §5 Navigation Tree — the app has exactly two screens (Home,
// Studio) plus overlays (15 §4); ADR-006 chose plain state over a routing library because that
// tree is this shallow. Project/Surface creation here is a plain UI-layer action, not a
// CommandStack command (21 §4.2 scopes commands to undoable Surface-content mutations, not
// Project lifecycle) — no repository is involved yet either: StorageAdapter has no
// implementation (ISS-008, tracked risk, not a blocker), so this is in-memory only for now.

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

function newId(): string {
  return crypto.randomUUID();
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
}

/** 15 §5 D6 — logo/back returns to Home; the project is not discarded (autosave semantics,
 * PD-012), it simply isn't the active screen. In-memory today means it's lost on navigation
 * back until a real Repository exists (ISS-008) — an honest current limitation, not hidden. */
export function goHome(): void {
  appState.update((s) => ({ ...s, screen: 'home' }));
}
