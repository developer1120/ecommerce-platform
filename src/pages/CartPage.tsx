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
        </section>

        <aside className={styles.summary} aria-labelledby="summary-title">
          <h2 id="summary-title" className={styles.summaryTitle}>
            <HeadingIcon icon={ReceiptText} />
            Order summary
          </h2>
          <FreeShippingMeter subtotal={totals.merchandiseTotal} />
          <PromoCodeForm />
          <ShippingEstimator
            destination={estimate.destination}
            method={estimate.method}
            merchandiseTotal={totals.merchandiseTotal}
            promoFreeShipping={Boolean(evaluation?.ok && evaluation.freeShipping)}
            onStateChange={estimate.setState}
            onMethodChange={estimate.setMethod}
          />
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt>Subtotal</dt>
              <dd>{formatMoney(totals.subtotal)}</dd>
            </div>
            {savings > 0 && (
              <div className={styles.row} data-tone="saving">
                {/* Already taken off the subtotal, so no minus sign. */}
                <dt>Sale savings included</dt>
                <dd>{formatMoney(savings)}</dd>
              </div>
            )}
            {totals.discount > 0 && (
              <div className={styles.row} data-tone="saving">
                <dt>Promo {promotion?.code}</dt>
                <dd>−{formatMoney(totals.discount)}</dd>
              </div>
            )}
            <div className={styles.row}>
              <dt>Shipping ({totals.shipping.method.label.toLowerCase()})</dt>
              <dd>{totals.shipping.price === 0 ? 'Free' : formatMoney(totals.shipping.price)}</dd>
            </div>
            <div className={styles.row}>
              <dt>
                {totals.tax && estimate.destination
                  ? `Tax (${estimate.destination.code} ${formatRate(totals.tax.rate)})`
                  : 'Tax'}
              </dt>
              {totals.tax ? (
                <dd>{formatMoney(totals.tax.tax)}</dd>
              ) : (
                <dd className={styles.pending}>Choose a state</dd>
              )}
            </div>
            <div className={styles.row} data-tone="total">
              <dt>{totals.tax ? 'Total' : 'Total before tax'}</dt>
              <dd>{formatMoney(totals.total)}</dd>
            </div>
          </dl>
          <Link to="/checkout" className={styles.checkout}>
            Checkout
          </Link>
          {totals.tax && totals.tax.exemptDepartments.length > 0 && (
            <p className={styles.note}>
              <Info aria-hidden="true" />
              {estimate.destination!.name} doesn't tax {totals.tax.exemptDepartments.join(' or ')} items.
            </p>
          )}
          <p className={styles.note}>
            <Info aria-hidden="true" />
            Prices and stock were checked when you opened your bag. Tax is an estimate of state sales tax.
          </p>
        </aside>
      </div>

      <ProductRail id="bag-suggestions" title="Pairs well with your bag" icon={Puzzle} result={suggestions} />
    </div>
  );
}

/**
 * Checks the bag against the live catalog once per visit, applies any
 * corrections and returns the notes to show. A failed check stays quiet:
 * checkout checks again.
 */
function useCatalogCheck() {
  const { lines, replaceLines } = useCart();
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const [productIds] = useState(() => [...new Set(lines.map((line) => line.productId))]);
  const [notices, setNotices] = useState<CartNotice[]>([]);
  const applied = useRef(false);

  const check = useAsync(
    (signal) => (productIds.length > 0 ? listProducts({ ids: productIds }, { signal }) : Promise.resolve([])),
    [productIds],
  );

  useEffect(() => {
    if (applied.current || check.status !== 'success') return;
    applied.current = true;
    const result = reconcileCart({ lines: linesRef.current }, check.data);
    if (result.changed) replaceLines(result.state.lines);
    setNotices(result.notices);
  }, [check.status, check.data, replaceLines]);

  if (notices.length === 0) return null;
  return (
    <section className={styles.notices} aria-labelledby="bag-notices-title">
      <div className={styles.noticesHeader}>
        <h2 id="bag-notices-title" className={styles.noticesTitle}>
          <HeadingIcon icon={Info} />
          We updated your bag
        </h2>
        <button type="button" className={styles.dismiss} onClick={() => setNotices([])}>
          Got it
        </button>
      </div>
      <ul>
        {notices.map((notice) => (
          <li key={`${notice.variantId}-${notice.kind}`} data-kind={notice.kind}>
            {notice.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
