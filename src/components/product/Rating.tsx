import { Star } from 'lucide-react';
import { cx } from '@/lib/cx';
import styles from './Rating.module.css';

interface RatingProps {
  average: number;
  count: number;
  className?: string;
}

const numberFormat = new Intl.NumberFormat('en-US');

/** A compact star rating, "★ 4.7 (128)", with a full sentence for screen readers. */
export function Rating({ average, count, className }: RatingProps) {
  if (count === 0) {
    return <p className={cx(styles.rating, className)}>No reviews yet</p>;
  }
  const rounded = average.toFixed(1);
  return (
    <p className={cx(styles.rating, className)}>
      <span className="visually-hidden">
        Rated {rounded} out of 5 from {numberFormat.format(count)} {count === 1 ? 'review' : 'reviews'}
      </span>
      <span aria-hidden="true" className={styles.visual}>
        <Star className={styles.star} />
        {rounded}
        <span className={styles.count}>({numberFormat.format(count)})</span>
      </span>
    </p>
  );
}
