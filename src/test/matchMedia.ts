/**
 * jsdom has no matchMedia. This stand-in answers the dark-mode query from a
 * flag, and width queries from a pretend viewport width, both of which tests
 * can change. It notifies listeners like the real API.
 */
type Listener = (event: MediaQueryListEvent) => void;

const DESKTOP_WIDTH = 1280;
let systemDark = false;
let viewportWidth = DESKTOP_WIDTH;
const listeners = new Set<{ query: string; listener: Listener }>();

function evaluate(query: string): boolean {
  if (query.includes('prefers-color-scheme: dark')) return systemDark;
  const max = /max-width:\s*(\d+)px/.exec(query);
  const min = /min-width:\s*(\d+)px/.exec(query);
  if (!max && !min) return false;
  return (!max || viewportWidth <= Number(max[1])) && (!min || viewportWidth >= Number(min[1]));
}

function notify(test: (query: string) => boolean) {
  listeners.forEach(({ query, listener }) => {
    if (test(query)) listener({ matches: evaluate(query), media: query } as MediaQueryListEvent);
  });
}

export function installMatchMedia() {
  window.matchMedia = (query: string): MediaQueryList => {
    const entries = new Map<Listener, { query: string; listener: Listener }>();
    return {
      media: query,
      get matches() {
        return evaluate(query);
      },
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => {
        const entry = { query, listener };
        entries.set(listener, entry);
        listeners.add(entry);
      },
      removeEventListener: (_type: string, listener: Listener) => {
        const entry = entries.get(listener);
        if (entry) listeners.delete(entry);
        entries.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
}

export function setSystemDarkMode(dark: boolean) {
  systemDark = dark;
  notify((query) => query.includes('prefers-color-scheme'));
}

/** Pretends the window is this wide, e.g. 375 for a phone. */
export function setViewportWidth(width: number) {
  viewportWidth = width;
  notify((query) => query.includes('width'));
}

export function resetMatchMedia() {
  systemDark = false;
  viewportWidth = DESKTOP_WIDTH;
  listeners.clear();
}
