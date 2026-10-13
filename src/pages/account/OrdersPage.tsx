import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Package, PackageOpen } from 'lucide-react';
import { listMyOrders } from '@/api/ordersApi';
import { LoadError } from '@/components/feedback/LoadError';
import { OrderStatusBadge } from '@/components/order/OrderParts';
import { ProductArt } from '@/components/product/ProductArt';
import { HeadingIcon, Spinner, ToggleChip } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { formatOrderDate, itemCountOf, type Order } from '@/domain/order';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import styles from './OrdersPage.module.css';

type Filter = 'all' | 'open' | 'delivered' | 'cancelled';

const FILTERS: { value: Filter; label: string; test: (order: Order) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'open', label: 'In progress', test: (order) => ['placed', 'packed', 'shipped'].includes(order.status) },
  { value: 'delivered', label: 'Delivered', test: (order) => order.status === 'delivered' },
  { value: 'cancelled', label: 'Cancelled', test: (order) => order.status === 'cancelled' },
];

const MAX_THUMBS = 4;

export function OrdersPage() {
  usePageTitle('Your orders');
  const { token } = useAuth();
  const orders = useAsync((signal) => listMyOrders(token!, { signal }), [token]);
  const [filter, setFilter] = useState<Filter>('all');

  if (orders.status === 'error') return <LoadError error={orders.error} onRetry={orders.reload} subject="your orders" />;
  if (!orders.data) return <Spinner label="Loading your orders" />;

  if (orders.data.length === 0) {
    return (
      <section className={styles.empty}>
        <Package className={styles.emptyIcon} aria-hidden="true" />
        <h2 className={styles.emptyTitle}>
          <HeadingIcon icon={PackageOpen} />
          No orders yet
        </h2>
        <p>When you place an order while signed in, it will appear here with its delivery progress.</p>
        <Link to="/shop/new" className={styles.primary}>
          Shop new arrivals
        </Link>
      </section>
    );
  }

  const active = FILTERS.find((candidate) => candidate.value === filter)!;
  const shown = orders.data.filter(active.test);

  return (
    <section aria-labelledby="orders-title" className={styles.section}>
      <div className={styles.toolbar}>
        <h2 id="orders-title" className={styles.title}>
          <HeadingIcon icon={Package} />
          Orders
        </h2>
        <div className={styles.filters} role="group" aria-label="Show orders">
          {FILTERS.map((option) => (
            <ToggleChip key={option.value} selected={filter === option.value} onToggle={() => setFilter(option.value)}>
              {option.label}
            </ToggleChip>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className={styles.none}>No {active.label.toLowerCase()} orders.</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OrderCard({ order }: { order: Order }) {
  const count = itemCountOf(order);
  const extra = order.lines.length - MAX_THUMBS;
  return (
    <article className={styles.card} aria-labelledby={`order-${order.id}`}>
      <div className={styles.cardHeader}>
        <div>
          <h3 id={`order-${order.id}`} className={styles.number}>
            {order.id}
          </h3>
          <p className={styles.meta}>
            Placed {formatOrderDate(order.placedAt)} · {count} {count === 1 ? 'item' : 'items'} ·{' '}
            {formatMoney(order.totals.total)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className={styles.cardBody}>
        <ul className={styles.thumbs} aria-label="Items">
          {order.lines.slice(0, MAX_THUMBS).map((line) => (
            <li key={line.variantId} title={line.name}>
              <ProductArt art={line.art} color={line.swatch} className={styles.thumb} />
              <span className="visually-hidden">{line.name}</span>
            </li>
          ))}
          {extra > 0 && <li className={styles.more}>+{extra}</li>}
        </ul>
        <Link to={`/account/orders/${order.id}`} className={styles.view} aria-label={`View order ${order.id}`}>
          View order
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
