import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, History, MessageSquareText, Package, Receipt, RefreshCw, Undo2 } from 'lucide-react';
import { getAdminReturn, updateReturn, type AdminReturn } from '@/api/adminReturnsApi';
import { isApiError } from '@/api/client';
import { LoadError } from '@/components/feedback/LoadError';
import { ReturnStatusBadge } from '@/components/returns/ReturnParts';
import { Button, HeadingIcon, Spinner, TextField } from '@/components/ui';
import { describeOptions } from '@/domain/cart';
import { formatMoney, multiplyCents, parseMoney } from '@/domain/money';
import { formatOrderDate } from '@/domain/order';
import { formatEventTime, NOTE_MAX } from '@/domain/orderStatus';
import { describeCard } from '@/domain/payment';
import {
  formatReturnDate,
  NEXT_RETURN_STATUSES,
  reasonLabel,
  RETURN_METHODS,
  RETURN_MOVE_LABELS,
  RETURN_STATUS_LABELS,
  returnDeadline,
  returnItemCount,
  validateRefund,
  type ReturnRequest,
  type ReturnStatus,
} from '@/domain/returns';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Admin.module.css';

export function AdminReturnDetailPage() {
  const { returnId = '' } = useParams();
  usePageTitle(`Return ${returnId} · Admin`);
  const { token } = useAuth();
  const result = useAsync((signal) => getAdminReturn(token!, returnId, { signal }), [token, returnId]);
  // The latest saved version, so a change shows at once without another fetch.
  const [saved, setSaved] = useState<ReturnRequest | null>(null);

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="this return" />;
  if (!result.data) return <Spinner label="Loading return" />;

  const { order } = result.data;
  const request = saved ?? result.data.request;
  const method = RETURN_METHODS.find((option) => option.value === request.method)!;
  const count = returnItemCount(request);
  const deadline = order && returnDeadline(order);
  const reload = () => {
    setSaved(null);
    result.reload();
  };

  return (
    <article className={styles.section} aria-labelledby="return-title">
      <Link to="/admin/returns" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> All returns
      </Link>
      <header className={styles.toolbar}>
        <div>
          <h2 id="return-title" className={styles.sectionTitle}>
            <HeadingIcon icon={Undo2} />
            Return {request.id}
          </h2>
          <p className={styles.muted}>
            Requested {formatReturnDate(request.createdAt)} · {count} {count === 1 ? 'item' : 'items'} · {formatMoney(request.refund)}
          </p>
        </div>
        <ReturnStatusBadge status={request.status} />
      </header>

      <div className={styles.form}>
        <div className={styles.formMain}>
          <section className={styles.panel} aria-labelledby="return-items-title">
            <h3 id="return-items-title" className={styles.legend}>
              <HeadingIcon icon={Package} />
              Items coming back
            </h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {request.lines.map((line) => (
                    <tr key={line.variantId}>
                      <th scope="row">
                        <span className={styles.productName}>{line.name}</span>
                        <span className={styles.muted}>{describeOptions(line.options)}</span>
                      </th>
                      <td>{reasonLabel(line.reason)}</td>
                      <td className={styles.number}>{line.quantity}</td>
                      <td className={styles.number}>{formatMoney(multiplyCents(line.unitPrice, line.quantity))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.muted}>
              {request.status === 'refunded' ? 'Refunded' : 'Expected refund'} <strong>{formatMoney(request.refund)}</strong>, after any
              promo discount and with tax. Sending back: {method.label.toLowerCase()}.
            </p>
          </section>

          <div className={styles.pair}>
            <section className={styles.panel} aria-labelledby="return-note-title">
              <h3 id="return-note-title" className={styles.legend}>
                <HeadingIcon icon={MessageSquareText} />
                From the shopper
              </h3>
              {request.note ? <p className={styles.note}>{request.note}</p> : <p className={styles.muted}>No note.</p>}
              <p className={styles.muted}>{request.email}</p>
            </section>
            <section className={styles.panel} aria-labelledby="return-order-title">
              <h3 id="return-order-title" className={styles.legend}>
                <HeadingIcon icon={Receipt} />
                Order
              </h3>
              {order ? (
                <>
                  <p>
                    <Link to={`/admin/orders/${order.id}`} className={styles.rowLink}>
                      {order.id}
                    </Link>
                  </p>
                  <p className={styles.muted}>
                    Placed {formatOrderDate(order.placedAt)} · {formatMoney(order.totals.total)}
                  </p>
                  <p className={styles.muted}>{describeCard(order.card)}</p>
                  {deadline && <p className={styles.muted}>Return window closes {formatReturnDate(deadline)}</p>}
                </>
              ) : (
                <p className={styles.muted}>Order {request.orderId} is no longer on file.</p>
              )}
            </section>
          </div>
        </div>

        <aside className={styles.formSide}>
          <ReturnActions key={request.status} request={request} onSaved={setSaved} onStale={reload} />
          <section className={styles.panel} aria-labelledby="return-history-title">
            <h3 id="return-history-title" className={styles.legend}>
              <HeadingIcon icon={History} />
              History
            </h3>
            <ol className={styles.history} aria-labelledby="return-history-title">
              {request.history
                .slice()
                .reverse()
                .map((event) => (
                  <li key={`${event.status}-${event.at}`}>
                    <span className={styles.productName}>{RETURN_STATUS_LABELS[event.status]}</span>
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
