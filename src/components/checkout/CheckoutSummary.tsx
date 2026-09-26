import { Link } from 'react-router';
import { ShoppingBag } from 'lucide-react';
import { ProductArt } from '@/components/product/ProductArt';
import { HeadingIcon } from '@/components/ui';
import { describeOptions, lineTotal } from '@/domain/cart';
import { formatMoney } from '@/domain/money';
import type { OrderTotals } from '@/domain/orderTotals';
import { formatRate } from '@/domain/tax';
import { useCart } from '@/state/CartProvider';
import { usePromo } from '@/state/PromoProvider';
import styles from './CheckoutSummary.module.css';

interface CheckoutSummaryProps {
  totals: OrderTotals;
  /** The state code tax was worked out for, if any. */
  stateCode?: string;
}

/** The bag and its totals, beside every checkout step. */
export function CheckoutSummary({ totals, stateCode }: CheckoutSummaryProps) {
  const { lines, itemCount } = useCart();
  const { promotion } = usePromo();

  return (
    <aside className={styles.summary} aria-labelledby="checkout-summary-title">
      <div className={styles.header}>
        <h2 id="checkout-summary-title" className={styles.title}>
          <HeadingIcon icon={ShoppingBag} />
          Your order
        </h2>
        <Link to="/cart" className={styles.edit}>
          Edit bag
        </Link>
      </div>
      <p className={styles.count}>
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </p>
      <ul className={styles.lines}>
        {lines.map((line) => (
          <li key={line.variantId} className={styles.line}>
            <span className={styles.thumb}>
              <ProductArt art={line.art} color={line.swatch} />
              <span className={styles.quantity} aria-label={`Quantity ${line.quantity}`}>
                {line.quantity}
              </span>
            </span>
            <span className={styles.lineText}>
              <span className={styles.name}>{line.name}</span>
              {Object.keys(line.options).length > 0 && (
                <span className={styles.options}>{describeOptions(line.options)}</span>
              )}
            </span>
            <span className={styles.amount}>{formatMoney(lineTotal(line))}</span>
          </li>
        ))}
      </ul>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Subtotal</dt>
          <dd>{formatMoney(totals.subtotal)}</dd>
        </div>
        {totals.discount > 0 && (
          <div className={styles.row} data-tone="saving">
            <dt>Promo {promotion?.code}</dt>
            <dd>−{formatMoney(totals.discount)}</dd>
          </div>
        )}
        <div className={styles.row}>
          <dt>Shipping ({totals.shipping.method.label.toLowerCase()})</dt>
          <dd>{totals.shipping.price === 0 ? 'Free' : formatMoney(totals.shipping.price)}</dd>
        </div>
        <div className={styles.row}>
          <dt>{totals.tax && stateCode ? `Tax (${stateCode} ${formatRate(totals.tax.rate)})` : 'Tax'}</dt>
          <dd className={totals.tax ? undefined : styles.pending}>
            {totals.tax ? formatMoney(totals.tax.tax) : 'After address'}
          </dd>
        </div>
        <div className={styles.row} data-tone="total">
          <dt>{totals.tax ? 'Total' : 'Total before tax'}</dt>
          <dd>{formatMoney(totals.total)}</dd>
        </div>
      </dl>
    </aside>
  );
}
