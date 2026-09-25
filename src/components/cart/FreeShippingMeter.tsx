import { Truck } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD } from '@/config/store';
import { formatMoney, type Cents } from '@/domain/money';
import styles from './FreeShippingMeter.module.css';

/** How far the bag is from free shipping, as a sentence and a bar. */
export function FreeShippingMeter({ subtotal }: { subtotal: Cents }) {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const percent = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));

  return (
    <div className={styles.meter}>
      <p className={styles.text}>
        <Truck aria-hidden="true" />
        {remaining === 0 ? (
          <strong>Your order ships free.</strong>
        ) : (
          <span>
            Add <strong>{formatMoney(remaining)}</strong> more for free shipping.
          </span>
        )}
      </p>
      <div
        className={styles.track}
        role="progressbar"
        aria-label="Progress to free shipping"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
