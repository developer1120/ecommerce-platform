import { act, renderHook, waitFor } from '@testing-library/react';
import { useAsync } from './useAsync';

/** A promise the test resolves or rejects by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAsync', () => {
  it('starts loading and then holds the result', async () => {
    const { result } = renderHook(() => useAsync(async () => 'linen', []));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBe('linen');
  });

  it('captures a rejection as an error', async () => {
    const { result } = renderHook(() =>
      useAsync(async () => {
        throw new Error('nope');
      }, []),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('nope');
  });

  it('wraps a non-Error rejection', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject('plain string'), []));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('plain string');
  });

  it('reruns when a dependency changes and aborts the previous run', async () => {
    const signals: AbortSignal[] = [];
    const { result, rerender } = renderHook(
      ({ id }) =>
        useAsync(
          async (signal) => {
            signals.push(signal);
            return `product ${id}`;
          },
          [id],
        ),
      { initialProps: { id: 1 } },
    );
    await waitFor(() => expect(result.current.data).toBe('product 1'));

    rerender({ id: 2 });
    await waitFor(() => expect(result.current.data).toBe('product 2'));
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  it('ignores a slow answer that arrives after a newer request', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const { result, rerender } = renderHook(({ request }) => useAsync(() => request.promise, [request]), {
      initialProps: { request: slow },
    });

    rerender({ request: fast });
    await act(async () => fast.resolve('fast'));
    await act(async () => slow.resolve('slow'));
    expect(result.current.data).toBe('fast');
  });

  it('keeps the previous data while reloading, then replaces it', async () => {
    let call = 0;
    const pending = [deferred<string>(), deferred<string>()];
    const { result } = renderHook(() => useAsync(() => pending[call++]!.promise, []));

    await act(async () => pending[0]!.resolve('first'));
    expect(result.current).toMatchObject({ status: 'success', data: 'first' });

    act(() => result.current.reload());
    expect(result.current).toMatchObject({ status: 'loading', data: 'first' });

    await act(async () => pending[1]!.resolve('second'));
    expect(result.current).toMatchObject({ status: 'success', data: 'second' });
  });

  it('recovers from an error on reload', async () => {
    let fail = true;
    const { result } = renderHook(() =>
      useAsync(async () => {
        if (fail) throw new Error('offline');
        return 'back online';
      }, []),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));

    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBe('back online');
  });

  it('aborts the request on unmount and ignores its answer', async () => {
    const request = deferred<string>();
    let seen: AbortSignal | undefined;
    const { unmount } = renderHook(() =>
      useAsync((signal) => {
        seen = signal;
        return request.promise;
      }, []),
    );
    unmount();
    expect(seen?.aborted).toBe(true);
    // Resolving after unmount must not throw or warn.
    await act(async () => request.resolve('late'));
  });
});
