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

  // Focus follows the confirmation in and back out.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) cancelRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  if (!forward && !canCancel) {
    return (
      <section className={styles.panel} aria-labelledby="order-status-title">
        <h3 id="order-status-title" className={styles.legend}>
          <HeadingIcon icon={RefreshCw} />
          Status
        </h3>
        <p className={styles.muted}>
          {order.status === 'cancelled'
            ? 'This order is cancelled. Nothing more to do.'
            : 'This order has been delivered. Nothing more to do.'}
        </p>
      </section>
    );
  }

  async function move(to: OrderStatus) {
    setBusy(to);
    setProblem(null);
    try {
      const result = await updateOrderStatus(token!, order.id, {
        to,
        expected: order.status,
        ...(to === 'shipped' && { tracking: { carrier, number: tracking } }),
        ...(note.trim() && { note }),
      });
      setNote('');
      setConfirming(false);
      onSaved(result.order);
      toast(successToast(result.order, to, result.restocked, result.notified));
    } catch (error) {
      if (isApiError(error) && error.code === 'CONFLICT') {
        toast({ tone: 'error', title: 'This order changed', description: `${error.message} We've loaded the latest version.` });
        setConfirming(false);
        onStale();
      } else if (isApiError(error) && error.code === 'VALIDATION') {
        setProblem(error.message);
      } else {
        toast({ tone: 'error', title: "Couldn't update the order", description: isApiError(error) ? error.message : undefined });
      }
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!forward) return;
    if (forward === 'shipped') {
      const errors = {
        ...(!carrier && { carrier: 'Choose the carrier' }),
        ...(validateTracking(tracking) && { tracking: validateTracking(tracking)! }),
      };
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }
    void move(forward);
  }

  return (
    <section className={styles.panel} aria-labelledby="order-status-title">
      <h3 id="order-status-title" className={styles.legend}>
        <HeadingIcon icon={RefreshCw} />
        Update status
      </h3>
      <form className={styles.statusForm} onSubmit={onSubmit} noValidate>
        {forward === 'shipped' && (
          <>
            <SelectField
              label="Carrier"
              required
              placeholder="Choose a carrier"
              value={carrier}
              options={CARRIERS.map((value) => ({ value, label: value }))}
              onChange={(event) => setCarrier(event.target.value)}
              error={fieldErrors.carrier}
            />
            <TextField
              label="Tracking number"
              required
              autoComplete="off"
              spellCheck={false}
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
              error={fieldErrors.tracking}
            />
          </>
        )}
        <div className={styles.field}>
          <label htmlFor="status-note" className={styles.label}>
            Note for the history (optional)
          </label>
          <textarea
            id="status-note"
            className={styles.textarea}
            rows={2}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {problem && (
          <p className={styles.error} role="alert">
            {problem}
          </p>
        )}
        {forward && (
          <Button type="submit" block loading={busy === forward} disabled={busy !== null && busy !== forward}>
            {MOVE_LABELS[forward]}
          </Button>
        )}
      </form>

      {canCancel &&
        (confirming ? (
          <div className={styles.confirm} role="group" aria-labelledby="cancel-confirm-text">
            <p id="cancel-confirm-text">
              Cancel order {order.id}? Its {itemCountOf(order)} items go back into stock and {formatMoney(order.totals.total)} is
              refunded to the shopper's card.
            </p>
            <div className={styles.confirmActions}>
              <Button variant="primary" size="sm" loading={busy === 'cancelled'} onClick={() => void move('cancelled')}>
                Yes, cancel order
              </Button>
              <Button ref={keepRef} variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                Keep order
              </Button>
            </div>
          </div>
        ) : (
          <button ref={cancelRef} type="button" className={styles.dangerLink} onClick={() => setConfirming(true)}>
            Cancel order
          </button>
        ))}
    </section>
  );
}

function successToast(order: Order, to: OrderStatus, restocked: number, notified: number) {
  switch (to) {
    case 'shipped':
      return { title: 'Marked as shipped', description: `We've emailed ${order.email} the tracking number.` };
    case 'delivered':
      return { title: 'Marked as delivered', description: `We've let ${order.email} know.` };
    case 'cancelled': {
      const waiting = notified > 0 ? ` ${notified} waiting ${notified === 1 ? 'shopper was' : 'shoppers were'} emailed.` : '';
      return {
        title: 'Order cancelled',
        description: `${restocked} ${restocked === 1 ? 'item is' : 'items are'} back in stock and the refund is on its way.${waiting}`,
      };
    }
    default:
      return { title: `Marked as ${STATUS_LABELS[to].toLowerCase()}` };
  }
}
