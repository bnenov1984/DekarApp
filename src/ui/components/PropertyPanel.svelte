<script lang="ts">
  // 16_DESIGN_SYSTEM.md §3.2 PropertyPanel — "контекстни секции за селекцията: Identity (име,
  // цвят) / Values (area, perimeter, vertices — read-only) / Notes / Extensions". Extensions and
  // multi-select aggregation are deferred this slice (no extensions exist; no multi-select exists
  // anywhere in the app yet) — see the Files section of the implementation plan for the full list.
  //
  // Renders nothing when there's no selection (same "component-internal empty state" pattern as
  // MeasurementList.svelte, 15 §15).
  import {
    activeSurface,
    selectedMeasurementId,
    selectedMeasurementIds,
    backgroundSelected,
    setImageLocked,
    setMeasurementLocked,
    executeCommand,
    deleteSelectedMeasurement,
    setVertexLabel,
    setManualArea,
  } from '../stores/studioSession.js';
  import { updateIdentityCommand } from '../../application/commands/updateIdentity.js';
  import { resizeRectangleDimensionsCommand } from '../../application/commands/resizeRectangleDimensions.js';
  import { resizeCircleToRadiusCommand } from '../../application/commands/resizeCircleToRadius.js';
  import { cancelDrag } from '../stores/vertexEditSession.js';
  import {
    splittingId,
    startSplit,
    splitConfigOpen,
    splitPartsCount,
    splitDistribution,
    splitPartsError,
    openSplitConfig,
    closeSplitConfig,
    confirmSplitParts,
  } from '../stores/splitSession.js';
  import { activeVertexLabel, clearActiveVertexLabel } from '../stores/vertexLabelSession.js';
  import Icon from './Icon.svelte';
  import {
    computeMeasurementDisplay,
    applyManualArea,
    dimensionUnitFor,
    formatAreaValue,
    formatDimensionDraft,
    formatLengthValue,
    parseDimensionToPx,
  } from '../measurement/computeDisplay.js';
  import { displayUnit } from '../stores/unitPreferenceSession.js';
  import { shoelaceArea } from '../../core/measurement/formulas.js';
  import type { MeasurementIdentity } from '../../core/domain/entities.js';

  const MEASUREMENT_COLORS = [
    '#2E7D32',
    '#1565C0',
    '#E65100',
    '#6A1B9A',
    '#00838F',
    '#C62828',
    '#4E342E',
    '#37474F',
  ];

  $: measurement = ($activeSurface?.layers.flatMap((l) => l.measurements) ?? []).find(
    (m) => m.id === $selectedMeasurementId,
  );

  // PO follow-up (background layer selectability) — minimal Properties section for the Background
  // "layer" (not a Measurement, so none of the Identity/Values/Notes machinery above applies):
  // just the same lock toggle the Layers panel has, plus its current on-canvas size once the user
  // has resized it (still the "contain"-fit default before that, so nothing to show).
  $: imageLocked = $activeSurface?.imageLocked ?? true;

  // `baseDisplay` is the plain geometry/calibration-derived MeasurementValues, untouched by manual
  // area — Perimeter (and any other non-area field) must always read its unit from here, never
  // from the manual-area-applied `display` below: MeasurementValues carries one shared `unit` for
  // every field (17 §2), and overriding it for a possibly-different area unit (manual area is
  // always m²-referenced, independent of calibration) would otherwise mislabel Perimeter too.
  $: baseDisplay = measurement ? computeMeasurementDisplay(measurement.shape, $activeSurface!.calibration, $displayUnit) : null;

  // PO request (manual area) — the Values section's "Area" row (and every other reader of this
  // `display`) shows the manual override, when set, instead of the geometry/calibration-derived
  // value — "1200 m² is the known real-world reference area" should read as 1200 m² everywhere
  // the area appears, not just in a separate, easy-to-miss field. Only ever used for the Area row
  // itself (and the length-only primaryLabel fallback, which manual area never applies to,
  // Polygon-only) — see `baseDisplay` above for Perimeter/other fields.
  $: display = measurement && baseDisplay
    ? applyManualArea(
        baseDisplay,
        measurement.manualArea,
        measurement.shape.type === 'polygon' ? measurement.shape.vertices : undefined,
        $displayUnit,
      )
    : null;

  // Local edit drafts, reset only when the *selected measurement* changes (not on every store
  // tick) — otherwise a keystroke would be clobbered by the reactive re-derivation above.
  let draftForId: string | null = null;
  let nameDraft = '';
  let noteDraft = '';
  let lastSyncedName = '';
  $: if (measurement && measurement.id !== draftForId) {
    draftForId = measurement.id;
    nameDraft = measurement.identity.name;
    noteDraft = measurement.identity.note ?? '';
    lastSyncedName = measurement.identity.name;
  }
  // The name can now also change from OUTSIDE this panel while the same measurement stays
  // selected (chip inline rename, MeasurementChip.svelte) — without this sync the panel's field
  // would keep showing the stale pre-rename name, and blurring it would silently revert the
  // rename. Name only (identity.name changes exclusively via committed commands, so this can't
  // clobber mid-typing); noteDraft deliberately keeps the id-change-only reset above.
  $: if (measurement && measurement.identity.name !== lastSyncedName) {
    lastSyncedName = measurement.identity.name;
    nameDraft = lastSyncedName;
  }

  // PO request (per-vertex annotation) — while a vertex is "active" (double-clicked, one of its
  // handle dots, CanvasStage.svelte, only reachable in vertex-edit mode), the Notes section below
  // repurposes itself for that vertex's label instead of the Measurement's own note. `null`
  // whenever the active vertex belongs to a *different* Measurement than the current selection
  // (stale/irrelevant — reverts to the ordinary Notes view without needing its own store write).
  $: activeLabel = $activeVertexLabel && measurement && $activeVertexLabel.measurementId === measurement.id ? $activeVertexLabel : null;
  $: currentVertexLabel = activeLabel ? (measurement!.vertexLabels?.[activeLabel.vertexIndex] ?? null) : null;

  const DEFAULT_LABEL_COLOR = MEASUREMENT_COLORS[0]!;

  let labelDraftKey: string | null = null;
  let labelTextDraft = '';
  let labelColorDraft: string = DEFAULT_LABEL_COLOR;
  $: if (activeLabel) {
    const key = `${activeLabel.measurementId}:${activeLabel.vertexIndex}`;
    if (key !== labelDraftKey) {
      labelDraftKey = key;
      labelTextDraft = currentVertexLabel?.text ?? '';
      labelColorDraft = currentVertexLabel?.color ?? DEFAULT_LABEL_COLOR;
    }
  } else {
    labelDraftKey = null;
  }

  function commitIdentity(patch: Partial<MeasurementIdentity>): void {
    if (!measurement) return;
    const identity: MeasurementIdentity = { ...measurement.identity, ...patch };
    executeCommand((surface) => updateIdentityCommand({ surface, measurementId: measurement!.id, identity }));
  }

  function onNameBlur(): void {
    if (!measurement) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== measurement.identity.name) {
      commitIdentity({ name: trimmed });
    } else {
      nameDraft = measurement.identity.name; // revert an emptied/unchanged field
    }
  }

  function onNameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.currentTarget as HTMLInputElement).blur();
    }
  }

  // PO follow-up ("numeric input fields for dimensions") — Rectangle width/height and Circle
  // radius, typed directly rather than only drag-resized. `dimUnit` is the unit these fields
  // display in (px uncalibrated, else the length unit paired with $displayUnit); `canEditDimensions`
  // excludes Geo calibration (no Surface-space px to convert a typed value into — computeDisplay.js's
  // parseDimensionToPx header). Same draft-resync convention as nameDraft above: only overwritten
  // when the shape's actual value changes (drag-resize elsewhere, undo/redo), never on every store
  // tick, so an in-progress keystroke can't be clobbered.
  $: canEditDimensions = $activeSurface ? $activeSurface.calibration === null || $activeSurface.calibration.kind === 'linear' : false;
  $: dimUnit = $activeSurface ? dimensionUnitFor($activeSurface.calibration, $displayUnit) : 'px';

  let widthDraft = '';
  let heightDraft = '';
  let radiusDraft = '';
  let lastSyncedWidth: number | null = null;
  let lastSyncedHeight: number | null = null;
  let lastSyncedRadius: number | null = null;
  $: if (measurement?.shape.type === 'rectangle' && display) {
    const { width, height } = display.values;
    if (width !== undefined && width !== lastSyncedWidth) {
      lastSyncedWidth = width;
      widthDraft = formatDimensionDraft(width, dimUnit);
    }
    if (height !== undefined && height !== lastSyncedHeight) {
      lastSyncedHeight = height;
      heightDraft = formatDimensionDraft(height, dimUnit);
    }
  }
  $: if (measurement?.shape.type === 'circle' && display) {
    const { radius } = display.values;
    if (radius !== undefined && radius !== lastSyncedRadius) {
      lastSyncedRadius = radius;
      radiusDraft = formatDimensionDraft(radius, dimUnit);
    }
  }

  // Both fields commit together (resizeRectangleDimensionsCommand needs width+height at once, same
  // as dragging a corner) — blurring either one re-reads whatever's currently in both drafts.
  // Skipped entirely (no command, no undo step) when the parsed drafts round-trip back to the same
  // displayed value, so tabbing through an unedited field doesn't push a no-op onto the undo stack.
  function commitDimensions(): void {
    if (!measurement || measurement.shape.type !== 'rectangle' || !$activeSurface || !display) return;
    const currentWidth = display.values.width!;
    const currentHeight = display.values.height!;
    const widthPx = parseDimensionToPx(widthDraft, $activeSurface.calibration, $displayUnit);
    const heightPx = parseDimensionToPx(heightDraft, $activeSurface.calibration, $displayUnit);
    if (widthPx === null || heightPx === null) {
      widthDraft = formatDimensionDraft(currentWidth, dimUnit);
      heightDraft = formatDimensionDraft(currentHeight, dimUnit);
      return;
    }
    if (widthDraft === formatDimensionDraft(currentWidth, dimUnit) && heightDraft === formatDimensionDraft(currentHeight, dimUnit)) return;
    executeCommand((surface) =>
      resizeRectangleDimensionsCommand({ surface, measurementId: measurement!.id, width: widthPx, height: heightPx }),
    );
  }

  // PO request (manual area) — "Area (m²)" editable field, Polygon only. Always in m² (the field's
  // own label/unit — independent of `$displayUnit`, matching "Area (m²)" as specified rather than
  // following the display-unit toggle everywhere else). Same draft/resync convention as
  // widthDraft/heightDraft/radiusDraft above: resynced whenever the *computed* m² value changes
  // (a geometry edit, an undo/redo, a fresh selection) but never clobbered by an in-progress
  // keystroke.
  let manualAreaDraft = '';
  let lastSyncedManualAreaM2: number | null = null;
  $: manualAreaCurrentM2 =
    measurement?.shape.type === 'polygon' && measurement.manualArea
      ? shoelaceArea(measurement.shape.vertices) * measurement.manualArea.squareMetersPerSquarePixel
      : null;
  $: if (manualAreaCurrentM2 !== null && manualAreaCurrentM2 !== lastSyncedManualAreaM2) {
    lastSyncedManualAreaM2 = manualAreaCurrentM2;
    manualAreaDraft = formatDimensionDraft(manualAreaCurrentM2, 'm2');
  }
  $: if (manualAreaCurrentM2 === null) {
    lastSyncedManualAreaM2 = null;
    manualAreaDraft = '';
  }

  function commitManualArea(): void {
    if (!measurement || measurement.shape.type !== 'polygon') return;
    const trimmed = manualAreaDraft.trim();
    if (trimmed === '') return; // use the "Auto" button to clear, not an emptied field
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0) {
      manualAreaDraft = manualAreaCurrentM2 !== null ? formatDimensionDraft(manualAreaCurrentM2, 'm2') : '';
      return;
    }
    if (manualAreaCurrentM2 !== null && Math.abs(value - manualAreaCurrentM2) < 1e-9) return;
    setManualArea(measurement.id, value);
  }

  function onClearManualArea(): void {
    if (!measurement) return;
    setManualArea(measurement.id, null);
  }

  function commitRadius(): void {
    if (!measurement || measurement.shape.type !== 'circle' || !$activeSurface || !display) return;
    const currentRadius = display.values.radius!;
    const radiusPx = parseDimensionToPx(radiusDraft, $activeSurface.calibration, $displayUnit);
    if (radiusPx === null) {
      radiusDraft = formatDimensionDraft(currentRadius, dimUnit);
      return;
    }
    if (radiusDraft === formatDimensionDraft(currentRadius, dimUnit)) return;
    executeCommand((surface) => resizeCircleToRadiusCommand({ surface, measurementId: measurement!.id, radius: radiusPx }));
  }

  function onColorPick(color: string): void {
    commitIdentity({ color });
  }

  function onNoteBlur(): void {
    if (!measurement) return;
    if (noteDraft !== (measurement.identity.note ?? '')) commitIdentity({ note: noteDraft });
  }

  // Empty text clears the label entirely (null) rather than leaving a dangling empty-text-plus-
  // color entry — matches vertexLabels.ts's own "no text = no label" normalization.
  function onVertexLabelTextBlur(): void {
    if (!activeLabel) return;
    const trimmed = labelTextDraft.trim();
    setVertexLabel(activeLabel.measurementId, activeLabel.vertexIndex, trimmed ? { text: trimmed, color: labelColorDraft } : null);
  }

  // Color applies immediately (like the Measurement's own onColorPick) but only actually commits
  // a label if there's already text — picking a color before typing anything would otherwise
  // create/keep an empty-text label, which vertexLabels.ts treats as "no label" anyway.
  function onVertexLabelColorPick(color: string): void {
    labelColorDraft = color;
    const trimmed = labelTextDraft.trim();
    if (activeLabel && trimmed) setVertexLabel(activeLabel.measurementId, activeLabel.vertexIndex, { text: trimmed, color });
  }

  // 11 §4 — deleteMeasurementCommand already owns the split-parent/split-child/plain lifecycle
  // rules; this button (and the Delete/Backspace shortcut, Studio.svelte) just triggers it for
  // the current selection. No confirmation dialog (15 §16: "изтриване без потвърждаващ диалог —
  // Undo покрива грешките"), matching every other deletion in this product (vertex delete, etc).
  function onDeleteClick(): void {
    clearActiveVertexLabel();
    deleteSelectedMeasurement();
    cancelDrag();
  }

  // PO follow-up (UX review, item B5 "Split button") — Split (11 §4/18 §5, a genuinely
  // differentiated feature: live dual-area preview) previously had exactly one entry point, the
  // `X` shortcut (Studio.svelte) — approximately undiscoverable. Same guard Studio.svelte's
  // shortcut already applies (not already splitting something else); only shown at all for
  // Polygon (`startSplit`/`splitCommand` only support Polygon, 18 §5).
  $: canSplitSelected = measurement?.shape.type === 'polygon' && !measurement.locked && !$splittingId;
  $: splitConfigOpenForThis = measurement !== undefined && $splitConfigOpen === measurement?.id;

  // PO request ("Redesign and fix Split functionality") — the Split button now opens the inline
  // Equal/Random config UI directly under it, instead of arming the old unlabeled line-draw mode
  // straight away (that flow is retained, explicitly labeled "Manual split", one step further in).
  function onSplitClick(): void {
    if (!measurement) return;
    if ($splitConfigOpen === measurement.id) {
      closeSplitConfig();
    } else {
      openSplitConfig(measurement.id);
    }
  }

  function onManualSplitClick(): void {
    if (!measurement) return;
    startSplit(measurement.id);
  }

  // PO follow-up ("per-measurement lock") — same setMeasurementLocked action the Layers panel's
  // own per-row lock toggle and the context menu's Lock/Unlock item use.
  function onToggleLocked(): void {
    if (!measurement) return;
    setMeasurementLocked(measurement.id, !measurement.locked);
  }

  // PO follow-up (UX review, item A13 "multi-select bulk operations") — a minimal bulk summary
  // for >1 selected: Delete (already bulk-aware, studioSession.ts), a "set color for all" swatch
  // row (reuses the same MEASUREMENT_COLORS/swatch UI as the single-measurement view above), and
  // the combined area. Split parents are excluded from the total the same way MeasurementList's
  // own footer excludes them (INV-4: a parent's area already equals its children's combined) —
  // only relevant if the user happened to multi-select both a parent and its own child.
  $: selectedMeasurementsList = ($activeSurface?.layers.flatMap((l) => l.measurements) ?? []).filter((m) =>
    $selectedMeasurementIds.has(m.id),
  );
  $: selectedSplitParentIds = new Set(
    selectedMeasurementsList.filter((m) => selectedMeasurementsList.some((other) => other.parentId === m.id)).map((m) => m.id),
  );
  $: multiValues = selectedMeasurementsList
    .filter((m) => !selectedSplitParentIds.has(m.id))
    .map((m) => computeMeasurementDisplay(m.shape, $activeSurface!.calibration, $displayUnit).values);
  $: multiTotalArea = multiValues.reduce((sum, v) => sum + (v.area ?? 0), 0);
  $: multiTotalUnit = multiValues.find((v) => v.area !== undefined)?.unit;
  $: multiTotalAreaLabel = multiTotalUnit ? formatAreaValue(multiTotalArea, multiTotalUnit) : null;

  // Rides the same per-measurement updateIdentityCommand as the single-selection color swatch —
  // one undo step per measurement recolored (N selected = N undo steps to fully undo), a
  // deliberate simplification over one atomic batch command; Delete/Duplicate's atomic-batch
  // guarantee matters far more for a destructive/generative action than it does for a cosmetic
  // recolor.
  function onBulkColorPick(color: string): void {
    for (const m of selectedMeasurementsList) {
      executeCommand((s) => updateIdentityCommand({ surface: s, measurementId: m.id, identity: { ...m.identity, color } }));
    }
  }
