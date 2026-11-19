/** The browser-download dance every export format needs (previously inlined once, in
 * TopBar.svelte's CSV-only `onExportClick`) — now shared across CSV/PNG/JPEG/PDF (ExportMenu.svelte)
 * rather than repeated four times. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
