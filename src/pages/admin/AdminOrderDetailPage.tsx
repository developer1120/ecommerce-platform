import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, History, Package, Receipt, RefreshCw, Truck, UserRound } from 'lucide-react';
import { getAdminOrder, updateOrderStatus } from '@/api/adminOrdersApi';
import { isApiError } from '@/api/client';
import { LoadError } from '@/components/feedback/LoadError';
import { OrderItems, OrderStatusBadge, OrderTotals } from '@/components/order/OrderParts';
import { Button, HeadingIcon, Spinner, TextField } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import { formatAddress } from '@/domain/address';
import { formatMoney } from '@/domain/money';
import { formatOrderDate, itemCountOf, STATUS_LABELS, type Order, type OrderStatus } from '@/domain/order';
import {
  CARRIERS,
  formatEventTime,
  MOVE_LABELS,
  NEXT_STATUSES,
  NOTE_MAX,
  orderHistory,
  validateTracking,
} from '@/domain/orderStatus';
import { describeCard } from '@/domain/payment';
import { formatDeliveryWindow } from '@/domain/shipping';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Admin.module.css';

export function AdminOrderDetailPage() {
  const { orderId = '' } = useParams();
  usePageTitle(`Order ${orderId} · Admin`);
  const { token } = useAuth();
  const result = useAsync((signal) => getAdminOrder(token!, orderId, { signal }), [token, orderId]);
  // The latest saved version, so a change shows at once without another fetch.
  const [saved, setSaved] = useState<Order | null>(null);

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="this order" />;
  const order = saved ?? result.data;
  if (!order) return <Spinner label="Loading order" />;

  const reload = () => {
    setSaved(null);
    result.reload();
  };
  const window = { earliest: new Date(order.shipping.earliest), latest: new Date(order.shipping.latest) };
  const count = itemCountOf(order);

  return (
    <article className={styles.section} aria-labelledby="order-title">
      <Link to="/admin/orders" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> All orders
      </Link>
      <header className={styles.toolbar}>
        <div>
          <h2 id="order-title" className={styles.sectionTitle}>
            <HeadingIcon icon={Receipt} />
            Order {order.id}
          </h2>
          <p className={styles.muted}>
            Placed {formatOrderDate(order.placedAt)} · {count} {count === 1 ? 'item' : 'items'} · {formatMoney(order.totals.total)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className={styles.form}>
        <div className={styles.formMain}>
          <section className={styles.panel} aria-labelledby="order-items-title">
            <h3 id="order-items-title" className={styles.legend}>
              <HeadingIcon icon={Package} />
              Items
            </h3>
            <OrderItems lines={order.lines} />
            <OrderTotals order={order} />
          </section>
          <div className={styles.pair}>
            <section className={styles.panel} aria-labelledby="order-customer-title">
              <h3 id="order-customer-title" className={styles.legend}>
                <HeadingIcon icon={UserRound} />
                Customer
              </h3>
              <address className={styles.address}>
                {formatAddress(order.address).map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </address>
              <p className={styles.muted}>
                {order.email} · {order.customerId ? 'Account' : 'Guest checkout'}
              </p>
            </section>
            <section className={styles.panel} aria-labelledby="order-delivery-title">
              <h3 id="order-delivery-title" className={styles.legend}>
                <HeadingIcon icon={Truck} />
                Delivery and payment
              </h3>
              <p>
                {order.shipping.label}, due {formatDeliveryWindow(window)}
              </p>
              {order.tracking && (
                <p>
                  {order.tracking.carrier} tracking <span className={styles.code}>{order.tracking.number}</span>
                </p>
              )}
              <p className={styles.muted}>{describeCard(order.card)}</p>
            </section>
          </div>
        </div>

        <aside className={styles.formSide}>
          <StatusPanel order={order} onSaved={setSaved} onStale={reload} />
          <section className={styles.panel} aria-labelledby="order-history-title">
            <h3 id="order-history-title" className={styles.legend}>
              <HeadingIcon icon={History} />
              History
            </h3>
            <ol className={styles.history} aria-labelledby="order-history-title">
              {orderHistory(order)
                .slice()
                .reverse()
                .map((event) => (
                  <li key={`${event.status}-${event.at}`}>
                    <span className={styles.productName}>{STATUS_LABELS[event.status]}</span>
                    <span className={styles.muted}>
                      {formatEventTime(event.at)}
                      {event.by ? ` · ${event.by}` : ' · by the shopper'}
                    </span>
                    {event.note && <span className={styles.note}>{event.note}</span>}
                  </li>
                ))}
            </ol>
          </section>
        </aside>
      </div>
    </article>
  );
}

interface StatusPanelProps {
  order: Order;
  onSaved: (order: Order) => void;
  /** Called when the order changed elsewhere, to load it again. */
  onStale: () => void;
}

function StatusPanel({ order, onSaved, onStale }: StatusPanelProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const next = NEXT_STATUSES[order.status];
  const forward = next.find((status) => status !== 'cancelled');
  const canCancel = next.includes('cancelled');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ carrier?: string; tracking?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

