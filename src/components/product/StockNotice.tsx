import { CircleCheck, CircleX, Hourglass } from 'lucide-react';
import { stockLevel } from '@/domain/product';
import styles from './StockNotice.module.css';

interface StockNoticeProps {
  stock: number;
  /** Whether the product has options, so "sold out" can say "in this option". */
  hasOptions: boolean;
}

/** Availability of the selected variant, announced politely when it changes. */
export function StockNotice({ stock, hasOptions }: StockNoticeProps) {
  const level = stockLevel(stock);
  return (
    <p className={styles.notice} data-level={level} role="status">
      {level === 'out' && (
        <>
          <CircleX aria-hidden="true" />
          {hasOptions ? 'Sold out in this option. Try another, or check back soon.' : 'Sold out. Check back soon.'}
        </>
      )}
      {level === 'low' && (
        <>
          <Hourglass aria-hidden="true" />
          Only {stock} left. Ships in 2 to 4 days.
        </>
      )}
      {level === 'in' && (
        <>
          <CircleCheck aria-hidden="true" />
          In stock. Ships in 2 to 4 days.
        </>
      )}
    </p>
  );
}
