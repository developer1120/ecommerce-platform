import { Spinner } from '@/components/ui';
import styles from './PageFallback.module.css';

/** Holds the page's place while its code loads, so the footer doesn't jump up and back. */
export function PageFallback() {
  return (
    <div className={styles.fallback}>
      <Spinner label="Loading page" />
    </div>
  );
}
