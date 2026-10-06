import { Star } from 'lucide-react';
import { cx } from '@/lib/cx';
import styles from './Reviews.module.css';

/** Five stars filled to the rating, including a partial last star. Decorative: pair it with text. */
export function StarRow({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cx(styles.starRow, className)} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((position) => {
        const fill = Math.max(0, Math.min(1, rating - (position - 1)));
        return (
          <span key={position} className={styles.starSlot}>
            <Star className={styles.starEmpty} />
            <span className={styles.starFill} style={{ width: `${fill * 100}%` }}>
              <Star />
            </span>
          </span>
        );
      })}
    </span>
  );
}
