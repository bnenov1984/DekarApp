<script lang="ts">
  // 16_DESIGN_SYSTEM.md §3.2 MeasurementList / D8 (15 §12) — "пълна алтернатива на платното":
  // every measurement selectable on the canvas must be selectable here too, reachable by
  // keyboard alone. Rows are real <button> elements specifically for that reason (native Tab
  // focus + Enter/Space activation, no bespoke ARIA needed for the baseline interaction).
  //
  // 15 §2.2 — "Скрит до първото измерване": this component renders nothing (not even its
  // container) when there are zero measurements — per 15 §15, "най-добрият празен панел е
  // никакъв", the empty state is showing nothing rather than an empty list shell.
  import { activeSurface, selectedMeasurementId, selectMeasurement } from '../stores/studioSession.js';
  import { computeMeasurementDisplay } from '../measurement/computeDisplay.js';
  import type { Unit } from '../../core/domain/types.js';

  interface Row {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly primaryLabel: string;
    readonly area: number | undefined;
    readonly unit: Unit | undefined;
  }

  $: rows = ($activeSurface?.layers.flatMap((layer) => layer.measurements) ?? []).map((measurement): Row => {
    const display = computeMeasurementDisplay(measurement.shape, $activeSurface!.calibration);
    return {
      id: measurement.id,
      name: measurement.identity.name,
      color: measurement.identity.color,
      primaryLabel: display.primaryLabel,
      area: display.values.area,
      unit: display.values.area !== undefined ? display.values.unit : undefined,
    };
  });

  $: totalArea = rows.reduce((sum, r) => sum + (r.area ?? 0), 0);
  $: totalUnit = rows.find((r) => r.unit)?.unit;
  $: totalLabel = totalUnit ? `${Math.round(totalArea)} ${totalUnit === 'px' ? 'px²' : totalUnit === 'm2' ? 'm²' : totalUnit}` : '';
</script>

{#if rows.length > 0}
  <div class="panel">
    <div class="header">Measurements <span class="count">{rows.length}</span></div>
    <ul class="list">
      {#each rows as row (row.id)}
        <li>
          <button
            type="button"
            class="row"
            class:selected={row.id === $selectedMeasurementId}
            on:click={() => selectMeasurement(row.id)}
          >
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
