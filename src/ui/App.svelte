<script lang="ts">
  // 11_INFORMATION_ARCHITECTURE.md §5 Navigation Tree — Home ⇄ Studio, the whole app. Screen
  // choice lives in the appState store (stores/appState.ts), not local component state, so any
  // future overlay/command-palette work can read/drive it from outside this component too.
  import { onMount } from 'svelte';
  import Home from './screens/Home.svelte';
  import Studio from './screens/Studio.svelte';
  import StorageErrorToast from './components/StorageErrorToast.svelte';
  import { appState } from './stores/appState.js';
  import { initUnitPreference } from './stores/unitPreferenceSession.js';
  import { initAuthSession } from './stores/authSession.js';

  onMount(() => {
    void initUnitPreference();
    void initAuthSession();
  });
</script>

{#if $appState.screen === 'home'}
  <Home />
{:else}
  <Studio />
{/if}
<StorageErrorToast />
