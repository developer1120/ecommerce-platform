import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { LoadError } from '@/components/feedback/LoadError';
import { HeadingIcon } from '@/components/ui';
import type { Product } from '@/domain/product';
import type { AsyncResult } from '@/hooks/useAsync';
import { ProductCard, ProductCardSkeleton } from './ProductCard';
import styles from './ProductRail.module.css';

interface ProductRailProps {
  id: string;
  title: string;
  result: AsyncResult<Product[]>;
  more?: { to: string; label: string };
  /** Something extra in the header, such as a "Clear" button. */
  action?: ReactNode;
  /** How many placeholders to show while loading. */
  size?: number;
  /** Shown before the title. */
  icon?: LucideIcon;
}

/** A titled row of product cards. It disappears when there is nothing to show. */
export function ProductRail({ id, title, result, more, action, size = 4, icon }: ProductRailProps) {
  if (result.status === 'success' && result.data.length === 0) return null;
  const headingId = `${id}-title`;

  return (
    <section className={styles.rail} aria-labelledby={headingId} aria-busy={result.status === 'loading'}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.title}>
          {icon && <HeadingIcon icon={icon} />}
          {title}
        </h2>
        <div className={styles.actions}>
          {action}
          {more && (
            <Link to={more.to} className={styles.more}>
              {more.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      {result.status === 'error' ? (
        <LoadError error={result.error} onRetry={result.reload} subject="these products" />
      ) : (
        <div className={styles.grid}>
          {result.data
            ? result.data.map((product) => <ProductCard key={product.id} product={product} />)
            : Array.from({ length: size }, (_, index) => <ProductCardSkeleton key={index} />)}
        </div>
      )}
    </section>
  );
}
