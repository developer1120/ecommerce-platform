import { Link, useLocation } from 'react-router';
import { ArrowRight, X } from 'lucide-react';
import { ProductArt } from '@/components/product/ProductArt';
import { compareUrl, MAX_COMPARE } from '@/domain/compare';
import { useCompare } from '@/state/CompareProvider';
import styles from './Compare.module.css';

/**
 * A bar along the bottom of the screen while anything is picked for
 * comparison: what's in it, and the way to the comparison. It stays out of
 * checkout and off the comparison page itself.
 */
export function CompareTray() {
  const { items, remove, clear } = useCompare();
  const { pathname } = useLocation();
  if (items.length === 0 || pathname.startsWith('/checkout') || pathname === '/compare') return null;

  return (
    <>
      <div className={styles.traySpacer} aria-hidden="true" />
      <aside className={styles.tray} aria-label="Compare">
        <ul className={styles.trayItems}>
          {items.map((item) => (
            <li key={item.id} className={styles.trayItem}>
              <ProductArt art={item.art} className={styles.trayArt} />
              <span className={styles.trayName}>{item.name}</span>
              <button type="button" className={styles.trayRemove} aria-label={`Remove ${item.name} from compare`} onClick={() => remove(item.id)}>
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
          {Array.from({ length: MAX_COMPARE - items.length }, (_, index) => (
            <li key={`empty-${index}`} className={styles.traySlot} aria-hidden="true" />
          ))}
        </ul>
        <div className={styles.trayActions}>
          <button type="button" className={styles.trayClear} onClick={clear}>
            Clear
          </button>
          {items.length < 2 ? (
            <span className={styles.trayHint}>Pick one more to compare</span>
          ) : (
            <Link to={compareUrl(items.map((item) => item.id))} className={styles.trayGo}>
              Compare ({items.length})
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
