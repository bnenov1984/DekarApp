<script lang="ts">
  // 16_DESIGN_SYSTEM.md §3.2 PropertyPanel — "контекстни секции за селекцията: Identity (име,
  // цвят) / Values (area, perimeter, vertices — read-only) / Notes / Extensions". Extensions and
  // multi-select aggregation are deferred this slice (no extensions exist; no multi-select exists
  // anywhere in the app yet) — see the Files section of the implementation plan for the full list.
  //
  // Renders nothing when there's no selection (same "component-internal empty state" pattern as
  // MeasurementList.svelte, 15 §15).
  import { activeSurface, selectedMeasurementId, executeCommand } from '../stores/studioSession.js';
  import { updateIdentityCommand } from '../../application/commands/updateIdentity.js';
  import { computeMeasurementDisplay, formatLengthValue } from '../measurement/computeDisplay.js';
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

  $: display = measurement ? computeMeasurementDisplay(measurement.shape, $activeSurface!.calibration) : null;

  // Local edit drafts, reset only when the *selected measurement* changes (not on every store
  // tick) — otherwise a keystroke would be clobbered by the reactive re-derivation above.
  let draftForId: string | null = null;
  let nameDraft = '';
  let noteDraft = '';
  $: if (measurement && measurement.id !== draftForId) {
    draftForId = measurement.id;
    nameDraft = measurement.identity.name;
    noteDraft = measurement.identity.note ?? '';
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

  function onColorPick(color: string): void {
    commitIdentity({ color });
  }

  function onNoteBlur(): void {
    if (!measurement) return;
    if (noteDraft !== (measurement.identity.note ?? '')) commitIdentity({ note: noteDraft });
  }
</script>

{#if measurement}
  <div class="panel" data-testid="property-panel">
    <div class="header">Properties</div>

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
        {#if display.values.perimeter !== undefined}
          <div class="value-row">
            <span>Perimeter</span><strong>{formatLengthValue(display.values.perimeter, display.values.unit)}</strong>
          </div>
        {/if}
        {#if display.values.length !== undefined && display.values.area === undefined}
          <div class="value-row"><span>Length</span><strong>{display.primaryLabel}</strong></div>
        {/if}
        {#if display.values.vertexCount !== undefined}
          <div class="value-row"><span>Vertices</span><strong>{display.values.vertexCount}</strong></div>
        {/if}
      </section>
    {/if}

    <section class="section">
      <label class="notes-label" for="property-notes">Notes</label>
      <textarea
        id="property-notes"
        bind:value={noteDraft}
        on:blur={onNoteBlur}
        rows="3"
        data-testid="identity-notes"
      ></textarea>
    </section>
  </div>
{/if}

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

  .header {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--af-ink-primary);
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

  .notes-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--af-ink-secondary);
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
