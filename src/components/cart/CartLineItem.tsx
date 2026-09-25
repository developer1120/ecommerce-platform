import { Link } from 'react-router';
import { Trash2 } from 'lucide-react';
import { ProductArt } from '@/components/product/ProductArt';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { describeOptions, lineTotal, MAX_PER_LINE, maxQuantity, type CartLine } from '@/domain/cart';
import { formatMoney, multiplyCents } from '@/domain/money';
import { stockLevel } from '@/domain/product';
import styles from './CartLineItem.module.css';

interface CartLineItemProps {
  line: CartLine;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  /** Called when the product link is followed, e.g. to close the drawer. */
  onNavigate?: () => void;
}

export function CartLineItem({ line, onQuantityChange, onRemove, onNavigate }: CartLineItemProps) {
  const options = describeOptions(line.options);
  const max = maxQuantity(line);
  const productUrl = `/product/${line.slug}?variant=${encodeURIComponent(line.variantId)}`;

  return (
    <li className={styles.line}>
      <Link to={productUrl} className={styles.thumbLink} tabIndex={-1} aria-hidden="true" onClick={onNavigate}>
        <ProductArt art={line.art} color={line.swatch} className={styles.thumb} />
      </Link>
      <div className={styles.details}>
        <div className={styles.top}>
          <div>
            <p className={styles.maker}>{line.maker}</p>
            <Link to={productUrl} className={styles.name} onClick={onNavigate}>
              {line.name}
            </Link>
            {options && <p className={styles.options}>{options}</p>}
          </div>
          <p className={styles.total}>
            {formatMoney(lineTotal(line))}
            {line.compareAtPrice !== undefined && (
              <s className={styles.was}>
                <span className="visually-hidden">was </span>
                {formatMoney(multiplyCents(line.compareAtPrice, line.quantity))}
              </s>
            )}
          </p>
        </div>
        <div className={styles.bottom}>
          <QuantityStepper
            size="sm"
            value={line.quantity}
            max={max}
            label={`Quantity of ${line.name}${options ? `, ${options}` : ''}`}
            onChange={onQuantityChange}
          />
          {line.quantity > 1 && <p className={styles.unit}>{formatMoney(line.unitPrice)} each</p>}
          <button type="button" className={styles.remove} onClick={onRemove} aria-label={`Remove ${line.name}`}>
            <Trash2 aria-hidden="true" />
            <span>Remove</span>
          </button>
        </div>
        {line.quantity >= max ? (
          <p className={styles.limit}>
            {max < MAX_PER_LINE ? "That's all we have in stock." : `Limit of ${MAX_PER_LINE} per order.`}
          </p>
        ) : (
          stockLevel(line.stock) === 'low' && <p className={styles.limit}>Only {line.stock} left. Order soon.</p>
        )}
      </div>
    </li>
  );
}
