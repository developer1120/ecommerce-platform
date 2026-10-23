import type { ComponentType, JSX } from 'react';

export interface LazyPage {
  (): JSX.Element;
  /** Starts loading the page's code, e.g. when a link to it is likely to be followed. Safe to call often. */
  preload: () => Promise<void>;
  displayName: string;
}

/**
 * A route component whose code loads on first use, splitting it out of the
 * main bundle. Unlike React.lazy, once the code has arrived (say, preloaded
 * on hover) it renders straight away instead of flashing the fallback.
 * While loading it suspends, so the nearest <Suspense> shows its fallback.
 * If loading fails it throws the error, for an error boundary to show,
 * every time it renders (React renders twice to report an error); calling
 * preload() again starts a fresh attempt.
 */
export function lazyPage(name: string, load: () => Promise<ComponentType>): LazyPage {
  let Loaded: ComponentType | null = null;
  let pending: Promise<void> | null = null;
  let failure: unknown = null;

  const preload = () => {
    if (!pending) {
      failure = null;
      pending = load().then(
        (component) => {
          Loaded = component;
        },
        (error: unknown) => {
          failure = error;
          pending = null;
        },
      );
    }
    return pending;
  };

  const Page = (() => {
    if (Loaded) return <Loaded />;
    if (failure) throw failure;
    // Suspends until the code is in, then React renders again.
    throw preload();
  }) as LazyPage;
  Page.preload = preload;
  Page.displayName = `Lazy(${name})`;
  return Page;
}
