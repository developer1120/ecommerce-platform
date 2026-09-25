import { useCallback, useEffect, useReducer, useRef, type DependencyList } from 'react';
import { isAbortError } from '@/api/client';

export type AsyncState<T> =
  | { status: 'loading'; data: T | undefined; error: undefined }
  | { status: 'success'; data: T; error: undefined }
  | { status: 'error'; data: T | undefined; error: Error };

export type AsyncResult<T> = AsyncState<T> & {
  /** Runs the request again, e.g. from a "Try again" button. */
  reload: () => void;
};

type Action<T> = { type: 'start' } | { type: 'resolve'; data: T } | { type: 'reject'; error: Error };

function reducer<T>(state: AsyncState<T>, action: Action<T>): AsyncState<T> {
  switch (action.type) {
    case 'start':
      // Keep the previous data so a refresh does not blank the page.
      return { status: 'loading', data: state.data, error: undefined };
    case 'resolve':
      return { status: 'success', data: action.data, error: undefined };
    case 'reject':
      return { status: 'error', data: state.data, error: action.error };
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Runs an async function whenever `deps` change and tracks its state.
 * The previous run is aborted through its signal, and a late answer from a
 * stale run is ignored, so results never arrive out of order.
 */
export function useAsync<T>(run: (signal: AbortSignal) => Promise<T>, deps: DependencyList): AsyncResult<T> {
  const [state, dispatch] = useReducer(reducer<T>, { status: 'loading', data: undefined, error: undefined });
  const [attempt, retry] = useReducer((count: number) => count + 1, 0);

  // Always call the latest function without making it a dependency.
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: 'start' });
    runRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) dispatch({ type: 'resolve', data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) dispatch({ type: 'reject', error: toError(error) });
      },
    );
    return () => controller.abort();
    // The caller's deps decide when to rerun; `attempt` reruns on reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => retry(), []);

  return { ...state, reload };
}
