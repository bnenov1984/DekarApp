import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  appState,
  startBlankProject,
  importImageProject,
  loadProject,
  renameProject,
  showImportCalibrationHint,
} from './appState.js';
import { activeSurface, canUndo, canRedo } from './studioSession.js';

// PO follow-up ("simplify entry flow") — the app now opens directly into Studio with a fresh
// blank project (appState.ts's `buildDefaultStudioState()`, run once at module-eval time) instead
// of a separate Home screen. This first test asserts on that very first module-eval-time state,
// so it must run before any other test in this file mutates the shared `appState` singleton —
// vitest runs a file's `it()` blocks in declaration order, so it's placed first deliberately.
describe('appState — default entry state (module-eval time, before any other test mutates it)', () => {
  it('opens directly into a real Studio session with a fresh blank project — no Home screen', () => {
    const state = get(appState);
    expect(state.screen).toBe('studio');
    expect(state.project).not.toBeNull();
    expect(state.project?.name).toBe('Untitled');
    expect(state.surfaces).toHaveLength(1);
    expect(state.surfaces[0]?.kind).toBe('blank');
    expect(state.activeSurfaceId).toBe(state.surfaces[0]?.id);

    // initStudioSession was already called — studioSession.ts's own stores reflect the same
    // Surface, with a fresh (empty) undo history, not left at their own pre-any-session defaults.
    expect(get(activeSurface)).toEqual(state.surfaces[0]);
    expect(get(canUndo)).toBe(false);
    expect(get(canRedo)).toBe(false);
  });
});

describe('appState — startBlankProject (still reachable, e.g. a future "New Project" action)', () => {
  it('replaces the session with a new blank Surface/Project, undoable-history reset', () => {
    startBlankProject();
    const state = get(appState);
    expect(state.screen).toBe('studio');
    expect(state.surfaces).toHaveLength(1);
    expect(state.surfaces[0]?.kind).toBe('blank');
    expect(get(activeSurface)).toEqual(state.surfaces[0]);
  });

  it('two calls produce two different surface/project ids (never reuses the prior session)', () => {
    startBlankProject();
    const first = get(appState);
    startBlankProject();
    const second = get(appState);
    expect(second.surfaces[0]?.id).not.toBe(first.surfaces[0]?.id);
    expect(second.project?.id).not.toBe(first.project?.id);
  });
});

describe('appState — importImageProject', () => {
  it('rejects an unsupported MIME type without touching the session', () => {
    startBlankProject();
    const before = get(appState);
    const file = new File(['not-an-image'], 'plan.txt', { type: 'text/plain' });
    return importImageProject(file).then((result) => {
      expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_FORMAT' });
      expect(get(appState)).toBe(before); // untouched — same object reference
    });
  });

  it('rejects a file that fails to decode as an image (CORRUPT_FILE)', async () => {
    const file = new File(['garbage'], 'broken.png', { type: 'image/png' });
    const result = await importImageProject(file);
    // jsdom's createImageBitmap on non-image bytes rejects — CORRUPT_FILE, not a thrown error.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('CORRUPT_FILE');
  });
});

describe('appState — loadProject', () => {
  it('is a no-op for an id that does not resolve to any project', async () => {
    startBlankProject();
    const before = get(appState);
    await loadProject('nonexistent-id');
    expect(get(appState)).toBe(before); // untouched
  });
});

describe('appState — renameProject', () => {
  it('renames the current project and is a no-op for blank/unchanged input', () => {
    startBlankProject();
    renameProject('My Survey');
    expect(get(appState).project?.name).toBe('My Survey');

    renameProject('   ');
    expect(get(appState).project?.name).toBe('My Survey'); // unchanged — blank input ignored
  });
});

describe('appState — showImportCalibrationHint', () => {
  it('startBlankProject clears it (a blank canvas was never imported)', () => {
    showImportCalibrationHint.set(true);
    startBlankProject();
    expect(get(showImportCalibrationHint)).toBe(false);
  });
});
