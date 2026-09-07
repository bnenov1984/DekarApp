import type { Command } from '../commandStack.js';
import type { Surface } from '../../core/domain/entities.js';

export interface SetImageLockedParams {
  readonly surface: Surface;
  readonly locked: boolean;
}

/** PO request (lockable Background layer) — toggles `Surface.imageLocked`. Locked blocks every
 * resize/move interaction with the background image (CanvasStage.svelte gates on it); this
 * command only flips the flag, same "VO replaced wholesale" discipline as everything else. */
export function setImageLockedCommand(params: SetImageLockedParams): Command<Surface> {
  const before = params.surface;
  return {
    target: before.id,
    label: 'SetImageLocked',
    do: () => ({ ...before, imageLocked: params.locked }),
    undo: () => before,
    event: { type: 'SurfaceImageLockToggled', surfaceId: before.id },
  };
}
