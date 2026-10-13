import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, CircleAlert, Undo2 } from 'lucide-react';
import { isApiError } from '@/api/client';
import { getOrder } from '@/api/ordersApi';
import { getOrderReturns, requestReturn } from '@/api/returnsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { ProductArt } from '@/components/product/ProductArt';
import { Button, HeadingIcon, Spinner } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import { describeOptions } from '@/domain/cart';
import { formatMoney } from '@/domain/money';
import type { Order } from '@/domain/order';
import { describeCard } from '@/domain/payment';
import {
  estimateRefund,
  formatReturnDate,
  RETURN_METHODS,
  RETURN_NOTE_MAX,
  RETURN_REASONS,
  validateReturn,
  type ReturnDraftLine,
  type ReturnMethod,
  type ReturnReason,
} from '@/domain/returns';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cx } from '@/lib/cx';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './ReturnRequestPage.module.css';

export function ReturnRequestPage() {
  const { orderId = '' } = useParams();
  usePageTitle(`Return items from ${orderId}`);
  const { token } = useAuth();
  const result = useAsync(
    (signal) => Promise.all([getOrder(orderId, token, { signal }), getOrderReturns(token!, orderId, { signal })]),
    [orderId, token],
  );

  const back = (
    <Link to={`/account/orders/${orderId}`} className={styles.back}>
      <ArrowLeft aria-hidden="true" /> Back to the order
    </Link>
  );

  if (result.status === 'error') {
    if (isApiError(result.error) && result.error.code === 'NOT_FOUND') {
      return (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>We can't find that order</h2>
          <p>It isn't one of the orders on your account.</p>
          <Link to="/account/orders">Back to your orders</Link>
        </section>
      );
    }
    return <LoadError error={result.error} onRetry={result.reload} subject="this order" />;
  }
  if (!result.data) return <Spinner label="Loading your order" />;

  const [order, returns] = result.data;
  if (!returns.eligibility.ok) {
    return (
      <div className={styles.page}>
        {back}
        <section className={styles.card} aria-labelledby="return-title">
          <h2 id="return-title" className={styles.title}>
            <HeadingIcon icon={Undo2} />
            Return items
          </h2>
          <p>{returns.eligibility.reason}</p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {back}
      <ReturnForm order={order} remaining={new Map(Object.entries(returns.remaining))} deadline={returns.eligibility.deadline} />
    </div>
  );
}

interface ReturnFormProps {
  order: Order;
  remaining: Map<string, number>;
  deadline: Date;
}

function ReturnForm({ order, remaining, deadline }: ReturnFormProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ReturnDraftLine[]>(() =>
    order.lines.map((line) => ({ variantId: line.variantId, quantity: 0, reason: '' })),
  );
  const [method, setMethod] = useState<ReturnMethod>('drop-off');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noteId = useId();

  const refund = useMemo(
    () =>
      estimateRefund(
        order,
        draft
          .filter((line) => line.quantity > 0)
          .map((line) => ({ unitPrice: order.lines.find((ordered) => ordered.variantId === line.variantId)!.unitPrice, quantity: line.quantity })),
      ),
    [order, draft],
  );
  const chosenCount = draft.reduce((total, line) => total + line.quantity, 0);

  function update(variantId: string, change: Partial<ReturnDraftLine>) {
    setDraft((lines) => lines.map((line) => (line.variantId === variantId ? { ...line, ...change } : line)));
    // Changing an item clears its error, and the "choose at least one" message.
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== variantId && key !== 'form')));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    const found = validateReturn(order, draft, remaining);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await requestReturn(token!, { orderId: order.id, lines: draft, method, note });
      toast({ title: 'Return requested', description: `We've emailed ${order.email} with the next steps.` });
      navigate(`/account/orders/${order.id}`);
    } catch (error) {
      setServerError(isApiError(error) ? error.message : "We couldn't send your return. Try again in a moment.");
      setBusy(false);
    }
  }

