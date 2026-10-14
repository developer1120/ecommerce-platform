import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ReceiptText } from 'lucide-react';
import { listAdminOrders } from '@/api/adminOrdersApi';
import { LoadError } from '@/components/feedback/LoadError';
import { PageFooter } from '@/components/navigation/Pagination';
import { OrderStatusBadge } from '@/components/order/OrderParts';
import { HeadingIcon, Spinner, TextField, ToggleChip } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { formatOrderDate, itemCountOf, type Order, type OrderStatus } from '@/domain/order';
import { needsAction } from '@/domain/orderStatus';
import { PAGE_PARAM, paginate } from '@/domain/pagination';
import { fold } from '@/domain/search';
import { useAsync } from '@/hooks/useAsync';
import { useFocusOnPagination, usePageParam } from '@/hooks/usePage';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import styles from './Admin.module.css';

export const ADMIN_ORDERS_PAGE_SIZE = 20;

type Filter = 'open' | 'all' | OrderStatus;

const FILTERS: { value: Filter; label: string; test: (order: Order) => boolean }[] = [
  { value: 'open', label: 'To do', test: needsAction },
  { value: 'placed', label: 'To pack', test: (order) => order.status === 'placed' },
  { value: 'packed', label: 'To ship', test: (order) => order.status === 'packed' },
  { value: 'shipped', label: 'Shipped', test: (order) => order.status === 'shipped' },
  { value: 'delivered', label: 'Delivered', test: (order) => order.status === 'delivered' },
  { value: 'cancelled', label: 'Cancelled', test: (order) => order.status === 'cancelled' },
  { value: 'all', label: 'All', test: () => true },
];

const isFilter = (value: string | null): value is Filter => FILTERS.some((filter) => filter.value === value);

export function AdminOrdersPage() {
  usePageTitle('Orders · Admin');
  const { token } = useAuth();
  const orders = useAsync((signal) => listAdminOrders(token!, { signal }), [token]);
  const [params, setParams] = useSearchParams();
  const requested = params.get('status');
  // The filter lives in the address, so going back from an order returns to the same list.
  const filter: Filter = isFilter(requested) ? requested : 'open';
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => new Map(FILTERS.map((option) => [option.value, (orders.data ?? []).filter(option.test).length])),
    [orders.data],
  );
  const shown = useMemo(() => {
    const test = FILTERS.find((option) => option.value === filter)!.test;
    const words = fold(query.trim());
    return (orders.data ?? []).filter((order) => {
      if (!test(order)) return false;
      if (!words) return true;
      const { firstName, lastName } = order.address;
      return fold(`${order.id} ${order.email} ${firstName} ${lastName}`).includes(words);
    });
  }, [orders.data, filter, query]);
  const paged = paginate(shown, usePageParam(), ADMIN_ORDERS_PAGE_SIZE);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnPagination(titleRef);

  if (orders.status === 'error') return <LoadError error={orders.error} onRetry={orders.reload} subject="orders" />;
  if (!orders.data) return <Spinner label="Loading orders" />;

  return (
    <section className={styles.section} aria-labelledby="admin-orders-title">
      <div className={styles.toolbar}>
        <h2 id="admin-orders-title" ref={titleRef} tabIndex={-1} className={styles.sectionTitle}>
          <HeadingIcon icon={ReceiptText} />
          Orders
        </h2>
      </div>
      <div className={styles.filters}>
        <TextField
          label="Search orders"
          hideLabel
          placeholder="Search by order number, name or email"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // New search, new list: start from its first page.
            setParams(
              (previous) => {
                const next = new URLSearchParams(previous);
                next.delete(PAGE_PARAM);
                return next;
              },
              { replace: true },
            );
          }}
          className={styles.search}
        />
        <div className={styles.chips} role="group" aria-label="Show">
          {FILTERS.map((option) => {
            const count = counts.get(option.value) ?? 0;
            return (
              <ToggleChip
                key={option.value}
                selected={filter === option.value}
                accessibleLabel={`${option.label}, ${count} ${count === 1 ? 'order' : 'orders'}`}
                onToggle={() => setParams(option.value === 'open' ? {} : { status: option.value }, { replace: true })}
              >
                {option.label} <span className={styles.count}>{count}</span>
              </ToggleChip>
            );
          })}
        </div>
      </div>

      {orders.data.length === 0 ? (
        <p className={styles.empty}>No orders yet. They'll appear here as soon as shoppers check out.</p>
      ) : (
        <>
          <p className={styles.muted} aria-live="polite">
            {shown.length} of {orders.data.length} orders
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Placed</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Items</th>
                  <th scope="col">Total</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((order) => (
                  <tr key={order.id}>
                    <th scope="row">
                      <Link to={`/admin/orders/${order.id}`} className={styles.rowLink}>
                        {order.id}
                      </Link>
                    </th>
                    <td className={styles.number}>{formatOrderDate(order.placedAt)}</td>
                    <td>
                      <span className={styles.productName}>
                        {order.address.firstName} {order.address.lastName}
                      </span>
                      <span className={styles.muted}>
                        {order.email}
                        {!order.customerId && ' · guest'}
                      </span>
                    </td>
                    <td className={styles.number}>{itemCountOf(order)}</td>
                    <td className={styles.number}>{formatMoney(order.totals.total)}</td>
                    <td>
                      <OrderStatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && <p className={styles.empty}>No orders match. Try another search or filter.</p>}
          <PageFooter page={paged} noun="orders" />
        </>
      )}
    </section>
  );
}
