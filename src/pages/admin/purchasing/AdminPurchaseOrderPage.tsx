import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, ClipboardList, History, PackageCheck, Send } from 'lucide-react';
import { isApiError } from '@/api/client';
import {
  cancelPurchaseOrder,
  getPurchaseOrder,
  receivePurchaseOrder,
  sendPurchaseOrder,
  type PurchaseOrderDetail,
} from '@/api/purchaseOrdersApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Badge, Button, HeadingIcon, Spinner } from '@/components/ui';
import { formatMoney, multiplyCents } from '@/domain/money';
import { formatEventTime } from '@/domain/orderStatus';
import { checkReceipt, isLate, orderCost, orderUnits, PO_NOTE_MAX, PO_STATUS_LABELS, type PurchaseOrder } from '@/domain/purchasing';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import { formatPoDate, PurchaseOrderBadge, supplierPath } from './PurchasingParts';
import styles from '../Admin.module.css';

export function AdminPurchaseOrderPage() {
  const { poId = '' } = useParams();
  usePageTitle(`${poId} · Purchasing · Admin`);
  const { token } = useAuth();
  const result = useAsync((signal) => getPurchaseOrder(token!, poId, { signal }), [token, poId]);
  const [saved, setSaved] = useState<PurchaseOrder | null>(null);

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="this purchase order" />;
  if (!result.data) return <Spinner label="Loading purchase order" />;

  const order = saved ?? result.data.order;
  const { supplier } = result.data;
  const units = orderUnits(order);
  const reload = () => {
    setSaved(null);
    result.reload();
  };

  return (
    <article className={styles.section} aria-labelledby="po-detail-title">
      <Link to="/admin/purchasing" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> Purchasing
      </Link>
      <header className={styles.toolbar}>
        <div>
          <h2 id="po-detail-title" className={styles.sectionTitle}>
            <HeadingIcon icon={ClipboardList} />
            Purchase order {order.id}
          </h2>
          <p className={styles.muted}>
            <Link to={supplierPath(supplier.name)}>{supplier.name}</Link> · created {formatPoDate(order.createdAt)}
            {order.expectedAt && ` · expected ${formatPoDate(order.expectedAt)}`}
          </p>
        </div>
        <span className={styles.badges}>
          {isLate(order, new Date()) && <Badge tone="sale">Late</Badge>}
          <PurchaseOrderBadge status={order.status} />
        </span>
      </header>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Units</dt>
          <dd>{units.ordered}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Received</dt>
          <dd>{units.received}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Cost</dt>
          <dd>{formatMoney(orderCost(order))}</dd>
        </div>
      </dl>

      <div className={styles.form}>
        <div className={styles.formMain}>
          {order.status === 'sent' || order.status === 'partial' ? (
            <ReceiveForm key={units.received} order={order} stock={result.data.stock} onSaved={setSaved} onStale={reload} />
          ) : (
            <LinesTable order={order} />
          )}
          {order.note && (
            <section className={styles.panel} aria-labelledby="po-note-title">
              <h3 id="po-note-title" className={styles.legend}>
                Note to the maker
              </h3>
              <p className={styles.note}>{order.note}</p>
            </section>
          )}
        </div>
        <aside className={styles.formSide}>
          <OrderActions key={order.status} detail={{ ...result.data, order }} onSaved={setSaved} onStale={reload} />
          <section className={styles.panel} aria-labelledby="po-history-title">
            <h3 id="po-history-title" className={styles.legend}>
              <HeadingIcon icon={History} />
              History
            </h3>
            <ol className={styles.history} aria-labelledby="po-history-title">
              {order.history
                .slice()
                .reverse()
                .map((event) => (
                  <li key={`${event.status}-${event.at}`}>
                    <span className={styles.productName}>{PO_STATUS_LABELS[event.status]}</span>
                    <span className={styles.muted}>
                      {formatEventTime(event.at)} · {event.by}
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

function LinesTable({ order }: { order: PurchaseOrder }) {
  return (
    <section className={styles.panel} aria-labelledby="po-lines-title">
      <h3 id="po-lines-title" className={styles.legend}>
        Items
      </h3>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-labelledby="po-lines-title">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Ordered</th>
              <th scope="col">Received</th>
              <th scope="col">Unit cost</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.variantId}>
                <th scope="row">
                  <span className={styles.productName}>{line.name}</span>
                  <span className={styles.muted}>
                    {line.variantLabel ? `${line.variantLabel} · ` : ''}
                    {line.sku}
                  </span>
                </th>
                <td className={styles.number}>{line.ordered}</td>
                <td className={styles.number}>{line.received}</td>
                <td className={styles.number}>{formatMoney(line.unitCost)}</td>
                <td className={styles.number}>{formatMoney(multiplyCents(line.unitCost, line.ordered))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface ChildProps {
  onSaved: (order: PurchaseOrder) => void;
  /** Called when the order changed elsewhere, to load it again. */
  onStale: () => void;
}

function useFailure(onStale: () => void) {
  const { toast } = useToast();
  return (title: string, error: unknown) => {
    if (isApiError(error) && error.code === 'CONFLICT') {
      toast({ tone: 'error', title: 'This order changed', description: `${error.message} We've loaded the latest version.` });
      onStale();
    } else {
      toast({ tone: 'error', title, description: isApiError(error) ? error.message : undefined });
    }
  };
}

/** Books in what arrived. Each line starts empty; "Everything arrived" fills in what's outstanding. */
function ReceiveForm({ order, stock, onSaved, onStale }: { order: PurchaseOrder; stock: Record<string, number> } & ChildProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const fail = useFailure(onStale);
  const [arrived, setArrived] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const receipt: Record<string, number> = {};
    const found: Record<string, string> = {};
    for (const line of order.lines) {
      const text = arrived[line.variantId]?.trim() ?? '';
      if (text === '') continue;
      if (!/^\d+$/.test(text)) found[line.variantId] = 'Enter a whole number';
      else receipt[line.variantId] = Number(text);
    }
    Object.assign(found, Object.keys(found).length === 0 ? checkReceipt(order, receipt) : {});
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const result = await receivePurchaseOrder(token!, order.id, { receipt, expected: order.status });
      const count = Object.values(receipt).reduce((sum, quantity) => sum + quantity, 0);
      onSaved(result.order);
      toast({
        title: `${count} ${count === 1 ? 'unit' : 'units'} booked in`,
        description:
          result.order.status === 'received'
            ? `${order.id} is complete.${result.notified > 0 ? ` ${result.notified} waiting ${result.notified === 1 ? 'shopper was' : 'shoppers were'} emailed.` : ''}`
            : `The rest of ${order.id} is still on its way.`,
      });
    } catch (error) {
      fail("Couldn't book in the delivery", error);
      setSaving(false);
    }
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit} noValidate aria-labelledby="receive-title">
      <div className={styles.toolbar}>
        <h3 id="receive-title" className={styles.legend}>
          <HeadingIcon icon={PackageCheck} />
          Book in a delivery
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setArrived(Object.fromEntries(order.lines.map((line) => [line.variantId, String(line.ordered - line.received)])));
            setErrors({});
          }}
        >
          Everything arrived
        </Button>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Ordered</th>
              <th scope="col">Still to come</th>
              <th scope="col">In stock</th>
              <th scope="col">Arrived</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => {
              const outstanding = line.ordered - line.received;
              const label = `${line.name}${line.variantLabel ? `, ${line.variantLabel}` : ''}`;
              return (
                <tr key={line.variantId}>
                  <th scope="row">
                    <span className={styles.productName}>{line.name}</span>
                    <span className={styles.muted}>
                      {line.variantLabel ? `${line.variantLabel} · ` : ''}
                      {line.sku}
                    </span>
                  </th>
                  <td className={styles.number}>{line.ordered}</td>
                  <td className={styles.number}>{outstanding}</td>
                  <td className={styles.number}>{stock[line.variantId] ?? 0}</td>
                  <td>
                    {outstanding === 0 ? (
                      <span className={styles.muted}>Complete</span>
                    ) : (
                      <>
                        <input
                          className={styles.cellInput}
                          inputMode="numeric"
                          aria-label={`Units of ${label} that arrived`}
                          aria-invalid={errors[line.variantId] ? true : undefined}
                          aria-describedby={errors[line.variantId] ? `arrived-error-${line.variantId}` : undefined}
                          value={arrived[line.variantId] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            setArrived((current) => ({ ...current, [line.variantId]: value }));
                            if (Object.keys(errors).length > 0) setErrors({});
                          }}
                        />
                        {errors[line.variantId] && (
                          <span id={`arrived-error-${line.variantId}`} className={styles.error}>
                            {errors[line.variantId]}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {errors.form && (
        <p className={styles.error} role="alert">
          {errors.form}
        </p>
      )}
      <div>
        <Button type="submit" loading={saving} leadingIcon={<PackageCheck />}>
          Book in and restock
        </Button>
      </div>
    </form>
  );
}

const CLOSED: Partial<Record<PurchaseOrder['status'], string>> = {
  received: 'Everything has arrived. Nothing more to do.',
  cancelled: 'This order was cancelled.',
};

function OrderActions({ detail, onSaved, onStale }: { detail: PurchaseOrderDetail } & ChildProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const fail = useFailure(onStale);
  const { order, supplier } = detail;
  const [busy, setBusy] = useState<'send' | 'cancel' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const noteId = useId();

  if (CLOSED[order.status]) {
    return (
      <section className={styles.panel} aria-labelledby="po-actions-title">
        <h3 id="po-actions-title" className={styles.legend}>
          <HeadingIcon icon={Send} />
          Status
        </h3>
        <p className={styles.muted}>{CLOSED[order.status]}</p>
      </section>
    );
  }

  async function send() {
    setBusy('send');
    try {
      const updated = await sendPurchaseOrder(token!, order.id);
      onSaved(updated);
      toast({ title: `${order.id} sent`, description: `We've emailed ${supplier.email}. Expected ${formatPoDate(updated.expectedAt!)}.` });
    } catch (error) {
      fail("Couldn't send the order", error);
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('cancel');
    try {
      onSaved(await cancelPurchaseOrder(token!, order.id, { expected: order.status, note }));
      toast({ tone: 'info', title: `${order.id} cancelled`, description: order.status === 'draft' ? undefined : `We've told ${supplier.name}.` });
    } catch (error) {
      fail("Couldn't cancel the order", error);
      setBusy(null);
    }
  }

  const cancelLabel = order.status === 'draft' ? 'Cancel draft' : order.status === 'partial' ? 'Cancel the rest' : 'Cancel order';

  return (
    <section className={styles.panel} aria-labelledby="po-actions-title">
      <h3 id="po-actions-title" className={styles.legend}>
        <HeadingIcon icon={Send} />
        Next step
      </h3>
      {order.status === 'draft' && (
        <>
          <p className={styles.muted}>
            Sending emails the order to {supplier.email}. It should arrive in {supplier.leadDays} working days.
          </p>
          <Button block loading={busy === 'send'} disabled={busy === 'cancel'} leadingIcon={<Send />} onClick={() => void send()}>
            Send to {supplier.name}
          </Button>
        </>
      )}
      {order.status !== 'draft' && <p className={styles.muted}>Book in each delivery as it arrives. Stock goes on sale straight away.</p>}
      {confirming ? (
        <div className={styles.confirm}>
          {order.status !== 'draft' && (
            <div className={styles.field}>
              <label htmlFor={noteId} className={styles.label}>
                Message to {supplier.name} (optional)
              </label>
              <textarea id={noteId} className={styles.textarea} rows={2} maxLength={PO_NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          )}
          <div className={styles.confirmActions}>
            <Button variant="secondary" size="sm" loading={busy === 'cancel'} onClick={() => void cancel()}>
              Yes, {cancelLabel.toLowerCase()}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy === 'cancel'} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" block disabled={busy !== null} onClick={() => setConfirming(true)}>
          {cancelLabel}
        </Button>
      )}
    </section>
  );
}
