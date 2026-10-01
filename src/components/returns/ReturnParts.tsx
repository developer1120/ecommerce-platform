import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PackageX, Undo2 } from 'lucide-react';
import { isApiError } from '@/api/client';
import { cancelReturn, getOrderReturns } from '@/api/returnsApi';
import { Badge, Button, HeadingIcon, Spinner, type BadgeTone } from '@/components/ui';
import { describeOptions } from '@/domain/cart';
import { formatMoney } from '@/domain/money';
import {
  formatReturnDate,
  reasonLabel,
  RETURN_METHODS,
  RETURN_STATUS_LABELS,
  returnItemCount,
  type ReturnRequest,
  type ReturnStatus,
} from '@/domain/returns';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Returns.module.css';

const STATUS_TONES: Record<ReturnStatus, BadgeTone> = {
  requested: 'neutral',
  approved: 'accent',
  received: 'warning',
  refunded: 'success',
  rejected: 'sale',
  cancelled: 'neutral',
};

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{RETURN_STATUS_LABELS[status]}</Badge>;
}

/** What happens next, in the shopper's words, for each stage. */
const NEXT_STEP: Record<ReturnStatus, string> = {
  requested: "We'll check it within two working days and email you.",
  approved: 'Send the items back the way you chose. The label is in your email.',
  received: 'The parcel is back with us. Your refund is on its way.',
  refunded: 'Refunded to your card. It can take 5 to 10 days to show.',
  rejected: 'We could not accept this return.',
  cancelled: 'You cancelled this return.',
};

interface ReturnSummaryProps {
  request: ReturnRequest;
  /** Shown beside the status, such as a cancel button. */
  action?: ReactNode;
  /** Links the order number, on pages that list returns from many orders. */
  showOrder?: boolean;
}

export function ReturnSummary({ request, action, showOrder = false }: ReturnSummaryProps) {
  const method = RETURN_METHODS.find((option) => option.value === request.method)!;
  const lastNote = [...request.history].reverse().find((event) => event.note)?.note;
  const count = returnItemCount(request);
  return (
    <article className={styles.request} aria-labelledby={`return-${request.id}`}>
      <header className={styles.requestHeader}>
        <div>
          <h4 id={`return-${request.id}`} className={styles.requestTitle}>
            Return {request.id}
          </h4>
          <p className={styles.muted}>
            {showOrder && (
              <>
                Order <Link to={`/account/orders/${request.orderId}`}>{request.orderId}</Link> ·{' '}
              </>
            )}
            Requested {formatReturnDate(request.createdAt)} · {count} {count === 1 ? 'item' : 'items'}
          </p>
        </div>
        <ReturnStatusBadge status={request.status} />
      </header>
      <ul className={styles.lines}>
        {request.lines.map((line) => (
          <li key={line.variantId}>
            <span className={styles.lineName}>
              {line.quantity} × {line.name}
            </span>
            <span className={styles.muted}>{[describeOptions(line.options), reasonLabel(line.reason)].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
      <dl className={styles.facts}>
        <div>
          <dt>{request.status === 'refunded' ? 'Refunded' : 'Expected refund'}</dt>
          <dd>{formatMoney(request.refund)}</dd>
        </div>
        <div>
          <dt>Sending back</dt>
          <dd>{method.label}</dd>
        </div>
      </dl>
      <p className={styles.next}>{NEXT_STEP[request.status]}</p>
      {lastNote && request.status !== 'requested' && <p className={styles.note}>“{lastNote}”</p>}
      {action}
    </article>
  );
}

/** The returns section on an order: whether more can go back, and the requests so far. */
export function OrderReturnsCard({ orderId, className }: { orderId: string; className?: string }) {
  const { token } = useAuth();
  const returns = useAsync((signal) => getOrderReturns(token!, orderId, { signal }), [token, orderId]);

  return (
    <section className={className} aria-labelledby="returns-title">
      <h3 id="returns-title" className={styles.cardTitle}>
        <HeadingIcon icon={Undo2} />
        Returns
      </h3>
      {returns.status === 'error' ? (
        <p className={styles.muted}>We couldn't load returns for this order.</p>
      ) : !returns.data ? (
        <Spinner label="Loading returns" />
      ) : (
        <>
          {returns.data.eligibility.ok ? (
            <div className={styles.start}>
              <p>
                Not quite right? You can return items until <strong>{formatReturnDate(returns.data.eligibility.deadline)}</strong>. Returns
                are free.
              </p>
              <Link to={`/account/orders/${orderId}/return`} className={styles.startLink}>
                <Undo2 aria-hidden="true" /> Start a return
              </Link>
            </div>
          ) : (
            <p className={styles.muted}>{returns.data.eligibility.reason}</p>
          )}
          {returns.data.requests.length > 0 && (
            <ul className={styles.requests}>
              {returns.data.requests.map((request) => (
                <li key={request.id}>
                  <ReturnSummary
                    request={request}
                    action={request.status === 'requested' && <CancelReturn request={request} onCancelled={returns.reload} />}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function CancelReturn({ request, onCancelled }: { request: ReturnRequest; onCancelled: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await cancelReturn(token!, request.id);
      toast({ tone: 'info', title: 'Return cancelled', description: `Return ${request.id}` });
      onCancelled();
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't cancel the return", description: isApiError(error) ? error.message : 'Try again in a moment.' });
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" leadingIcon={<PackageX />} onClick={() => setConfirming(true)}>
          Cancel return
        </Button>
      </div>
    );
  }
  return (
    <div className={styles.confirm} role="group" aria-label={`Cancel return ${request.id}?`}>
      <p>Cancel this return? You can start a new one while the return window is open.</p>
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" loading={busy} onClick={() => void cancel()}>
          Yes, cancel it
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
