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
  );
}

interface ReturnActionsProps {
  request: AdminReturn['request'];
  onSaved: (request: ReturnRequest) => void;
  /** Called when the return changed elsewhere, to load it again. */
  onStale: () => void;
}

const DONE: Partial<Record<ReturnStatus, string>> = {
  refunded: 'Refunded. Nothing more to do.',
  rejected: 'Declined. The shopper has been told why.',
  cancelled: 'The shopper cancelled this return.',
};

function ReturnActions({ request, onSaved, onStale }: ReturnActionsProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const next = NEXT_RETURN_STATUSES[request.status];
  const forward = next.find((status) => status !== 'rejected');
  const canDecline = next.includes('rejected');
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [amount, setAmount] = useState((request.refund / 100).toFixed(2));
  const [errors, setErrors] = useState<{ note?: string; amount?: string }>({});
  const [busy, setBusy] = useState<ReturnStatus | null>(null);
  const noteId = useId();
  const noteHelpId = useId();

  if (!forward && !canDecline) {
    return (
      <section className={styles.panel} aria-labelledby="return-status-title">
        <h3 id="return-status-title" className={styles.legend}>
          <HeadingIcon icon={RefreshCw} />
          Status
        </h3>
        <p className={styles.muted}>{DONE[request.status]}</p>
      </section>
    );
  }

  const cents = parseMoney(amount);
  const lower = forward === 'refunded' && cents !== null && cents < request.refund;

  function check(to: ReturnStatus): boolean {
    const found: typeof errors = {};
    if (to === 'rejected' && !note.trim()) found.note = 'Tell the shopper why';
    if (to === 'refunded') {
      const problem = validateRefund(cents, request.refund);
      if (problem) found.amount = problem;
      else if (lower && !note.trim()) found.note = 'Say why the refund is less than expected';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function move(to: ReturnStatus) {
    if (!check(to)) return;
    setBusy(to);
    try {
      const result = await updateReturn(token!, request.id, {
        to,
        expected: request.status,
        ...(note.trim() && { note }),
        ...(to === 'received' && { restock }),
        ...(to === 'refunded' && { amount: cents! }),
      });
      onSaved(result.request);
      toast(successToast(result.request, to, result.restocked));
    } catch (error) {
      if (isApiError(error) && error.code === 'CONFLICT') {
        toast({ tone: 'error', title: 'This return changed', description: `${error.message} We've loaded the latest version.` });
        onStale();
      } else {
        toast({ tone: 'error', title: "Couldn't update the return", description: isApiError(error) ? error.message : undefined });
      }
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="return-status-title">
      <h3 id="return-status-title" className={styles.legend}>
        <HeadingIcon icon={RefreshCw} />
        Next step
      </h3>
      <form
        className={styles.statusForm}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (forward) void move(forward);
        }}
      >
        {forward === 'received' && (
          <label className={styles.checkRow}>
            <input type="checkbox" checked={restock} onChange={(event) => setRestock(event.target.checked)} />
            Put the items back in stock
          </label>
        )}
        {forward === 'refunded' && (
          <TextField
            label="Refund amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={errors.amount}
            hint={`Up to ${formatMoney(request.refund)}`}
          />
        )}
        <div className={styles.field}>
          <label htmlFor={noteId} className={styles.label}>
            Message to the shopper {canDecline || lower ? '' : '(optional)'}
          </label>
          <textarea
            id={noteId}
            className={styles.textarea}
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={noteHelpId}
            onChange={(event) => {
              setNote(event.target.value);
              if (errors.note) setErrors((current) => ({ ...current, note: undefined }));
            }}
          />
          <p id={noteHelpId} className={errors.note ? styles.error : styles.hint}>
            {errors.note ?? (canDecline ? 'Needed to decline. Included in the email.' : 'Included in the email and the history.')}
          </p>
        </div>
        {forward && (
          <Button type="submit" block loading={busy === forward} disabled={busy !== null && busy !== forward}>
            {RETURN_MOVE_LABELS[forward]}
          </Button>
        )}
        {canDecline && (
          <Button
            variant="secondary"
            block
            loading={busy === 'rejected'}
            disabled={busy !== null && busy !== 'rejected'}
            onClick={() => void move('rejected')}
          >
            {RETURN_MOVE_LABELS.rejected}
          </Button>
        )}
      </form>
    </section>
  );
}

function successToast(request: ReturnRequest, to: ReturnStatus, restocked: number) {
  switch (to) {
    case 'approved':
      return { title: 'Return approved', description: `We've emailed ${request.email} the ${request.method === 'pickup' ? 'pickup details' : 'label'}.` };
    case 'received':
      return {
        title: 'Marked as received',
        description: restocked > 0 ? `${restocked} ${restocked === 1 ? 'item is' : 'items are'} back in stock.` : 'Nothing was restocked.',
      };
    case 'refunded':
      return { title: 'Refund issued', description: `${formatMoney(request.refund)} is on its way to ${request.email}.` };
    case 'rejected':
      return { tone: 'info' as const, title: 'Return declined', description: `We've emailed ${request.email} your message.` };
    default:
      return { title: `Marked as ${RETURN_STATUS_LABELS[to].toLowerCase()}` };
  }
}
