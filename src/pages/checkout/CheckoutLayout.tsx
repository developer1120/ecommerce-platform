import { Suspense } from 'react';
import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router';
import { Lock } from 'lucide-react';
import { CHECKOUT_STEPS, CheckoutSteps } from '@/components/checkout/CheckoutSteps';
import { CheckoutSummary } from '@/components/checkout/CheckoutSummary';
import { PageFallback } from '@/components/feedback/PageFallback';
import { HeadingIcon } from '@/components/ui';
import { lookupProduct } from '@/data/catalogLookup';
import { findState } from '@/data/usStates';
import { calculateOrderTotals, type OrderTotals } from '@/domain/orderTotals';
import { findShippingMethod, SHIPPING_METHODS } from '@/domain/shipping';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useCart } from '@/state/CartProvider';
import { CheckoutProvider, useCheckout } from '@/state/CheckoutProvider';
import { usePromo } from '@/state/PromoProvider';
import styles from './CheckoutLayout.module.css';

interface CheckoutOutletContext {
  totals: OrderTotals;
}

/** The totals the order summary shows, for steps that need them too. */
export function useCheckoutTotals(): OrderTotals {
  return useOutletContext<CheckoutOutletContext>().totals;
}

/** Checkout needs something to buy; an empty bag goes back to the bag page. */
export function CheckoutLayout() {
  const { lines } = useCart();
  if (lines.length === 0) return <Navigate to="/cart" replace />;
  return (
    <CheckoutProvider>
      <CheckoutFrame />
    </CheckoutProvider>
  );
}

function CheckoutFrame() {
  usePageTitle('Checkout');
  const { pathname } = useLocation();
  const { lines } = useCart();
  const { evaluation } = usePromo();
  const { draft } = useCheckout();

  const current = [...CHECKOUT_STEPS].reverse().find((step) => pathname.startsWith(step.path))?.id ?? 'address';
  // A step can be revisited once everything before it is done.
  const reachable = new Set(['address']);
  if (draft.addressConfirmed) reachable.add('delivery');
  if (draft.addressConfirmed && draft.deliveryConfirmed) reachable.add('payment');
  if (draft.addressConfirmed && draft.deliveryConfirmed && draft.card) reachable.add('review');

  // Tax follows the state as soon as one is chosen, even before the address is confirmed.
  const destination = findState(draft.address.state);
  let method = findShippingMethod(draft.methodId) ?? SHIPPING_METHODS[0]!;
  if (destination?.remote && !method.remoteOk) method = SHIPPING_METHODS[0]!;
  const totals = calculateOrderTotals({ lines, promo: evaluation, method, destination, lookup: lookupProduct });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <HeadingIcon icon={Lock} badge />
          Checkout
        </h1>
        <p className={styles.secure}>
          <Lock aria-hidden="true" /> Secure checkout
        </p>
      </header>
      <CheckoutSteps current={current} reachable={reachable} />
      <div className={styles.layout}>
        <div className={styles.step}>
          <Suspense fallback={<PageFallback />}>
            <Outlet context={{ totals } satisfies CheckoutOutletContext} />
          </Suspense>
        </div>
        <CheckoutSummary totals={totals} stateCode={destination?.code} />
      </div>
    </div>
  );
}