</script>

<!-- PO request ("Keep the right Properties panel permanently visible") — this outer .panel div is
     now the ONLY element gating the 236px column: it renders unconditionally regardless of
     selection state, so Studio.svelte's flex row width (and therefore CanvasStage's container
     size and, for image Surfaces, the background image's contain-fit rect) never changes when a
     shape is selected/deselected — the panel's *contents* branch on selection state below, not
     its own presence in the layout. -->
<div class="panel" data-testid="property-panel">
{#if measurement}
  <div class="header-row">
    <span class="header">Properties</span>
    <div class="header-actions">
      {#if measurement.shape.type === 'polygon'}
        <button
          type="button"
          class="split-button"
          class:active={splitConfigOpenForThis}
          title="Split"
          disabled={!canSplitSelected && !splitConfigOpenForThis}
          on:click={onSplitClick}
          data-testid="split-measurement"
        >
          Split
        </button>
      {/if}
      <button
        type="button"
        class="lock-button"
        title={measurement.locked ? 'Unlock to move, resize, or delete' : 'Lock to prevent moving, resizing, or deleting'}
        on:click={onToggleLocked}
        data-testid="lock-measurement"
      >
        <Icon name={measurement.locked ? 'lock' : 'unlock'} size={14} />
      </button>
      <button
        type="button"
        class="delete-button"
        title="Delete (Backspace)"
        disabled={measurement.locked}
        on:click={onDeleteClick}
        data-testid="delete-measurement"
      >
        Delete
      </button>
    </div>
  </div>

  {#if splitConfigOpenForThis}
    <!-- PO request ("Redesign and fix Split functionality") — replaces the old unlabeled
         line-draw-on-canvas default: pick a part count + distribution here, one click computes
         everything (core/drawing/splitParts.ts), no canvas interaction needed. The previous
         line-draw flow is retained one step further down as an explicitly labeled "Manual split"
         fallback, not deleted. -->
    <section class="section split-config" data-testid="split-config">
      <label class="notes-label" for="split-parts-count">Number of parts</label>
      <div class="split-count-row">
        {#each [2, 3, 4] as n (n)}
          <button
            type="button"
            class="split-count-preset"
            class:active={$splitPartsCount === n}
            on:click={() => splitPartsCount.set(n)}
            data-testid="split-count-{n}"
          >
            {n}
          </button>
        {/each}
        <input
          id="split-parts-count"
          type="number"
          min="2"
          max="24"
          step="1"
          class="split-count-input"
          value={$splitPartsCount}
          on:input={(e) => splitPartsCount.set(Math.max(2, Math.min(24, Number(e.currentTarget.value) || 2)))}
          aria-label="Custom number of parts"
          data-testid="split-count-custom"
        />
      </div>

      <span class="notes-label">Distribution</span>
      <div class="split-distribution-row" role="group" aria-label="Distribution">
        <button
          type="button"
          class="split-distribution-option"
          class:active={$splitDistribution === 'equal'}
          on:click={() => splitDistribution.set('equal')}
          data-testid="split-distribution-equal"
        >
          Equal
        </button>
        <button
          type="button"
          class="split-distribution-option"
          class:active={$splitDistribution === 'random'}
          on:click={() => splitDistribution.set('random')}
          data-testid="split-distribution-random"
        >
          Random
        </button>
      </div>

      {#if $splitPartsError}
        <p class="split-error" data-testid="split-error">{$splitPartsError}</p>
      {/if}

      <button type="button" class="split-confirm-button" on:click={confirmSplitParts} data-testid="split-confirm">
        Split polygon
      </button>
      <button type="button" class="manual-split-link" on:click={onManualSplitClick} data-testid="manual-split-link">
        Manual split (draw a line)
      </button>
    </section>
  {/if}

  <section class="section">
    <input
      type="text"
      class="name-input"
      bind:value={nameDraft}
      on:blur={onNameBlur}
      on:keydown={onNameKeydown}
      aria-label="Name"
      data-testid="identity-name"
    />
    <div class="swatches" role="group" aria-label="Color">
      {#each MEASUREMENT_COLORS as color (color)}
        <button
          type="button"
          class="swatch"
          class:active={measurement.identity.color === color}
          style="background: {color}"
          aria-label="Set color {color}"
          aria-pressed={measurement.identity.color === color}
          data-testid="swatch-{color}"
          on:click={() => onColorPick(color)}
        ></button>
      {/each}
    </div>
  </section>

  {#if display}
    <section class="section values">
      {#if display.values.area !== undefined}
        <div class="value-row"><span>Area</span><strong>{display.primaryLabel}</strong></div>
      {/if}
      {#if display.values.perimeter !== undefined && baseDisplay}
        <div class="value-row">
          <span>Perimeter</span><strong>{formatLengthValue(display.values.perimeter, baseDisplay.values.unit)}</strong>
        </div>
      {/if}
      {#if display.values.length !== undefined && display.values.area === undefined}
        <div class="value-row"><span>Length</span><strong>{display.primaryLabel}</strong></div>
      {/if}
      {#if display.values.vertexCount !== undefined}
        <div class="value-row"><span>Vertices</span><strong>{display.values.vertexCount}</strong></div>
      {/if}
      {#if measurement.shape.type === 'polygon'}
        <!-- PO request (manual area) — an explicit, real-world reference area (m²), independent
             of Surface.calibration; separate from the geometrically calculated Area row above
             (which switches to reflect this value once set, applyManualArea in computeDisplay.ts). -->
        <div class="value-row dimension-row">
          <span>Area (m²)</span>
          <span class="dimension-input-group">
            <input
              type="text"
              inputmode="decimal"
              class="dimension-input"
              bind:value={manualAreaDraft}
              on:blur={commitManualArea}
              on:keydown={onNameKeydown}
              disabled={measurement.locked}
              aria-label="Manual area in square meters"
              data-testid="manual-area"
            />
            {#if measurement.manualArea}
              <button
                type="button"
                class="manual-area-clear"
                title="Revert to calculated area"
                disabled={measurement.locked}
                on:click={onClearManualArea}
                data-testid="manual-area-clear"
              >
                Auto
              </button>
            {/if}
          </span>
        </div>
      {/if}
      {#if measurement.shape.type === 'rectangle' && canEditDimensions}
          <div class="value-row dimension-row">
            <span>Width</span>
            <span class="dimension-input-group">
              <input
                type="text"
                inputmode="decimal"
                class="dimension-input"
                bind:value={widthDraft}
                on:blur={commitDimensions}
                on:keydown={onNameKeydown}
                disabled={measurement.locked}
                aria-label="Width"
                data-testid="dimension-width"
              />
              <span class="dimension-unit">{dimUnit}</span>
            </span>
          </div>
          <div class="value-row dimension-row">
            <span>Height</span>
            <span class="dimension-input-group">
              <input
                type="text"
                inputmode="decimal"
                class="dimension-input"
                bind:value={heightDraft}
                on:blur={commitDimensions}
                on:keydown={onNameKeydown}
                disabled={measurement.locked}
                aria-label="Height"
                data-testid="dimension-height"
              />
              <span class="dimension-unit">{dimUnit}</span>
            </span>
          </div>
        {/if}
        {#if measurement.shape.type === 'circle' && canEditDimensions}
          <div class="value-row dimension-row">
            <span>Radius</span>
            <span class="dimension-input-group">
              <input
                type="text"
                inputmode="decimal"
                class="dimension-input"
                bind:value={radiusDraft}
                on:blur={commitRadius}
                on:keydown={onNameKeydown}
                disabled={measurement.locked}
                aria-label="Radius"
                data-testid="dimension-radius"
              />
              <span class="dimension-unit">{dimUnit}</span>
            </span>
          </div>
        {/if}
      </section>
    {/if}

    <section class="section">
      {#if activeLabel}
        <div class="notes-header-row">
          <label class="notes-label" for="property-notes">Vertex label</label>
          <button type="button" class="done-button" on:click={clearActiveVertexLabel} data-testid="vertex-label-done">
            Done
          </button>
        </div>
        <textarea
          id="property-notes"
          bind:value={labelTextDraft}
          on:blur={onVertexLabelTextBlur}
          rows="2"
          placeholder="Label this point…"
          data-testid="vertex-label-text"
        ></textarea>
        <div class="swatches" role="group" aria-label="Vertex label color">
          {#each MEASUREMENT_COLORS as color (color)}
            <button
              type="button"
              class="swatch"
              class:active={labelColorDraft === color}
              style="background: {color}"
              aria-label="Set label color {color}"
              aria-pressed={labelColorDraft === color}
              data-testid="vertex-label-swatch-{color}"
              on:click={() => onVertexLabelColorPick(color)}
            ></button>
          {/each}
        </div>
      {:else}
        <label class="notes-label" for="property-notes">Notes</label>
        <textarea
          id="property-notes"
          bind:value={noteDraft}
          on:blur={onNoteBlur}
          rows="3"
          data-testid="identity-notes"
        ></textarea>
      {/if}
    </section>
{:else if $selectedMeasurementIds.size > 1}
  <div class="header-row">
    <span class="header">{$selectedMeasurementIds.size} measurements selected</span>
    <button
      type="button"
      class="delete-button"
      title="Delete (Backspace)"
      on:click={deleteSelectedMeasurement}
      data-testid="delete-measurement"
    >
      Delete
    </button>
  </div>

  <section class="section">
    <span class="notes-label">Set color for all selected</span>
    <div class="swatches" role="group" aria-label="Color for all selected">
      {#each MEASUREMENT_COLORS as color (color)}
        <button
          type="button"
          class="swatch"
          style="background: {color}"
          aria-label="Set color {color} for all selected"
          on:click={() => onBulkColorPick(color)}
          data-testid="multi-swatch-{color}"
        ></button>
      {/each}
    </div>
  </section>

  {#if multiTotalAreaLabel}
    <section class="section values">
      <div class="value-row"><span>Total area</span><strong>{multiTotalAreaLabel}</strong></div>
    </section>
  {/if}
{:else if $backgroundSelected}
  <div class="header-row">
    <span class="header">Background</span>
  </div>

  <section class="section">
    <button
      type="button"
      class="lock-row"
      on:click={() => setImageLocked(!imageLocked)}
      data-testid="background-properties-lock-toggle"
    >
      <Icon name={imageLocked ? 'lock' : 'unlock'} size={15} />
      <span>
        {imageLocked
          ? 'Locked — click to unlock'
          : 'Unlocked — drag a corner to resize, drag the image to move'}
      </span>
    </button>
  </section>

  {#if $activeSurface?.imageRect}
    <section class="section values">
      <div class="value-row"><span>Width</span><strong>{Math.round($activeSurface.imageRect.width)} px</strong></div>
      <div class="value-row"><span>Height</span><strong>{Math.round($activeSurface.imageRect.height)} px</strong></div>
    </section>
  {/if}
{:else}
  <!-- PO request ("Keep the right Properties panel permanently visible") — the empty state: the
       panel column itself never disappears, only its content changes. -->
  <div class="empty-state" data-testid="property-panel-empty">
    <p>Select a shape to edit its properties</p>
  </div>
{/if}
</div>

<style>
  .panel {
    width: 236px;
    flex: 0 0 236px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 10px 12px;
    background: var(--af-surface-panel);
    border-left: 1px solid var(--af-border-subtle);
    overflow: auto;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--af-ink-primary);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .delete-button,
  .split-button {
    font-size: 11.5px;
    font-weight: 600;
    background: none;
    border: none;
    padding: 3px 6px;
    border-radius: var(--af-radius-sm);
    cursor: pointer;
  }

  .delete-button {
    color: var(--af-danger);
  }

  .split-button {
    color: var(--af-accent);
  }

  .split-button.active {
    background: color-mix(in srgb, var(--af-accent) 15%, transparent);
  }

  .lock-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 3px 5px;
    border-radius: var(--af-radius-sm);
    cursor: pointer;
    color: var(--af-ink-tertiary);
  }

  .lock-button:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .delete-button:hover:not(:disabled),
  .split-button:hover:not(:disabled) {
    background: var(--af-surface-app);
  }

  .delete-button:disabled,
  .split-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .name-input {
    font: inherit;
    font-size: 13.5px;
    font-weight: 550;
    color: var(--af-ink-primary);
    background: var(--af-surface-app);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 6px 8px;
  }

  .empty-state {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 24px;
  }

  .empty-state p {
    margin: 0;
    font-size: 12.5px;
    color: var(--af-ink-tertiary);
    text-align: center;
  }

  .split-config {
    background: var(--af-surface-app);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 10px;
  }

  .split-count-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .split-count-preset,
  .split-distribution-option {
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--af-ink-secondary);
    background: var(--af-surface-panel);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 5px 10px;
    cursor: pointer;
  }

  .split-count-preset.active,
  .split-distribution-option.active {
    color: var(--af-accent-ink);
    background: var(--af-accent);
    border-color: var(--af-accent);
  }

  .split-count-input {
    width: 48px;
    font: inherit;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--af-ink-primary);
    background: var(--af-surface-panel);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 5px 6px;
    text-align: right;
  }

  .split-distribution-row {
    display: flex;
    gap: 4px;
  }

  .split-error {
    margin: 0;
    font-size: 11.5px;
    color: var(--af-danger);
  }

  .split-confirm-button {
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--af-accent-ink);
    background: var(--af-accent);
    border: none;
    border-radius: var(--af-radius-sm);
    padding: 7px 10px;
    cursor: pointer;
  }

  .manual-split-link {
    font: inherit;
    font-size: 11.5px;
    color: var(--af-ink-tertiary);
    background: none;
    border: none;
    padding: 2px;
    text-align: left;
    text-decoration: underline;
    cursor: pointer;
  }

  .manual-area-clear {
    font-size: 11px;
    font-weight: 600;
    color: var(--af-ink-tertiary);
    background: none;
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 2px 6px;
    cursor: pointer;
  }

  .manual-area-clear:hover:not(:disabled) {
    color: var(--af-ink-primary);
    border-color: var(--af-accent);
  }

  .lock-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font: inherit;
    font-size: 12.5px;
    color: var(--af-ink-secondary);
    background: var(--af-surface-app);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 8px;
    text-align: left;
    cursor: pointer;
  }

  .lock-row:hover {
    color: var(--af-ink-primary);
    border-color: var(--af-accent);
  }

  .swatches {
    display: flex;
    gap: 6px;
  }

  .swatch {
    width: 20px;
    height: 20px;
    border-radius: var(--af-radius-sm);
    border: 2px solid transparent;
    cursor: pointer;
  }

  .swatch.active {
    border-color: var(--af-ink-primary);
  }

  .swatch:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .values {
    border-top: 1px solid var(--af-border-subtle);
    border-bottom: 1px solid var(--af-border-subtle);
    padding: 10px 0;
    gap: 6px;
  }

  .value-row {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--af-ink-secondary);
  }

  .value-row strong {
    color: var(--af-ink-primary);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .dimension-row {
    align-items: center;
  }

  .dimension-input-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dimension-input {
    width: 56px;
    font: inherit;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--af-ink-primary);
    background: var(--af-surface-app);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 3px 6px;
    text-align: right;
  }

  .dimension-input:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .dimension-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dimension-unit {
    color: var(--af-ink-secondary);
  }

  .notes-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--af-ink-secondary);
  }

  .notes-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .done-button {
    font-size: 11px;
    font-weight: 600;
    color: var(--af-accent);
    background: none;
    border: none;
    padding: 2px 6px;
    border-radius: var(--af-radius-sm);
    cursor: pointer;
  }

  .done-button:hover {
    background: var(--af-surface-app);
  }

  textarea {
    font: inherit;
    font-size: 12.5px;
    color: var(--af-ink-primary);
    background: var(--af-surface-app);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 6px 8px;
    resize: vertical;
  }
</style>
