import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { WishlistButton } from '@/components/wishlist/WishlistButton';
import { describeOptions, MAX_PER_LINE } from '@/domain/cart';
import type { Product, Variant } from '@/domain/product';
import { useCartDrawer } from '@/state/CartDrawerProvider';
import { useCart } from '@/state/CartProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './AddToBag.module.css';

interface AddToBagProps {
  product: Product;
  variant: Variant;
}

/**
 * Quantity and the add button for the selected variant. The quantity is
 * limited to what can still go in the bag, and a toast confirms the add or
 * explains why fewer (or none) went in.
 */
export function AddToBag({ product, variant }: AddToBagProps) {
  const { lines, add } = useCart();
  const { open } = useCartDrawer();
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);

  const inBag = lines.find((line) => line.variantId === variant.id)?.quantity ?? 0;
  const canAdd = Math.max(0, Math.min(variant.stock, MAX_PER_LINE) - inBag);
  const chosen = Math.min(quantity, Math.max(1, canAdd));
  const soldOut = variant.stock <= 0;
  const options = describeOptions(variant.options);
  const label = options ? `${product.name}, ${options}` : product.name;

  function handleAdd() {
    if (soldOut) return;
    const result = add(product, variant, chosen);
    if (result.added === 0) {
      toast({
        tone: 'error',
        title: 'No more available',
        description: `You already have ${result.quantity} of ${label} in your bag, which is all we can offer.`,
        action: { label: 'View bag', onClick: open },
      });
    } else if (result.added < chosen) {
      toast({
        tone: 'info',
        title: `Only ${result.added} more added`,
        description: `${label}: you now have ${result.quantity}, the most we can offer.`,
        action: { label: 'View bag', onClick: open },
      });
    } else {
      toast({
        title: 'Added to your bag',
        description: `${result.added} × ${label}`,
        action: { label: 'View bag', onClick: open },
      });
    }
    setQuantity(1);
  }

  if (soldOut) {
    return (
      <div className={styles.addToBag}>
        <div className={styles.row}>
          <Button size="lg" block disabled>
            Sold out
          </Button>
          <WishlistButton product={product} variant="labelled" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.addToBag}>
      <div className={styles.row}>
        <QuantityStepper
          value={chosen}
          max={Math.max(1, canAdd)}
          label={`Quantity of ${label}`}
          onChange={setQuantity}
        />
        <Button
          variant="accent"
          size="lg"
          block
          leadingIcon={<ShoppingBag />}
          onClick={handleAdd}
          aria-disabled={canAdd === 0 || undefined}
        >
          Add to bag
        </Button>
        <WishlistButton product={product} variant="labelled" />
      </div>
      {inBag > 0 && (
        <p className={styles.inBag}>
          {canAdd === 0
            ? `You have all ${inBag} we can offer in your bag.`
            : `${inBag} already in your bag.`}
        </p>
      )}
    </div>
  );
}
