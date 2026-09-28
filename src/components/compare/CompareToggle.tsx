import { Check, GitCompareArrows } from 'lucide-react';
import { MAX_COMPARE, toCompareItem } from '@/domain/compare';
import type { Product } from '@/domain/product';
import { cx } from '@/lib/cx';
import { useCompare } from '@/state/CompareProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Compare.module.css';

interface CompareToggleProps {
  product: Product;
  className?: string;
}

/** Puts a product into the comparison, or takes it out. Says so when four are already picked. */
export function CompareToggle({ product, className }: CompareToggleProps) {
  const { has, toggle } = useCompare();
  const { toast } = useToast();
  const picked = has(product.id);

  return (
    <button
      type="button"
      className={cx(styles.toggle, className)}
      aria-pressed={picked}
      aria-label={picked ? `Remove ${product.name} from compare` : `Add ${product.name} to compare`}
      onClick={() => {
        if (toggle(toCompareItem(product)) === 'full') {
          toast({
            tone: 'info',
            title: `You can compare up to ${MAX_COMPARE} products`,
            description: 'Remove one to add another.',
          });
        }
      }}
    >
      {picked ? <Check aria-hidden="true" /> : <GitCompareArrows aria-hidden="true" />}
      {picked ? 'Comparing' : 'Compare'}
    </button>
  );
}
