<script lang="ts">
  // PO request (expanded unit system, §7 "preserve current design language... two top-level
  // systems, then the relevant length units, one selected at a time") — a plain native `<select>`
  // with optgroups, same control CanvasStage.svelte's calibration-unit dropdown already uses
  // (`data-testid="calibration-unit"`), not a new bespoke widget: native `<select>` is keyboard-
  // accessible and has an accessible current-selection state for free (§10), no extra ARIA needed.
  import { displayUnit, setDisplayUnit } from '../stores/unitPreferenceSession.js';
  import { UNIT_OPTIONS } from '../measurement/unitOptions.js';
  import type { Unit } from '../../core/domain/types.js';

  function onChange(event: Event): void {
    setDisplayUnit((event.currentTarget as HTMLSelectElement).value as Unit);
  }
</script>

<select
  class="unit-selector"
  value={$displayUnit}
  on:change={onChange}
  aria-label="Display unit"
  data-testid="unit-selector"
>
  <optgroup label="Metric">
    {#each UNIT_OPTIONS.filter((o) => o.system === 'metric') as option (option.unit)}
      <option value={option.unit}>{option.label}</option>
    {/each}
  </optgroup>
  <optgroup label="Imperial">
    {#each UNIT_OPTIONS.filter((o) => o.system === 'imperial') as option (option.unit)}
      <option value={option.unit}>{option.label}</option>
    {/each}
  </optgroup>
</select>

<style>
  .unit-selector {
    font: inherit;
    font-size: 11.5px;
    color: var(--af-ink-secondary);
    background: none;
    border: none;
    padding: 2px 4px;
    border-radius: var(--af-radius);
    cursor: pointer;
  }

  .unit-selector:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .unit-selector:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -1px;
  }
</style>
