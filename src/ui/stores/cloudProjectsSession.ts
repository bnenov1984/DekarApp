import { writable, get } from 'svelte/store';
import type { CloudProjectRef } from '../../application/ports/cloudAdapter.js';
import type { Project, Surface } from '../../core/domain/entities.js';
import { cloudAdapter, projectRepository, surfaceRepository } from './persistence.js';
import { authSession } from './authSession.js';
import { appState, loadProject } from './appState.js';
import { activeSurface } from './studioSession.js';

// docs/26_ADR/ADR-007 Phase 3 — "Save to account" / "Open a cloud project" (the
// anonymous-visitor-claims-a-project flow, SaaS audit §5), built entirely on top of the existing
// local-first flow (PD-012): nothing here is required to draw/split/export — it's reachable only
// from AccountMenu.svelte, only while signed in (authSession.ts).
//
// Versioning: CloudAdapter's `AggregateSnapshot.version` is a plain "later pushes win" counter
// (ADR-005 last-write-wins, resolved by timestamp). Rather than adding a persisted `version`
// field to every local Project/Surface — a Core domain model change this phase doesn't need —
// each push uses the current wall-clock time (`Date.now()`) as its version: monotonically
// increasing across a tab's sequence of saves, and literally "resolved by timestamp" already. A
// future automatic SyncEngine (21 §5.3), if PD-012 ever grows one, is a better place to
// reconsider this than hand-adding version bookkeeping to entities.ts now, for a feature
// (background sync) this phase doesn't build.

export const cloudProjects = writable<readonly CloudProjectRef[]>([]);
export const cloudSyncError = writable<string | null>(null);
export const cloudSyncPending = writable(false);

export async function refreshCloudProjects(): Promise<void> {
  if (!get(authSession)) {
    cloudProjects.set([]);
    return;
  }
  try {
    cloudProjects.set(await cloudAdapter.listOwnedProjects());
  } catch {
    // Not surfaced as a blocking error — the cloud projects list is supplementary UI, same
    // "offline failures are second-order" stance PD-012 takes everywhere else.
    cloudProjects.set([]);
  }
}

/** Pushes the currently-open Project and every Surface it references to the signed-in user's
 * account. The local IndexedDB copy — and everything about how it's edited — is completely
 * unaffected; this only adds a cloud copy.
 *
 * `appState.surfaces` is a snapshot taken when the project was loaded (appState.ts's own
 * `loadProject`) — live edits happen against `studioSession.ts`'s `activeSurface` store instead
 * (every drawing command writes there, then autosaves via `surfaceRepository.save`), and nothing
 * ever writes edits back into `appState.surfaces`. Pushing `appState.surfaces` as-is would ship a
 * stale copy of whichever surface is currently open — found by actually drawing a shape, saving,
 * and pulling it back down on a "fresh device" to see the geometry missing. Swap in the live
 * value for the active surface; the (today, always empty in v1) rest of the array is unaffected. */
export async function saveCurrentProjectToAccount(): Promise<boolean> {
  const state = get(appState);
  if (!state.project) return false;

  const live = get(activeSurface);
  const surfacesToPush = state.surfaces.map((surface) => (live && surface.id === state.activeSurfaceId ? live : surface));

  cloudSyncPending.set(true);
  cloudSyncError.set(null);
  try {
    const version = Date.now();
    await cloudAdapter.push({ kind: 'project', aggregateId: state.project.id, version, data: state.project });
    for (const surface of surfacesToPush) {
      await cloudAdapter.push({ kind: 'surface', aggregateId: surface.id, parentId: state.project.id, version, data: surface });
    }
    await refreshCloudProjects();
    return true;
  } catch {
    cloudSyncError.set("Couldn't save to your account — check your connection and try again.");
    return false;
  } finally {
    cloudSyncPending.set(false);
  }
}

/** Pulls a cloud project (and every Surface it references) down into local storage, then opens
 * it in Studio the same way clicking a Home "Recent" card does — "return to your projects later"
 * (SaaS audit §2) falls out of the existing local-load path once the data is local again. */
export async function openCloudProject(projectId: string): Promise<boolean> {
  cloudSyncPending.set(true);
  cloudSyncError.set(null);
  try {
    const projectSnapshot = await cloudAdapter.pull('project', projectId, 0);
    if (!projectSnapshot) {
      cloudSyncError.set('That project could not be found.');
      return false;
    }
    const project = projectSnapshot.data as Project;
    await projectRepository.save(project);

    for (const surfaceId of project.surfaceIds) {
      const surfaceSnapshot = await cloudAdapter.pull('surface', surfaceId, 0, projectId);
      if (surfaceSnapshot) await surfaceRepository.save(surfaceSnapshot.data as Surface);
    }

    await loadProject(project.id);
    return true;
  } catch {
    cloudSyncError.set("Couldn't open that project — check your connection and try again.");
    return false;
  } finally {
    cloudSyncPending.set(false);
  }
}

export function dismissCloudSyncError(): void {
  cloudSyncError.set(null);
}
