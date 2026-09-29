import { RotateCcw } from 'lucide-react';
import { isApiError } from '@/api/client';
import { Button } from '@/components/ui';
import styles from './LoadError.module.css';

interface LoadErrorProps {
  error: Error;
  onRetry?: () => void;
  /** What failed to load, e.g. "these products". */
  subject?: string;
}

const FALLBACK = 'Something went wrong on our side. Try again in a moment.';

/** Explains why something did not load and offers a retry. */
export function LoadError({ error, onRetry, subject = 'this page' }: LoadErrorProps) {
  // Only messages written for shoppers are shown; anything else gets the fallback.
  const message = isApiError(error) ? error.message : FALLBACK;

  return (
    <div className={styles.loadError} role="alert">
      <p className={styles.title}>We couldn't load {subject}</p>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" leadingIcon={<RotateCcw />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
