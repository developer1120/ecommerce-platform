import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reloadPage, reportError } from '@/lib/errors';
import styles from './AppErrorBoundary.module.css';

interface State {
  failed: boolean;
}

/**
 * The last line of defence, around the whole app. Route boundaries catch
 * page crashes inside the layout; this only shows when something outside
 * them fails, such as the app's providers. It depends on nothing that
 * might itself be broken: no router, no context, no shared components.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportError(error, `the app shell${info.componentStack ? ` ${info.componentStack.trim().split('\n')[0]}` : ''}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className={styles.crash}>
        <p className={styles.mark}>tanelt.</p>
        <h1 className={styles.title}>Something went wrong</h1>
        <p>The shop hit a problem it couldn't recover from. Reloading should get you going again.</p>
        <button type="button" className={styles.button} onClick={reloadPage}>
          Reload Tanelt
        </button>
      </main>
    );
  }
}
