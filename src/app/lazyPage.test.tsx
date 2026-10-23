import { Component, Suspense, type ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { lazyPage } from './lazyPage';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>Failed to load</p> : this.props.children;
  }
}

function controlled() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const load = vi.fn(
    () =>
      new Promise<() => ReactNode>((ok, fail) => {
        resolve = () => ok(() => <h1>Loaded page</h1>);
        reject = fail;
      }),
  );
  return { load, resolve: () => resolve(), reject: (error: Error) => reject(error) };
}

function show(Page: () => ReactNode) {
  return render(
    <Boundary>
      <Suspense fallback={<p>Loading…</p>}>
        <Page />
      </Suspense>
    </Boundary>,
  );
}

describe('lazyPage', () => {
  it('shows the fallback while the code loads, then the page', async () => {
    const { load, resolve } = controlled();
    const Page = lazyPage('Demo', load);
    show(Page);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await act(async () => resolve());
    expect(screen.getByRole('heading', { name: 'Loaded page' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(Page.displayName).toBe('Lazy(Demo)');
  });

  it('renders straight away once preloaded, loading only once', async () => {
    const { load, resolve } = controlled();
    const Page = lazyPage('Demo', load);
    const first = Page.preload();
    const second = Page.preload();
    resolve();
    await Promise.all([first, second]);
    show(Page);
    expect(screen.getByRole('heading', { name: 'Loaded page' })).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reports a failed load until asked to try again', async () => {
    const attempts = [controlled(), controlled()];
    let attempt = 0;
    const Page = lazyPage('Demo', () => attempts[attempt++]!.load());
    // React rethrows caught render errors in development; keep jsdom from printing them.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const quiet = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', quiet);
    onTestFinished(() => window.removeEventListener('error', quiet));

    const view = show(Page);
    await act(async () => attempts[0]!.reject(new Error('chunk missing')));
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    view.unmount();

    // Showing it again still fails: the error stays until someone retries.
    const again = show(Page);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    again.unmount();
    expect(attempt).toBe(1);

    void Page.preload();
    show(Page);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await act(async () => attempts[1]!.resolve());
    expect(screen.getByRole('heading', { name: 'Loaded page' })).toBeInTheDocument();
  });
});
