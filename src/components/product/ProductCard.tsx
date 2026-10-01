import { Link } from 'react-router';
import { CircleSlash, Sparkles, Tag } from 'lucide-react';
import { CompareToggle } from '@/components/compare/CompareToggle';
import { Badge } from '@/components/ui';
import { WishlistButton } from '@/components/wishlist/WishlistButton';
import {
  isInStock,
  isNewArrival,
  isOnSale,
  LOW_STOCK_THRESHOLD,
  productDiscountPercent,
  totalStock,
  type Product,
} from '@/domain/product';
import { cx } from '@/lib/cx';
import { Price } from './Price';
import { ProductArt } from './ProductArt';
import { Rating } from './Rating';
import styles from './ProductCard.module.css';

const MAX_SWATCHES = 4;

interface ProductCardProps {
  product: Product;
  /** "feature" spans two grid cells with a larger illustration. */
  size?: 'regular' | 'feature';
  className?: string;
}

/** The one badge worth showing on the art: sold out beats sale beats new. */
function cornerBadge(product: Product, now: Date) {
  if (!isInStock(product)) {
    return (
      <Badge tone="inverse" icon={<CircleSlash />}>
        Sold out
      </Badge>
    );
  }
  if (isOnSale(product)) {
    return (
      <Badge tone="sale" icon={<Tag />}>
        −{productDiscountPercent(product)}%
      </Badge>
    );
  }
  if (isNewArrival(product, now)) {
    return (
      <Badge tone="accent" icon={<Sparkles />}>
        New
      </Badge>
    );
  }
  return null;
}

export function ProductCard({ product, size = 'regular', className }: ProductCardProps) {
  const stock = totalStock(product);
  const soldOut = stock === 0;
  const lowStock = !soldOut && stock <= LOW_STOCK_THRESHOLD;
  const swatchOption = product.options.find((option) => option.values.some((value) => value.swatch));
  const swatches = swatchOption?.values ?? [];
  const badge = cornerBadge(product, new Date());

  return (
    <article className={cx(styles.card, className)} data-size={size}>
      <Link to={`/product/${product.slug}`} className={styles.link}>
        <div className={styles.media}>
          <ProductArt art={product.art} muted={soldOut} lazy className={styles.art} />
          {badge && <div className={styles.badge}>{badge}</div>}
        </div>
        <div className={styles.body}>
          <p className={styles.maker}>{product.maker}</p>
          <h3 className={styles.name}>{product.name}</h3>
          <div className={styles.meta}>
            <Price product={product} />
            {lowStock && <p className={styles.lowStock}>Only {stock} left</p>}
          </div>
          <Rating average={product.rating.average} count={product.rating.count} />
          {swatches.length > 1 && (
            <ul className={styles.swatches} aria-label={`${swatches.length} ${swatchOption!.name.toLowerCase()}s`}>
              {swatches.slice(0, MAX_SWATCHES).map((value) => (
                <li key={value.value} className={styles.swatch} style={{ background: value.swatch }} title={value.value}>
                  <span className="visually-hidden">{value.value}</span>
                </li>
              ))}
              {swatches.length > MAX_SWATCHES && (
                <li className={styles.more}>+{swatches.length - MAX_SWATCHES}</li>
              )}
            </ul>
          )}
        </div>
      </Link>
      {/* Beside the link, not inside it: a button can't live inside a link. */}
      <WishlistButton product={product} className={styles.wish} />
      <CompareToggle product={product} className={styles.compare} />
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonArt} />
      <div className={styles.skeletonLine} style={{ width: '40%' }} />
      <div className={styles.skeletonLine} style={{ width: '75%' }} />
      <div className={styles.skeletonLine} style={{ width: '30%' }} />
    </div>
  );
}
