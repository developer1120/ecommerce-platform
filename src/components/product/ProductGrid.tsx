import type { Product } from '@/domain/product';
import { cx } from '@/lib/cx';
import { ProductCard, ProductCardSkeleton } from './ProductCard';
import styles from './ProductGrid.module.css';

/** Every Nth card, starting with the first, is a large feature card. */
export const FEATURE_EVERY = 7;

export function isFeatureSlot(index: number, featureEvery = FEATURE_EVERY): boolean {
  return featureEvery > 0 && index % featureEvery === 0;
}

interface ProductGridProps {
  products: Product[];
  /** Set to 0 for a plain, even grid. */
  featureEvery?: number;
  className?: string;
}

/** A bento grid of product cards: a large feature card, then regular ones that pack around it. */
export function ProductGrid({ products, featureEvery = FEATURE_EVERY, className }: ProductGridProps) {
  return (
    <div className={cx(styles.container, className)}>
      <ul className={styles.grid}>
        {products.map((product, index) => {
          const feature = isFeatureSlot(index, featureEvery) && products.length > 2;
          return (
            <li key={product.id} className={styles.cell} data-feature={feature || undefined}>
              <ProductCard product={product} size={feature ? 'feature' : 'regular'} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={styles.container} aria-hidden="true">
      <div className={styles.grid}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className={styles.cell} data-feature={isFeatureSlot(index) || undefined}>
            <ProductCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}
