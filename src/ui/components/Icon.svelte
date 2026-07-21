<script lang="ts">
  // PO follow-up (UX review, item A10 "emoji/glyph icon inconsistency") — 🔒🔓👁⚖⌗🗺🖼⚠ rendered
  // as full-color platform emoji (Segoe UI Emoji on Windows), clashing with the app's otherwise
  // disciplined monochrome design-token system and reading as the single loudest "this is an
  // MVP" signal in the product (per-platform glyph metrics don't align to the pixel either). One
  // shared component, `currentColor` stroke throughout (same "inherit color from context" pattern
  // every other icon-bearing button here already uses via CSS `color`), rather than a inline SVG
  // duplicated at each call site — a second icon needing the same glyph elsewhere just reuses it.
  export let name:
    | 'grid'
    | 'map-pin'
    | 'image'
    | 'lock'
    | 'unlock'
    | 'ruler'
    | 'magnet'
    | 'eye'
    | 'eye-off'
    | 'warning'
    | 'pan'
    | 'rectangle'
    | 'polygon'
    | 'circle'
    | 'freehand'
    | 'line';
  export let size = 16;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  class="af-icon"
>
  {#if name === 'grid'}
    <rect x="3" y="3" width="8" height="8" rx="1.2" />
    <rect x="13" y="3" width="8" height="8" rx="1.2" />
    <rect x="3" y="13" width="8" height="8" rx="1.2" />
    <rect x="13" y="13" width="8" height="8" rx="1.2" />
  {:else if name === 'map-pin'}
    <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
    <circle cx="12" cy="9" r="2.4" />
  {:else if name === 'image'}
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.1 0L4 19" />
  {:else if name === 'lock'}
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  {:else if name === 'unlock'}
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.4-2.1" />
  {:else if name === 'ruler'}
    <rect x="3" y="7" width="18" height="10" rx="1.5" />
    <path d="M7 7v3.5M11 7v2M15 7v3.5M19 7v2" />
  {:else if name === 'magnet'}
    <path d="M6 4h4v9a2 2 0 1 0 4 0V4h4v9a6 6 0 0 1-12 0V4Z" />
    <path d="M6 8h4M14 8h4" />
  {:else if name === 'eye'}
    <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  {:else if name === 'eye-off'}
    <path d="M3 3l18 18" />
    <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.2 0 10 7 10 7a17.9 17.9 0 0 1-4 4.7M6.5 6.5C3.9 8.2 2 12 2 12s3.8 7 10 7a9.7 9.7 0 0 0 3.4-.6" />
    <path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" />
  {:else if name === 'warning'}
    <path d="M12 3.5 22 20H2L12 3.5Z" />
    <path d="M12 9.5v4" />
    <path d="M12 16.8v0.1" />
  {:else if name === 'pan'}
    <!-- PO follow-up ("replace Select tool with Pan") — open hand, conventional pan-tool glyph
         (Figma/Illustrator "H"). -->
    <path d="M9 11.5V6a1.5 1.5 0 0 1 3 0v4.5" />
    <path d="M12 10.5V5a1.5 1.5 0 0 1 3 0v5.5" />
    <path d="M15 10.5V7a1.5 1.5 0 0 1 3 0v6.5c0 3.6-2.4 6.5-6 6.5h-1c-1.8 0-2.8-.6-3.8-1.9l-2.8-3.8a1.4 1.4 0 0 1 2.1-1.8L9 14.5" />
  {:else if name === 'rectangle'}
    <rect x="4" y="6" width="16" height="12" rx="1.2" />
  {:else if name === 'polygon'}
    <path d="M12 3.5 21 10l-3.4 10H6.4L3 10Z" />
  {:else if name === 'circle'}
    <circle cx="12" cy="12" r="8.5" />
  {:else if name === 'freehand'}
    <path d="M3 15c2-6 4-9 6-9s2 5 4 5 2-7 4-7 2 8 4 8" />
  {:else if name === 'line'}
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="6" r="2" />
    <path d="M7.4 16.6 16.6 7.4" />
  {/if}
</svg>

<style>
  .af-icon {
    display: block;
    flex: 0 0 auto;
  }
</style>
