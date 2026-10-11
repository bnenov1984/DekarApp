<script lang="ts">
  // 16_DESIGN_SYSTEM.md §3.2 MeasurementList / D8 (15 §12) — "пълна алтернатива на платното":
  // every measurement selectable on the canvas must be selectable here too, reachable by
  // keyboard alone. Rows are real <button> elements specifically for that reason (native Tab
  // focus + Enter/Space activation, no bespoke ARIA needed for the baseline interaction).
  //
  // 15 §2.2 — "Скрит до първото измерване": this component renders nothing (not even its
  // container) when there are zero measurements — per 15 §15, "най-добрият празен панел е
  // никакъв", the empty state is showing nothing rather than an empty list shell.
  import {
    activeSurface,
    selectedMeasurementIds,
    selectMeasurement,
    toggleMeasurementSelection,
    reorderMeasurements,
    setImageLocked,
    setMeasurementLocked,
    backgroundSelected,
    selectBackground,
    backgroundLockFlash,
    executeCommand,
  } from '../stores/studioSession.js';
  import { updateIdentityCommand } from '../../application/commands/updateIdentity.js';
  import { computeMeasurementDisplay, applyManualArea, formatAreaValue } from '../measurement/computeDisplay.js';
  import Icon from './Icon.svelte';
  import { viewOnly } from '../stores/panelLayoutSession.js'; // PD-022 — view-only disables the row toggles and drag-reorder
  import { displayUnit } from '../stores/unitPreferenceSession.js';
  import { splittingId } from '../stores/splitSession.js';
  import { openContextMenu } from '../contextMenu/contextMenuSession.js';
  import { buildMeasurementContextMenuItems, buildBackgroundContextMenuItems } from '../contextMenu/measurementMenuItems.js';
  import type { Measurement, MeasurementId } from '../../core/domain/entities.js';
  import type { Unit } from '../../core/domain/types.js';

  interface Row {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly primaryLabel: string;
    readonly area: number | undefined;
    readonly unit: Unit | undefined;
    /** nesting level — 0 for a top-level measurement, incremented per Split generation (a
     * re-split child, "3-part split", reaches depth 2). Drives indentation. */
    readonly depth: number;
    /** true only for a Split parent (has children) — 15 §5 F7 step 5 groups it with its parts;
     * excluded from the total-area sum below since its area already equals theirs (INV-4). */
    readonly isSplitParent: boolean;
    /** PO follow-up (UX review, item A5 "eye icon = real visibility") — mirrors identity.hidden;
     * drives the row's eye icon. */
    readonly hidden: boolean;
    /** PO follow-up ("per-measurement lock") — mirrors Measurement.locked; drives the row's lock
     * icon. */
    readonly locked: boolean;
  }

  function toRow(measurement: Measurement, depth: number, isSplitParent: boolean, unit: Unit): Row {
    // PO request (manual area) — same override PropertyPanel applies: a Measurement with a
    // manual area shows it here too (D8: every canvas/panel affordance has a list counterpart),
    // rather than the row quietly disagreeing with the Properties panel's own Area value.
    const display = applyManualArea(
      computeMeasurementDisplay(measurement.shape, $activeSurface!.calibration, unit),
      measurement.manualArea,
      measurement.shape.type === 'polygon' ? measurement.shape.vertices : undefined,
      unit,
    );
    return {
      id: measurement.id,
      name: measurement.identity.name,
      color: measurement.identity.color,
      primaryLabel: display.primaryLabel,
      area: display.values.area,
      unit: display.values.area !== undefined ? display.values.unit : undefined,
      depth,
      isSplitParent,
      hidden: measurement.identity.hidden === true,
      locked: measurement.locked,
    };
  }

  /** PO follow-up (UX review, item A5 "eye icon = real visibility") — the eye icon now hides the
   * Measurement itself (shape + chip + vertex labels, sceneRenderer.ts/CanvasStage.svelte/
   * studioSession.ts's findMeasurementAt), not just its on-canvas chip — the universal "eye =
   * object visibility" convention every layer-based tool already uses. Rides the existing
   * updateIdentityCommand (undoable, autosaved) rather than a new command: `hidden` is an
   * Identity field, same category as name/color/note. */
  function toggleHidden(id: MeasurementId): void {
    const measurement = ($activeSurface?.layers.flatMap((l) => l.measurements) ?? []).find((m) => m.id === id);
    if (!measurement) return;
    executeCommand((surface) =>
      updateIdentityCommand({
        surface,
        measurementId: id,
        identity: { ...measurement.identity, hidden: measurement.identity.hidden !== true },
      }),
    );
  }

  // PO follow-up ("per-measurement lock") — rides the same setMeasurementLocked action the
  // Properties panel's own lock toggle and the context menu's Lock/Unlock item use, so all three
  // surfaces (D8) stay in sync.
  function toggleLocked(id: MeasurementId, locked: boolean): void {
    setMeasurementLocked(id, !locked);
  }

  // PO request: this panel is a "Layers" stack (top row = front-most = drawn last by
  // sceneRenderer.ts) — the opposite of Layer.measurements' raw creation order, which draws
  // first-added first (bottom). So the row list is built off the RAW array reversed; every
  // filter/flatMap below preserves relative order, so reversing once at the source is enough to
  // flip both top-level order and each split group's internal child order consistently.
  $: orderedMeasurements = ($activeSurface?.layers.flatMap((layer) => layer.measurements) ?? [])
    .slice()
    .reverse();

  function childrenOfOrdered(parentId: string): Measurement[] {
    return orderedMeasurements.filter((m) => m.parentId === parentId);
  }

  // 15 §5 F7 step 5 — "Parcel ▸ Part 1 / Part 2 / Part 3": every measurement is followed
  // immediately by its Split children, if any — recursive, since a re-split child (3-part split,
  // PD-009) has its own children in turn.
  function buildRows(measurement: Measurement, depth: number, unit: Unit): Row[] {
    const children = childrenOfOrdered(measurement.id);
    return [
      toRow(measurement, depth, children.length > 0, unit),
      ...children.flatMap((c) => buildRows(c, depth + 1, unit)),
    ];
  }

  // `$displayUnit` is referenced directly in this statement (not just inside toRow/buildRows) so
  // Svelte's compiler tracks it as a dependency — a unit switch with no other change recomputes
  // every row's label (PO request: "unit selection must consistently affect... measurement list").
  $: rows = orderedMeasurements.filter((m) => !m.parentId).flatMap((parent) => buildRows(parent, 0, $displayUnit));

  // Drag-to-reorder state (native HTML5 DnD — no library, matches this codebase's no-dependency
  // discipline). `dragOverId`/`dragOverEdge` drive the drop-position indicator line; the actual
  // reorder only happens on drop, computed from the *current* `rows` order so it always reflects
  // whatever's on screen at drop time.
  let draggedId: MeasurementId | null = null;
  let dragOverId: MeasurementId | null = null;
  let dragOverEdge: 'above' | 'below' | null = null;

  function handleDragStart(id: MeasurementId, event: DragEvent): void {
    draggedId = id;
    event.dataTransfer?.setData('text/plain', id); // required by Firefox for DnD to activate at all
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(id: MeasurementId, event: DragEvent): void {
    if (draggedId === null || draggedId === id) return;
    event.preventDefault(); // required for drop to fire at all
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dragOverId = id;
    dragOverEdge = event.clientY - rect.top < rect.height / 2 ? 'above' : 'below';
  }

  function handleDrop(id: MeasurementId, event: DragEvent): void {
    event.preventDefault();
    const sourceId = draggedId;
    const edge = dragOverEdge;
    draggedId = null;
    dragOverId = null;
    dragOverEdge = null;
    if (sourceId === null || sourceId === id) return;

    const currentOrder = rows.map((r) => r.id);
    const withoutSource = currentOrder.filter((rowId) => rowId !== sourceId);
    const targetIndex = withoutSource.indexOf(id);
    const insertAt = edge === 'above' ? targetIndex : targetIndex + 1;
    withoutSource.splice(insertAt, 0, sourceId);

    reorderMeasurements(withoutSource);
  }

  function handleDragEnd(): void {
    draggedId = null;
    dragOverId = null;
    dragOverEdge = null;
  }

  // Σ Total area excludes Split parents — by construction (INV-4) a parent's area already equals
  // the sum of its children's, so including both would double-count.
  $: totalArea = rows.filter((r) => !r.isSplitParent).reduce((sum, r) => sum + (r.area ?? 0), 0);
  $: totalUnit = rows.find((r) => !r.isSplitParent && r.unit)?.unit;
  // PO request (expanded unit system) — reuses computeDisplay.ts's formatAreaValue rather than
  // this footer's own inline suffix/rounding logic, which had quietly drifted from every other
  // area label in the app (found live: "1076 ft2" here vs "1076.39 ft²" everywhere else).
  $: totalLabel = totalUnit ? formatAreaValue(totalArea, totalUnit) : '';

  // PO request: an imported image gets its own row in this panel by default, distinct from the
  // Measurement rows above it — it isn't a Measurement (no shape, no id in Layer.measurements),
  // so it's rendered separately, always last (furthest back — CanvasStage.svelte's raster canvas
  // is always painted behind the vector overlay, non-negotiably), non-draggable (there's nothing
  // to reorder it against) and non-selectable (no Properties to show for it).
  $: hasBackgroundLayer = $activeSurface?.kind === 'image';
  // `undefined`/`true` both mean locked — the safe default (entities.ts). Lockable/unlockable
  // per PO request: unlocked is what actually enables CanvasStage's resize/move handles.
  $: imageLocked = $activeSurface?.imageLocked ?? true;

  // PO follow-up (locked-background click hint) — CanvasStage bumps backgroundLockFlash whenever
  // a canvas click lands on the (locked) background image, so this icon briefly highlights to
  // answer "why didn't that do anything" without a dialog/toast. A named function (not inline
  // assignments in the reactive statement below) so a rapid repeat click can retrigger the CSS
  // animation even mid-flash: turning the class off then back on in the very same tick wouldn't
  // actually restart it (same element, same class value), so the "on" re-assignment is deferred
  // one tick to force a real "off" frame in between.
  let lockFlashing = false;
  let lockFlashOffTimer: ReturnType<typeof setTimeout> | undefined;
  let lockFlashRestartTimer: ReturnType<typeof setTimeout> | undefined;

  function triggerLockFlash(): void {
    lockFlashing = false;
    clearTimeout(lockFlashOffTimer);
    clearTimeout(lockFlashRestartTimer);
    lockFlashRestartTimer = setTimeout(() => {
      lockFlashing = true;
      lockFlashOffTimer = setTimeout(() => {
        lockFlashing = false;
      }, 500);
    }, 0);
  }

  $: if ($backgroundLockFlash) triggerLockFlash();

  // PO follow-up (UX review, item A14 "no context menus") — right-click a row the same as
  // right-clicking its shape on canvas (D8): selects it first if not already part of the current
  // selection (keeping a multi-selection intact when right-clicking within it), then opens the
  // shared menu builder's result.
  function onRowContextMenu(event: MouseEvent, id: MeasurementId): void {
    event.preventDefault();
    const surface = $activeSurface;
    if (!surface) return;
    if (!$selectedMeasurementIds.has(id)) selectMeasurement(id);
    openContextMenu(event.clientX, event.clientY, buildMeasurementContextMenuItems($selectedMeasurementIds, surface, !!$splittingId));
  }

  function onBackgroundRowContextMenu(event: MouseEvent): void {
    event.preventDefault();
    selectBackground();
    openContextMenu(event.clientX, event.clientY, buildBackgroundContextMenuItems(imageLocked));
  }
</script>

<!-- 15 §2.2 (Photoshop layout, 2026-10-11) — always rendered, as the bottom section of
     RightColumn.svelte. An empty project shows "No shapes yet." instead of hiding the panel, so the
     canvas no longer jumps sideways when the first shape is drawn. -->
<div class="panel" data-testid="layers-panel">
  <div class="header">Layers{#if rows.length > 0 || hasBackgroundLayer} <span class="count">{rows.length + (hasBackgroundLayer ? 1 : 0)}</span>{/if}</div>
  {#if rows.length === 0 && !hasBackgroundLayer}
    <p class="empty-state" data-testid="layers-panel-empty">No shapes yet.</p>
  {:else}
    <ul class="list">
      {#each rows as row (row.id)}
        <li
          class:drag-over-above={row.id === dragOverId && dragOverEdge === 'above'}
          class:drag-over-below={row.id === dragOverId && dragOverEdge === 'below'}
          on:dragover={(e) => handleDragOver(row.id, e)}
          on:drop={(e) => handleDrop(row.id, e)}
        >
          <!-- eye = the Measurement's real visibility (item A5) — a sibling of the row button,
               not nested inside it (nested buttons are invalid HTML and break both a11y and
               event flow) -->
          <button
            type="button"
            class="eye-toggle"
            class:off={row.hidden}
            title={row.hidden ? 'Show on canvas' : 'Hide from canvas'}
            disabled={$viewOnly}
            on:click={() => toggleHidden(row.id)}
            data-testid="visibility-toggle-{row.id}"
          >
            <Icon name={row.hidden ? 'eye-off' : 'eye'} size={14} />
            <span class="visually-hidden">{row.hidden ? 'Hidden — click to show' : 'Visible — click to hide'}</span>
          </button>
          <!-- PO follow-up ("per-measurement lock") — same sibling-of-the-row-button structure as
               the eye toggle (nested buttons are invalid HTML); dimmed by default like the eye
               toggle, same "off" visual language, full-opacity + accent color once locked so a
               locked row reads as locked at a glance without opening Properties. -->
          <button
            type="button"
            class="lock-toggle-row"
            class:locked-on={row.locked}
            title={row.locked ? 'Unlock to move, resize, or delete' : 'Lock to prevent moving, resizing, or deleting'}
            disabled={$viewOnly}
            on:click={() => toggleLocked(row.id, row.locked)}
            data-testid="measurement-lock-toggle-{row.id}"
          >
            <Icon name={row.locked ? 'lock' : 'unlock'} size={14} />
            <span class="visually-hidden">{row.locked ? 'Locked' : 'Unlocked'} — click to {row.locked ? 'unlock' : 'lock'}</span>
          </button>
          <button
            type="button"
            class="row"
            class:selected={$selectedMeasurementIds.has(row.id)}
            class:child={row.depth > 0}
            class:dragging={row.id === draggedId}
            class:hidden-row={row.hidden}
            class:locked-row={row.locked}
            style={row.depth > 0 ? `padding-left: ${9 + row.depth * 22}px` : undefined}
            draggable={!$viewOnly}
            on:click={(e) => (e.shiftKey ? toggleMeasurementSelection(row.id) : selectMeasurement(row.id))}
            on:contextmenu={(e) => onRowContextMenu(e, row.id)}
            on:dragstart={(e) => handleDragStart(row.id, e)}
            on:dragend={handleDragEnd}
          >
            {#if row.depth > 0}<span class="child-marker" aria-hidden="true">▸</span>{/if}
            <span class="drag-handle" aria-hidden="true">⠿</span>
            <span class="swatch" style="background: {row.color}"></span>
            <span class="name">{row.name}</span>
            <span class="value">{row.primaryLabel}</span>
          </button>
        </li>
      {/each}
      {#if hasBackgroundLayer}
        <!-- PO follow-up (background layer selectability) — same "lock-toggle sibling, not
             nested inside the row button" structure as the eye-toggle/row pair above (nested
             buttons are invalid HTML). The row itself is now a real button: selecting it shows
             its resize handles on canvas (when unlocked) / a Properties section, same as every
             other selectable layer. -->
        <li>
          <button
            type="button"
            class="lock-toggle"
            class:flash={lockFlashing}
            title={imageLocked ? 'Unlock to move or resize' : 'Lock to prevent moving or resizing'}
            disabled={$viewOnly}
            on:click={() => setImageLocked(!imageLocked)}
            data-testid="background-lock-toggle"
          >
            <Icon name={imageLocked ? 'lock' : 'unlock'} size={14} />
            <span class="visually-hidden">{imageLocked ? 'Locked' : 'Unlocked'} — click to {imageLocked ? 'unlock' : 'lock'}</span>
          </button>
          <button
            type="button"
            class="row background"
            class:selected={$backgroundSelected}
            on:click={() => selectBackground()}
            on:contextmenu={onBackgroundRowContextMenu}
            data-testid="background-layer-row"
          >
            <span class="name">Background</span>
          </button>
        </li>
      {/if}
    </ul>
    {#if totalLabel}
      <div class="footer">
        <span>Σ Total area</span>
        <strong>{totalLabel}</strong>
      </div>
    {/if}
  {/if}
</div>

<style>
  .panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* Same header style as PropertyPanel's: one look for every section title in the column. */
  .header {
    font-size: 12.5px;
    font-weight: 600;
    padding: 10px 12px 8px;
    color: var(--af-ink-primary);
  }

  .empty-state {
    margin: 0;
    padding: 0 12px;
    font-size: 12.5px;
    color: var(--af-ink-tertiary);
  }

  .count {
    color: var(--af-ink-tertiary);
    font-weight: 450;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0 8px;
    flex: 1;
    overflow: auto;
  }

  /* Each li is a flex pair: eye toggle (fixed) + the main row button (fills the rest) — the eye
     lives OUTSIDE the row button since nested buttons are invalid HTML. */
  .list li {
    display: flex;
    align-items: stretch;
    gap: 2px;
  }

  /* View-only (PD-022): the toggles still show the state, they just can't be clicked. */
  .eye-toggle:disabled,
  .lock-toggle-row:disabled,
  .lock-toggle:disabled {
    cursor: default;
    pointer-events: none;
  }

  .eye-toggle {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    font-size: 11px;
    background: none;
    border: none;
    padding: 0;
    border-radius: var(--af-radius-sm);
    cursor: pointer;
    color: var(--af-ink-tertiary);
  }

  .eye-toggle:hover {
    background: var(--af-surface-app);
  }

  .eye-toggle:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -1px;
  }

  /* Measurement hidden — the eye dims, Photoshop-style "off" state */
  .eye-toggle.off {
    opacity: 0.3;
  }

  .lock-toggle-row {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    background: none;
    border: none;
    padding: 0;
    border-radius: var(--af-radius-sm);
    cursor: pointer;
    color: var(--af-ink-tertiary);
    opacity: 0.3;
  }

  .lock-toggle-row:hover {
    background: var(--af-surface-app);
    opacity: 1;
  }

  .lock-toggle-row:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -1px;
  }

  /* Measurement locked — full opacity + accent color, reads as locked at a glance */
  .lock-toggle-row.locked-on {
    opacity: 1;
    color: var(--af-accent);
  }

  /* item "per-measurement lock" — a locked row's name/value recede slightly, same visual language
     as .row.hidden-row, so the row list communicates "protected" without needing the icon alone. */
  .row.locked-row .name,
  .row.locked-row .value {
    color: var(--af-ink-secondary);
  }

  .row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 9px;
    border-radius: var(--af-radius-sm);
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--af-surface-app);
  }

  .row.selected {
    background: color-mix(in srgb, var(--af-accent) 10%, transparent);
    box-shadow: inset 2px 0 0 var(--af-accent);
  }

  .row:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -2px;
  }

  .row.dragging {
    opacity: 0.4;
  }

  /* item A5 "eye icon = real visibility" — a hidden Measurement's row still shows every value
     (it's still fully reachable/editable here, D8), just visually receded so the row list itself
     communicates "not currently on canvas" the same way the eye icon's own dimmed state does. */
  .row.hidden-row .name,
  .row.hidden-row .value {
    color: var(--af-ink-tertiary);
  }

  .row.hidden-row .swatch {
    opacity: 0.35;
  }

  .row.background {
    color: var(--af-ink-tertiary);
  }

  .row.background .name {
    color: var(--af-ink-tertiary);
    font-weight: 450;
  }

  /* Selected still reads as muted content (there's no color swatch/area value for a Background
     layer) but the name switches to primary ink, same "this row is the active one" signal the
     accent tint + left bar already give every other selected row. */
  .row.background.selected .name {
    color: var(--af-ink-primary);
  }

  .lock-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    font-size: 11px;
    background: none;
    border: none;
    padding: 2px;
    border-radius: var(--af-radius-sm);
    cursor: pointer;
    color: var(--af-ink-tertiary);
  }

  .lock-toggle:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  /* PO follow-up (locked-background click hint) — a brief pulse answering "why didn't clicking
     the locked background do anything", triggered from CanvasStage via backgroundLockFlash. */
  .lock-toggle.flash {
    animation: background-lock-flash 0.5s ease;
  }

  @keyframes background-lock-flash {
    0%,
    100% {
      background: none;
      color: var(--af-ink-tertiary);
    }
    30% {
      background: var(--af-accent);
      color: var(--af-accent-ink);
    }
  }

  .lock-toggle:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -1px;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .child-marker {
    color: var(--af-ink-tertiary);
    font-size: 11px;
    margin-right: -3px;
  }

  .drag-handle {
    color: var(--af-ink-tertiary);
    font-size: 13px;
    line-height: 1;
    cursor: grab;
    flex: 0 0 auto;
  }

  /* Drop-position indicator — a thin line at the top/bottom edge of the row currently being
     dragged over, matching the panel's accent color used elsewhere for "current focus". */
  li.drag-over-above .row {
    box-shadow: inset 0 2px 0 var(--af-accent);
  }

  li.drag-over-below .row {
    box-shadow: inset 0 -2px 0 var(--af-accent);
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: 0 0 auto;
  }

  .name {
    flex: 1;
    font-size: 13px;
    font-weight: 520;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--af-ink-primary);
  }

  .value {
    font-size: 12.5px;
    color: var(--af-ink-secondary);
    font-variant-numeric: tabular-nums;
  }

  .footer {
    border-top: 1px solid var(--af-border-subtle);
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--af-ink-secondary);
  }

  .footer strong {
    color: var(--af-ink-primary);
    font-variant-numeric: tabular-nums;
    font-weight: 650;
  }
</style>
