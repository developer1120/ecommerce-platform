import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, CreditCard, MapPin, Package, Receipt, RotateCcw, SearchX } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { isApiError } from '@/api/client';
import { getOrder } from '@/api/ordersApi';
import { LoadError } from '@/components/feedback/LoadError';
import { OrderItems, OrderStatusBadge, OrderTimeline, OrderTotals } from '@/components/order/OrderParts';
import { OrderReturnsCard } from '@/components/returns/ReturnParts';
import { HeadingIcon, Spinner } from '@/components/ui';
import { formatAddress } from '@/domain/address';
import type { CartLine } from '@/domain/cart';
import { formatOrderDate, type Order, type OrderStatus } from '@/domain/order';
import { orderHistory } from '@/domain/orderStatus';
import { describeCard } from '@/domain/payment';
import { formatDeliveryWindow } from '@/domain/shipping';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useCartDrawer } from '@/state/CartDrawerProvider';
import { useCart } from '@/state/CartProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './OrderDetailPage.module.css';

export function OrderDetailPage() {
  const { orderId = '' } = useParams();
  usePageTitle(`Order ${orderId}`);
  const { token } = useAuth();
  const result = useAsync((signal) => getOrder(orderId, token, { signal }), [orderId, token]);

  if (result.status === 'error') {
    if (isApiError(result.error) && result.error.code === 'NOT_FOUND') {
      return (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            <HeadingIcon icon={SearchX} />
            We can't find that order
          </h2>
          <p>It isn't one of the orders on your account.</p>
          <Link to="/account/orders">Back to your orders</Link>
        </section>
      );
    }
    return <LoadError error={result.error} onRetry={result.reload} subject="this order" />;
  }
  if (!result.data) return <Spinner label="Loading your order" />;

  const order = result.data;
  const window = { earliest: new Date(order.shipping.earliest), latest: new Date(order.shipping.latest) };

  return (
    <article className={styles.page} aria-labelledby="order-title">
      <Link to="/account/orders" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> All orders
      </Link>
      <header className={styles.header}>
        <div>
          <h2 id="order-title" className={styles.title}>
            <HeadingIcon icon={Receipt} />
            Order {order.id}
          </h2>
          <p className={styles.muted}>Placed {formatOrderDate(order.placedAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      <section className={styles.card} aria-label="Progress">
        <OrderTimeline status={order.status} dates={stepDates(order)} />
        {order.tracking && (
          <p>
            {order.status === 'delivered' ? 'Delivered by' : 'On its way with'} {order.tracking.carrier}. Tracking number{' '}
            <span className={styles.tracking}>{order.tracking.number}</span>
          </p>
        )}
        {order.status !== 'cancelled' && order.status !== 'delivered' && (
          <p className={styles.muted}>
            Expected {formatDeliveryWindow(window)} by {order.shipping.label.toLowerCase()} delivery.
          </p>
        )}
      </section>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="ship-title">
          <h3 id="ship-title" className={styles.cardTitle}>
            <HeadingIcon icon={MapPin} />
            Shipping to
          </h3>
          <address className={styles.address}>
            {formatAddress(order.address).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </address>
          <p className={styles.muted}>{order.email}</p>
        </section>
        <section className={styles.card} aria-labelledby="pay-title">
          <h3 id="pay-title" className={styles.cardTitle}>
            <HeadingIcon icon={CreditCard} />
            Payment
          </h3>
          <p>{describeCard(order.card)}</p>
          <p className={styles.muted}>Billing address: the same as shipping.</p>
        </section>
      </div>

      <section className={styles.card} aria-labelledby="items-title">
        <h3 id="items-title" className={styles.cardTitle}>
          <HeadingIcon icon={Package} />
          Items
        </h3>
        <OrderItems lines={order.lines} action={(line) => <BuyAgain line={line} />} />
        <OrderTotals order={order} />
      </section>

      {(order.status === 'delivered' || order.status === 'shipped') && <OrderReturnsCard orderId={order.id} className={styles.card} />}

      <p className={styles.help}>
        Something not right? <Link to="/help/contact">Contact us</Link> with your order number and we'll sort it out.
      </p>
    </article>
  );
}

function stepDates(order: Order): Partial<Record<OrderStatus, string>> {
  return Object.fromEntries(orderHistory(order).map((event) => [event.status, event.at]));
}

/** Puts the same variant back in the bag, at today's price, if it's still in stock. */
function BuyAgain({ line }: { line: CartLine }) {
  const { add } = useCart();
  const { open } = useCartDrawer();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const [product] = await listProducts({ ids: [line.productId] });
      const variant = product?.variants.find((candidate) => candidate.id === line.variantId);
      if (!product || !variant || variant.stock <= 0) {
        toast({ tone: 'info', title: `${line.name} is sold out`, description: 'Check back soon, or try another option.' });
        return;
      }
      const result = add(product, variant, 1);
      if (result.added === 0) {
        toast({ tone: 'info', title: 'Already in your bag', description: 'You have all we can offer of this one.' });
      } else {
        toast({ title: 'Added to your bag', description: line.name, action: { label: 'View bag', onClick: open } });
      }
    } catch {
      toast({ tone: 'error', title: "We couldn't add that", description: 'Try again in a moment.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={styles.buyAgain}
      onClick={handleClick}
      aria-label={`Buy again: ${line.name}`}
      aria-busy={busy || undefined}
      disabled={busy}
    >
      <RotateCcw aria-hidden="true" /> Buy again
    </button>
  );
}
