import { useEffect, useRef } from 'react';
import { isRouteErrorResponse, Link, useLocation, useNavigate, useRouteError } from 'react-router';
import { CloudOff, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button, HeadingIcon } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';
import { describeError, isChunkLoadError, reloadPage, reportError } from '@/lib/errors';
import { cx } from '@/lib/cx';
import { NotFoundPage } from '@/pages/NotFoundPage';
import styles from './RouteError.module.css';

interface RouteErrorProps {
  /**
   * Set on the outermost boundary, which replaces the whole layout (the
   * header itself failed), so it brings its own page frame.
   */
  standalone?: boolean;
}

/**
 * What a route shows when its page crashes. The boundaries sit inside the
 * layouts, so the header, and the admin or account navigation, stay usable
 * around this message.
 */
export function RouteError({ standalone = false }: RouteErrorProps) {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return <CrashMessage error={error} standalone={standalone} />;
}

function CrashMessage({ error, standalone }: { error: unknown; standalone: boolean }) {
  const chunk = isChunkLoadError(error);
  usePageTitle(chunk ? "Page didn't load" : 'Something went wrong');
  const navigate = useNavigate();
  const location = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    reportError(error, location.pathname);
    // The page under the cursor changed without a navigation; say so.
    titleRef.current?.focus();
  }, [error, location.pathname]);

  return (
    <section className={cx(styles.error, standalone && styles.standalone)} aria-labelledby="route-error-title">
      <h1 id="route-error-title" ref={titleRef} tabIndex={-1} className={styles.title}>
        <HeadingIcon icon={chunk ? CloudOff : TriangleAlert} badge />
        {chunk ? "This page didn't load" : 'Something went wrong on this page'}
      </h1>
      <p className={styles.lede}>
        {chunk
          ? 'Tanelt may have been updated since you opened it, or the connection dropped. Reloading usually sorts it out.'
          : "It's our fault, not yours. Your bag and account are safe. Try again, or carry on shopping."}
      </p>
      <div className={styles.actions}>
        {chunk ? (
          <Button leadingIcon={<RotateCcw />} onClick={reloadPage}>
            Reload page
          </Button>
        ) : (
          // Navigating to the same address clears the error and renders the page afresh.
          <Button leadingIcon={<RotateCcw />} onClick={() => navigate(location, { replace: true })}>
            Try again
          </Button>
        )}
        <Link to="/" className={styles.link}>
          Back to the shop
        </Link>
      </div>
      {import.meta.env.DEV && (
        <details className={styles.details}>
          <summary>Details for developers</summary>
          <pre>{describeError(error)}</pre>
        </details>
      )}
    </section>
  );
}
