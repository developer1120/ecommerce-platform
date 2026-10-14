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

  return (
    <form className={styles.layout} onSubmit={submit} noValidate aria-labelledby="return-title">
      <div className={styles.main}>
        <header>
          <h2 id="return-title" className={styles.title}>
            <HeadingIcon icon={Undo2} />
            Return items
          </h2>
          <p className={styles.muted}>
            Order {order.id} · Returns close {formatReturnDate(deadline)}
          </p>
        </header>

        {(errors.form || serverError) && (
          <p className={styles.alert} role="alert">
            <CircleAlert aria-hidden="true" />
            {errors.form ?? serverError}
          </p>
        )}

        <section className={styles.card} aria-labelledby="items-title">
          <h3 id="items-title" className={styles.cardTitle}>
            Which items?
          </h3>
          <ul className={styles.items}>
            {order.lines.map((line) => {
              const left = remaining.get(line.variantId) ?? 0;
              const chosen = draft.find((entry) => entry.variantId === line.variantId)!;
              const error = errors[line.variantId];
              return (
                <li key={line.variantId}>
                  <fieldset className={styles.item} disabled={left === 0} data-chosen={chosen.quantity > 0 || undefined}>
                    <legend className="visually-hidden">{line.name}</legend>
                    <ProductArt art={line.art} color={line.swatch} className={styles.thumb} />
                    <div className={styles.itemBody}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={chosen.quantity > 0}
                          onChange={(event) => update(line.variantId, { quantity: event.target.checked ? 1 : 0, reason: '' })}
                        />
                        <span>
                          <span className={styles.itemName}>Return {line.name}</span>
                          <span className={styles.muted}>
                            {[describeOptions(line.options), `${formatMoney(line.unitPrice)} each`, left === 0 ? 'Already in a return' : `${left} of ${line.quantity} can go back`]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </label>
                      {chosen.quantity > 0 && (
                        <div className={styles.itemFields}>
                          {left > 1 && (
                            <SelectField
                              label="How many"
                              value={String(chosen.quantity)}
                              options={Array.from({ length: left }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))}
                              onChange={(event) => update(line.variantId, { quantity: Number(event.target.value) })}
                            />
                          )}
                          <SelectField
                            label="Reason"
                            placeholder="Choose a reason"
                            value={chosen.reason}
                            options={RETURN_REASONS}
                            error={error}
                            required
                            onChange={(event) => update(line.variantId, { reason: event.target.value as ReturnReason })}
                          />
                        </div>
                      )}
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ul>
        </section>

        <fieldset className={styles.card}>
          <legend className={cx(styles.cardTitle, styles.legend)}>How will you send it back?</legend>
          <div className={styles.options}>
            {RETURN_METHODS.map((option) => (
              <label key={option.value} className={styles.option}>
                <input type="radio" name="return-method" value={option.value} checked={method === option.value} onChange={() => setMethod(option.value)} />
                <span className={styles.optionText}>
                  <span className={styles.optionName}>{option.label}</span>
                  <span className={styles.muted}>{option.description}</span>
                </span>
                <span className={styles.optionPrice}>Free</span>
              </label>
            ))}
          </div>
        </fieldset>

        <section className={styles.card}>
          <label htmlFor={noteId} className={styles.cardTitle}>
            Anything we should know? <span className={styles.optional}>(optional)</span>
          </label>
          <textarea
            id={noteId}
            className={styles.textarea}
            rows={3}
            value={note}
            maxLength={RETURN_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className={styles.hint}>
            Photos of any damage help. Reply to our email with them. {note.length} / {RETURN_NOTE_MAX}
          </p>
        </section>
      </div>

      <aside className={styles.summary} aria-label="Refund">
        <h3 className={styles.cardTitle}>Your refund</h3>
        <dl className={styles.totals}>
          <div>
            <dt>Items</dt>
            <dd>{chosenCount}</dd>
          </div>
          <div>
            <dt>Return shipping</dt>
            <dd>Free</dd>
          </div>
          <div data-tone="total">
            <dt>Estimated refund</dt>
            <dd aria-live="polite">{formatMoney(refund)}</dd>
          </div>
        </dl>
        <p className={styles.muted}>
          Back to {describeCard(order.card)} once the items reach us. Any promo discount and tax are refunded in proportion; the original
          shipping isn't.
        </p>
        <Button type="submit" loading={busy} leadingIcon={<Undo2 />} className={styles.submit}>
          Request return
        </Button>
      </aside>
    </form>
  );
}
