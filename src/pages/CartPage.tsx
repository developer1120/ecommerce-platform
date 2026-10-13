import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Info, Puzzle, ReceiptText, ShoppingBag } from 'lucide-react';
import { listProducts, listRecommendations } from '@/api/catalogApi';
import { preloadCheckout } from '@/app/lazyPages';
import { CartLineItem } from '@/components/cart/CartLineItem';
import { FreeShippingMeter } from '@/components/cart/FreeShippingMeter';
import { PromoCodeForm } from '@/components/cart/PromoCodeForm';
import { ProductRail } from '@/components/product/ProductRail';
import { ShippingEstimator } from '@/components/cart/ShippingEstimator';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { HeadingIcon } from '@/components/ui';
import { lookupProduct } from '@/data/catalogLookup';
import { reconcileCart, type CartNotice } from '@/domain/cartReconcile';
import { formatMoney } from '@/domain/money';
import { calculateOrderTotals } from '@/domain/orderTotals';
import { formatRate } from '@/domain/tax';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useCart } from '@/state/CartProvider';
import { usePromo } from '@/state/PromoProvider';
import { useShippingEstimate } from '@/state/useShippingEstimate';
import { useToast } from '@/state/ToastProvider';
import styles from './CartPage.module.css';

export function CartPage() {
  usePageTitle('Your bag');
  const { lines, itemCount, savings, setQuantity, remove, restoreLine, replaceLines } = useCart();
  const { toast } = useToast();
  const { promotion, evaluation } = usePromo();
  const estimate = useShippingEstimate();
  const notices = useCatalogCheck();
  const bagKey = [...new Set(lines.map((line) => line.productId))].sort().join(',');
  const suggestions = useAsync(
    (signal) => (bagKey ? listRecommendations(bagKey.split(','), 4, { signal }) : Promise.resolve([])),
    [bagKey],
  );
  const totals = calculateOrderTotals({
    lines,
    promo: evaluation,
    method: estimate.method,
    destination: estimate.destination,
    lookup: lookupProduct,
  });

  // Checkout is the likely next step, so its code starts loading now.
  const hasLines = lines.length > 0;
  useEffect(() => {
    if (hasLines) void preloadCheckout();
  }, [hasLines]);

  if (lines.length === 0) {
    return (
      <div className={styles.page}>
        <Breadcrumbs trail={[{ label: 'Home', to: '/' }, { label: 'Your bag' }]} />
        {notices}
        <section className={styles.empty}>
          <ShoppingBag className={styles.emptyIcon} aria-hidden="true" />
          <h1 className={styles.emptyTitle}>Your bag is empty</h1>
          <p>Things you add will wait here until you're ready.</p>
          <div className={styles.emptyLinks}>
            <Link to="/shop/new" className={styles.primaryLink}>
              Shop new arrivals
            </Link>
            <Link to="/shop">Browse everything</Link>
          </div>
        </section>
      </div>
    );
  }

  function removeAll() {
    const previous = lines;
    replaceLines([]);
    toast({
      tone: 'info',
      title: 'Your bag is empty',
      description: `Removed ${previous.length} ${previous.length === 1 ? 'item' : 'items'}.`,
      action: { label: 'Undo', onClick: () => replaceLines(previous) },
    });
  }

  return (
    <div className={styles.page}>
      <Breadcrumbs trail={[{ label: 'Home', to: '/' }, { label: 'Your bag' }]} />
      <header className={styles.header}>
        <h1 className={styles.title}>
          <HeadingIcon icon={ShoppingBag} badge />
          Your bag
        </h1>
        <p className={styles.count}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </p>
      </header>
      {notices}

      <div className={styles.layout}>
        <section aria-labelledby="bag-items-title">
          <h2 id="bag-items-title" className="visually-hidden">
            Items
          </h2>
          <ul className={styles.lines}>
            {lines.map((line) => (
              <CartLineItem
                key={line.variantId}
                line={line}
                onQuantityChange={(quantity) => setQuantity(line.variantId, quantity)}
                onRemove={() => {
                  remove(line.variantId);
                  toast({
                    tone: 'info',
                    title: 'Removed from your bag',
                    description: line.name,
                    action: { label: 'Undo', onClick: () => restoreLine(line) },
                  });
                }}
              />
            ))}
          </ul>
          <div className={styles.listActions}>
            <Link to="/shop">Continue shopping</Link>
            <button type="button" className={styles.removeAll} onClick={removeAll}>
              Remove all
            </button>
          </div>
