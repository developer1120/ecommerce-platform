/*
 * Shared handling for errors that reach an error boundary.
 */

/**
 * Whether the error is a page's code failing to download, rather than a
 * bug: the connection dropped, or the shop was updated and the old chunk
 * is gone. Reloading fixes it, so the screen offers that instead.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
      error.message,
    )
  );
}

/**
 * Records an error a boundary caught. In a real shop this would go to an
 * error-monitoring service; here it goes to the console, with where it happened.
 */
export function reportError(error: unknown, where: string): void {
  console.error(`[Tanelt] Error in ${where}:`, error);
}

/** A full reload, which also fetches the newest code. A function of its own so tests can stand in for it. */
export function reloadPage(): void {
  window.location.reload();
}

/** A short line about the error, for the details shown during development. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
