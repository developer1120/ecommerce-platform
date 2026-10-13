import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { CircleCheck, ClipboardList, CreditCard, Mail, MapPin, Package, SearchX, Truck } from 'lucide-react';
import { isApiError } from '@/api/client';
import { getOrder } from '@/api/ordersApi';
import { LoadError } from '@/components/feedback/LoadError';
import { OrderItems, OrderTotals } from '@/components/order/OrderParts';
import { HeadingIcon, Spinner } from '@/components/ui';
import { formatAddress } from '@/domain/address';
import { formatOrderDate, itemCountOf, STATUS_LABELS, type Order } from '@/domain/order';
import { describeCard } from '@/domain/payment';
import { formatDeliveryWindow } from '@/domain/shipping';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { removeKey } from '@/lib/storage';
import { useCart } from '@/state/CartProvider';
import { CHECKOUT_STORAGE_KEY } from '@/state/CheckoutProvider';
import { consumeJustPlaced } from '@/state/justPlaced';
import { useAuth } from '@/state/AuthProvider';
import { usePromo } from '@/state/PromoProvider';
import styles from './OrderConfirmationPage.module.css';

export function OrderConfirmationPage() {
  const { orderId = '' } = useParams();
  const location = useLocation();
  const justPlaced = Boolean((location.state as { justPlaced?: boolean } | null)?.justPlaced);
  const { status: authStatus, token } = useAuth();
  // Wait for a saved session to be checked, so an account's own order isn't refused while it loads.
  const result = useAsync(
    (signal) =>
      authStatus === 'checking' ? new Promise<never>(() => {}) : getOrder(orderId, token, { signal }),
    [orderId, authStatus, token],
  );
  usePageTitle(justPlaced ? 'Order confirmed' : `Order ${orderId}`);
  const { clear } = useCart();
  const { remove: removePromo } = usePromo();

  // Checkout handed over: empty the bag, code and draft now that checkout is off screen.
  // Only for the order just placed, so revisiting an old order never touches a new bag.
  useEffect(() => {
    if (!consumeJustPlaced(orderId)) return;
    removeKey(CHECKOUT_STORAGE_KEY, 'session');
    clear();
    removePromo();
  }, [orderId, clear, removePromo]);

  if (result.status === 'error') {
    if (isApiError(result.error) && result.error.code === 'NOT_FOUND') {
      return (
        <section className={styles.missing}>
          <h1>
            <HeadingIcon icon={SearchX} badge />
            We can't find that order
          </h1>
          <p>{result.error.message}</p>
          <Link to="/">Back to the shop</Link>
        </section>
      );
    }
    return <LoadError error={result.error} onRetry={result.reload} subject="your order" />;
  }
  if (!result.data) return <Spinner label="Loading your order" />;
  return <OrderDetails order={result.data} justPlaced={justPlaced} />;
}

function OrderDetails({ order, justPlaced }: { order: Order; justPlaced: boolean }) {
  const window = { earliest: new Date(order.shipping.earliest), latest: new Date(order.shipping.latest) };
  const count = itemCountOf(order);

  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <CircleCheck className={styles.heroIcon} aria-hidden="true" />
        <div>
          <p className={styles.eyebrow}>{justPlaced ? 'Thank you' : STATUS_LABELS[order.status]}</p>
          <h1 className={styles.title}>
            {justPlaced ? `Your order is on its way, ${order.address.firstName}` : `Order ${order.id}`}
          </h1>
          <p className={styles.lede}>
            Order <strong>{order.id}</strong> · placed {formatOrderDate(order.placedAt)} · {count}{' '}
            {count === 1 ? 'item' : 'items'}
          </p>
        </div>
      </header>

      {justPlaced && (
        <p className={styles.email}>
          <Mail aria-hidden="true" />
          <span>
            A receipt is on its way to <strong>{order.email}</strong>. We'll email again when it ships.
          </span>
        </p>
      )}

      <div className={styles.layout}>
        <section aria-labelledby="order-details-title" className={styles.card}>
          <h2 id="order-details-title" className={styles.cardTitle}>
            <HeadingIcon icon={ClipboardList} />
            Delivery and payment
          </h2>
          <dl className={styles.facts}>
            <div>
              <dt>
                <Truck aria-hidden="true" /> Arriving
              </dt>
              <dd>
                {formatDeliveryWindow(window)}
                <span className={styles.muted}>{order.shipping.label} delivery</span>
              </dd>
            </div>
            <div>
              <dt>
                <MapPin aria-hidden="true" /> Shipping to
              </dt>
              <dd>
                {formatAddress(order.address).map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </dd>
            </div>
            <div>
              <dt>
                <CreditCard aria-hidden="true" /> Paid with
              </dt>
              <dd>{describeCard(order.card)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="order-items-title" className={styles.card}>
          <h2 id="order-items-title" className={styles.cardTitle}>
            <HeadingIcon icon={Package} />
            Items
          </h2>
          <OrderItems lines={order.lines} />
          <OrderTotals order={order} />
        </section>
      </div>

      <div className={styles.actions}>
        <Link to="/shop/new" className={styles.primary}>
          Keep shopping
        </Link>
        {order.customerId && (
          <Link to={`/account/orders/${order.id}`} className={styles.secondary}>
            Track it in your account
          </Link>
        )}
      </div>
    </article>
  );
}
