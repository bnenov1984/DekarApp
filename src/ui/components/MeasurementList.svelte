<script lang="ts">
  // 16_DESIGN_SYSTEM.md §3.2 MeasurementList / D8 (15 §12) — "пълна алтернатива на платното":
  // every measurement selectable on the canvas must be selectable here too, reachable by
  // keyboard alone. Rows are real <button> elements specifically for that reason (native Tab
  // focus + Enter/Space activation, no bespoke ARIA needed for the baseline interaction).
  //
  // 15 §2.2 — "Скрит до първото измерване": this component renders nothing (not even its
  // container) when there are zero measurements — per 15 §15, "най-добрият празен панел е
  // никакъв", the empty state is showing nothing rather than an empty list shell.
  import { activeSurface, selectedMeasurementId, selectMeasurement, reorderMeasurements } from '../stores/studioSession.js';
  import { computeMeasurementDisplay } from '../measurement/computeDisplay.js';
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
  }

  function toRow(measurement: Measurement, depth: number, isSplitParent: boolean): Row {
    const display = computeMeasurementDisplay(measurement.shape, $activeSurface!.calibration);
    return {
      id: measurement.id,
      name: measurement.identity.name,
      color: measurement.identity.color,
      primaryLabel: display.primaryLabel,
      area: display.values.area,
      unit: display.values.area !== undefined ? display.values.unit : undefined,
      depth,
      isSplitParent,
    };
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
  function buildRows(measurement: Measurement, depth: number): Row[] {
    const children = childrenOfOrdered(measurement.id);
    return [toRow(measurement, depth, children.length > 0), ...children.flatMap((c) => buildRows(c, depth + 1))];
  }

  $: rows = orderedMeasurements.filter((m) => !m.parentId).flatMap((parent) => buildRows(parent, 0));

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
  $: totalLabel = totalUnit ? `${Math.round(totalArea)} ${totalUnit === 'px' ? 'px²' : totalUnit === 'm2' ? 'm²' : totalUnit}` : '';
</script>

{#if rows.length > 0}
  <div class="panel">
    <div class="header">Layers <span class="count">{rows.length}</span></div>
    <ul class="list">
      {#each rows as row (row.id)}
        <li
          class:drag-over-above={row.id === dragOverId && dragOverEdge === 'above'}
          class:drag-over-below={row.id === dragOverId && dragOverEdge === 'below'}
          on:dragover={(e) => handleDragOver(row.id, e)}
          on:drop={(e) => handleDrop(row.id, e)}
        >
          <button
            type="button"
            class="row"
            class:selected={row.id === $selectedMeasurementId}
            class:child={row.depth > 0}
            class:dragging={row.id === draggedId}
            style={row.depth > 0 ? `padding-left: ${9 + row.depth * 22}px` : undefined}
            draggable="true"
            on:click={() => selectMeasurement(row.id)}
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
    </ul>
    {#if totalLabel}
      <div class="footer">
        <span>Σ Total area</span>
        <strong>{totalLabel}</strong>
      </div>
    {/if}
  </div>
{/if}

<style>
  .panel {
    width: 236px;
    flex: 0 0 236px;
    display: flex;
    flex-direction: column;
    background: var(--af-surface-panel);
    border-right: 1px solid var(--af-border-subtle);
  }

  .header {
    font-size: 12.5px;
    font-weight: 600;
    padding: 10px 12px 8px;
    color: var(--af-ink-primary);
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

  .row {
    width: 100%;
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
