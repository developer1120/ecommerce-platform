import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Check, PackageCheck } from 'lucide-react';
import { ProductArt } from '@/components/product/ProductArt';
import { Badge, type BadgeTone } from '@/components/ui';
import { describeOptions, lineTotal, type CartLine } from '@/domain/cart';
import { formatMoney } from '@/domain/money';
import { STATUS_LABELS, type Order, type OrderStatus } from '@/domain/order';
import { formatRate } from '@/domain/tax';
import styles from './OrderParts.module.css';

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  placed: 'neutral',
  packed: 'warning',
  shipped: 'accent',
  delivered: 'success',
  cancelled: 'sale',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

interface OrderItemsProps {
  lines: CartLine[];
  /** Something to show at the end of each line, such as "Buy again". */
  action?: (line: CartLine) => ReactNode;
}

export function OrderItems({ lines, action }: OrderItemsProps) {
  return (
    <ul className={styles.items}>
      {lines.map((line) => (
        <li key={line.variantId} className={styles.item}>
          <ProductArt art={line.art} color={line.swatch} className={styles.thumb} />
          <span className={styles.itemText}>
            <Link to={`/product/${line.slug}`} className={styles.itemName}>
              {line.name}
            </Link>
            <span className={styles.muted}>
              {[describeOptions(line.options), `Qty ${line.quantity}`].filter(Boolean).join(' · ')}
            </span>
            {action && <span className={styles.itemAction}>{action(line)}</span>}
          </span>
          <span className={styles.amount}>{formatMoney(lineTotal(line))}</span>
        </li>
      ))}
    </ul>
  );
}

export function OrderTotals({ order }: { order: Order }) {
  const { totals } = order;
  return (
    <dl className={styles.totals}>
      <div>
        <dt>Subtotal</dt>
        <dd>{formatMoney(totals.subtotal)}</dd>
      </div>
      {totals.discount > 0 && (
        <div data-tone="saving">
          <dt>Promo {order.promoCode}</dt>
          <dd>−{formatMoney(totals.discount)}</dd>
        </div>
      )}
      <div>
        <dt>Shipping</dt>
        <dd>{totals.shipping === 0 ? 'Free' : formatMoney(totals.shipping)}</dd>
      </div>
      <div>
        <dt>
          Tax ({order.address.state} {formatRate(totals.taxRate)})
        </dt>
        <dd>{formatMoney(totals.tax)}</dd>
      </div>
      <div data-tone="total">
        <dt>Total</dt>
        <dd>{formatMoney(totals.total)}</dd>
      </div>
      {order.refunds?.map((refund) => (
        <div key={refund.returnId} data-tone="saving">
          <dt>Refunded for return {refund.returnId}</dt>
          <dd>−{formatMoney(refund.amount)}</dd>
        </div>
      ))}
    </dl>
  );
}

const TIMELINE: OrderStatus[] = ['placed', 'packed', 'shipped', 'delivered'];

const STEP_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

interface OrderTimelineProps {
  status: OrderStatus;
  /** When each step was reached, shown under it. */
  dates?: Partial<Record<OrderStatus, string>>;
}

/** Placed → packed → shipped → delivered, with the steps reached so far filled in. */
export function OrderTimeline({ status, dates = {} }: OrderTimelineProps) {
  if (status === 'cancelled') {
    return (
      <p className={styles.cancelled} role="status">
        This order was cancelled. Any payment has been refunded to your card.
      </p>
    );
  }
  const reached = TIMELINE.indexOf(status);
  return (
    <ol className={styles.timeline} aria-label="Order progress">
      {TIMELINE.map((step, index) => {
        const state = index < reached ? 'done' : index === reached ? 'current' : 'upcoming';
        const date = state === 'upcoming' ? undefined : dates[step];
        return (
          <li key={step} className={styles.step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={styles.dot} aria-hidden="true">
              {state === 'done' ? <Check /> : state === 'current' && step === 'delivered' ? <PackageCheck /> : null}
            </span>
            <span className={styles.stepLabel}>
              {STATUS_LABELS[step]}
              {state === 'done' && <span className="visually-hidden"> (done)</span>}
            </span>
            {date && (
              <time dateTime={date} className={styles.stepDate}>
                {STEP_DATE.format(new Date(date))}
              </time>
            )}
          </li>
        );
      })}
    </ol>
  );
}
