import { useNavigate } from 'react-router';
import { Heart } from 'lucide-react';
import type { Product } from '@/domain/product';
import { cx } from '@/lib/cx';
import { useToast } from '@/state/ToastProvider';
import { useWishlist } from '@/state/WishlistProvider';
import styles from './WishlistButton.module.css';

interface WishlistButtonProps {
  product: Product;
  /** "icon" floats over a card's art; "labelled" shows the word too. */
  variant?: 'icon' | 'labelled';
  className?: string;
}

/** Saves or unsaves a product, and says which it will do. */
export function WishlistButton({ product, variant = 'icon', className }: WishlistButtonProps) {
  const { has, toggle } = useWishlist();
  const { toast } = useToast();
  const navigate = useNavigate();
  const saved = has(product.id);

  return (
    <button
      type="button"
      className={cx(styles.button, className)}
      data-variant={variant}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from your wishlist` : `Save ${product.name} to your wishlist`}
      onClick={() => {
        const nowSaved = toggle(product);
        if (nowSaved) {
          toast({
            title: 'Saved to your wishlist',
            description: product.name,
            action: { label: 'View', onClick: () => navigate('/wishlist') },
          });
        }
      }}
    >
      <Heart aria-hidden="true" className={styles.heart} />
      {variant === 'labelled' && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
