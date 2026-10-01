import { useState } from 'react';
import { History } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { clearRecentlyViewed, loadRecentlyViewed } from '@/domain/recentlyViewed';
import { useAsync } from '@/hooks/useAsync';
import { ProductRail } from './ProductRail';
import styles from './ProductRail.module.css';

interface RecentlyViewedProps {
  /** Leave this product out, e.g. the one on screen. */
  excludeId?: string;
  limit?: number;
}

/** What this device looked at lately, with a way to forget it. */
export function RecentlyViewed({ excludeId, limit = 4 }: RecentlyViewedProps) {
  const [ids, setIds] = useState(() => loadRecentlyViewed().filter((id) => id !== excludeId).slice(0, limit));
  const key = ids.join(',');
  const products = useAsync(
    (signal) => (key ? listProducts({ ids: key.split(',') }, { signal }) : Promise.resolve([])),
    [key],
  );

  if (ids.length === 0) return null;
  return (
    <ProductRail
      id="recently-viewed"
      title="Recently viewed"
      icon={History}
      result={products}
      size={ids.length}
      action={
        <button
          type="button"
          className={styles.clear}
          onClick={() => {
            clearRecentlyViewed();
            setIds([]);
          }}
        >
          Clear
        </button>
      }
    />
  );
}
