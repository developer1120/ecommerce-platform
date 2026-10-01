import { formatMoney } from '@/domain/money';
import { isOnSale, priceRange, type Product } from '@/domain/product';
import { cx } from '@/lib/cx';
import styles from './Price.module.css';

interface PriceProps {
  product: Product;
  className?: string;
}

/**
 * The product's price: "From $22" when variants cost different amounts, and
 * the old price struck through when it is on sale.
 */
export function Price({ product, className }: PriceProps) {
  const { min, max } = priceRange(product);
  const onSale = isOnSale(product);
  const current = formatMoney(min);

  return (
    <p className={cx(styles.price, className)}>
      {min !== max && <span className={styles.from}>From </span>}
      <span className={styles.current} data-sale={onSale || undefined}>
        {onSale && <span className="visually-hidden">Sale price </span>}
        {current}
      </span>
      {onSale && product.compareAtPrice !== undefined && (
        <>
          {' '}
          <s className={styles.was}>
            <span className="visually-hidden">was </span>
            {formatMoney(product.compareAtPrice, { compact: true })}
          </s>
        </>
      )}
    </p>
  );
}
