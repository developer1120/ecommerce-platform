import { Link } from 'react-router';
import { Heart, HeartOff, ShoppingBag, TrendingDown, X } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Price } from '@/components/product/Price';
import { ProductArt } from '@/components/product/ProductArt';
import { Badge, Button, HeadingIcon, Spinner } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { defaultVariant, isInStock, priceRange, type Product } from '@/domain/product';
import type { WishlistItem } from '@/api/wishlistApi';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useCartDrawer } from '@/state/CartDrawerProvider';
import { useCart } from '@/state/CartProvider';
import { useToast } from '@/state/ToastProvider';
import { useWishlist } from '@/state/WishlistProvider';
import styles from './WishlistPage.module.css';

export function WishlistPage() {
  usePageTitle('Wishlist');
  const { items } = useWishlist();
  const { status } = useAuth();
  // One string for the saved set, so the products reload only when it actually changes.
  const key = items.map((item) => item.productId).join(',');
  const products = useAsync((signal) => listProducts({ ids: key ? key.split(',') : [] }, { signal }), [key]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <HeadingIcon icon={Heart} badge />
          Wishlist
        </h1>
        <p className={styles.count}>
          {items.length} {items.length === 1 ? 'piece' : 'pieces'} saved
        </p>
      </header>

      {status === 'signed-out' && items.length > 0 && (
        <p className={styles.guestNote}>
          Saved on this device only. <Link to="/account/sign-in?next=%2Fwishlist">Sign in</Link> to keep your wishlist
          on every device.
        </p>
      )}

      {items.length === 0 ? (
        <section className={styles.empty}>
          <Heart className={styles.emptyIcon} aria-hidden="true" />
          <h2 className={styles.emptyTitle}>
            <HeadingIcon icon={HeartOff} />
            Nothing saved yet
          </h2>
          <p>Tap the heart on anything you love, and it will wait here for you.</p>
          <Link to="/shop/new" className={styles.primary}>
            Shop new arrivals
          </Link>
        </section>
      ) : products.status === 'error' ? (
        <LoadError error={products.error} onRetry={products.reload} subject="your wishlist" />
      ) : !products.data ? (
        <Spinner label="Loading your wishlist" />
      ) : (
        <ul className={styles.grid}>
          {items.map((item) => {
            const product = products.data!.find((candidate) => candidate.id === item.productId);
            return product ? (
              <li key={item.productId}>
                <SavedProduct product={product} item={item} />
              </li>
            ) : null;
          })}
        </ul>
      )}
    </div>
  );
}

function SavedProduct({ product, item }: { product: Product; item: WishlistItem }) {
  const { remove } = useWishlist();
  const { add } = useCart();
  const { open } = useCartDrawer();
  const { toast } = useToast();
  const inStock = isInStock(product);
  const current = priceRange(product).min;
  const drop = item.priceAtSave - current;
  const singleOption = product.variants.length === 1;

  function addToBag() {
    const result = add(product, defaultVariant(product), 1);
    if (result.added === 0) {
      toast({ tone: 'info', title: 'Already in your bag', description: 'You have all we can offer of this one.' });
      return;
    }
    toast({ title: 'Added to your bag', description: product.name, action: { label: 'View bag', onClick: open } });
  }

  return (
    <article className={styles.card} aria-labelledby={`saved-${product.id}`}>
      <Link to={`/product/${product.slug}`} className={styles.media} tabIndex={-1} aria-hidden="true">
        <ProductArt art={product.art} muted={!inStock} />
      </Link>
      <button
        type="button"
        className={styles.remove}
        aria-label={`Remove ${product.name} from your wishlist`}
        onClick={() => remove(product.id)}
      >
        <X aria-hidden="true" />
      </button>
      <div className={styles.body}>
        <p className={styles.maker}>{product.maker}</p>
        <h2 id={`saved-${product.id}`} className={styles.name}>
          <Link to={`/product/${product.slug}`}>{product.name}</Link>
        </h2>
        <Price product={product} />
        {drop > 0 && (
          <Badge tone="success" className={styles.drop}>
            <TrendingDown aria-hidden="true" /> {formatMoney(drop)} less than when you saved it
          </Badge>
        )}
        {!inStock ? (
          <>
            <p className={styles.soldOut}>Sold out for now</p>
            <Link to={`/product/${product.slug}`} className={styles.choose}>
              Get an email when it's back
            </Link>
          </>
        ) : singleOption ? (
          <Button size="sm" variant="secondary" leadingIcon={<ShoppingBag />} onClick={addToBag}>
            Add to bag
          </Button>
        ) : (
          <Link to={`/product/${product.slug}`} className={styles.choose}>
            Choose options
          </Link>
        )}
      </div>
    </article>
  );
}
