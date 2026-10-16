import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ClipboardList, ClipboardPlus, Factory } from 'lucide-react';
import { isApiError } from '@/api/client';
import { createPurchaseOrder, getSupplier, type SupplierDetail } from '@/api/purchaseOrdersApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Badge, Button, HeadingIcon, Spinner } from '@/components/ui';
import { formatMoney, multiplyCents, sumCents } from '@/domain/money';
import { checkOrderQuantity, orderUnits, PO_NOTE_MAX } from '@/domain/purchasing';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import { formatPoDate, PurchaseOrderBadge, purchaseOrderPath } from './PurchasingParts';
import styles from '../Admin.module.css';

/** One maker: what to reorder, a new purchase order prefilled with it, and past orders. */
export function AdminSupplierPage() {
  const { supplier: name = '' } = useParams();
  usePageTitle(`${name} · Purchasing · Admin`);
  const { token } = useAuth();
  const result = useAsync((signal) => getSupplier(token!, name, { signal }), [token, name]);

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="this maker" />;
  if (!result.data) return <Spinner label="Loading maker" />;

  const { supplier, orders } = result.data;
  return (
    <article className={styles.section} aria-labelledby="supplier-title">
      <Link to="/admin/purchasing" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> Purchasing
      </Link>
      <header className={styles.toolbar}>
        <div>
          <h2 id="supplier-title" className={styles.sectionTitle}>
            <HeadingIcon icon={Factory} />
            {supplier.name}
          </h2>
          <p className={styles.muted}>
            {supplier.email} · delivers in {supplier.leadDays} working days · minimum {supplier.minUnits} units an order
          </p>
        </div>
      </header>

      <OrderBuilder key={orders.length} detail={result.data} />

      <section className={styles.panel} aria-labelledby="supplier-orders-title">
        <h3 id="supplier-orders-title" className={styles.legend}>
          <HeadingIcon icon={ClipboardList} />
          Orders with {supplier.name}
        </h3>
        {orders.length === 0 ? (
          <p className={styles.muted}>No purchase orders yet.</p>
        ) : (
          <ul className={styles.plainList}>
            {orders.map((order) => {
              const units = orderUnits(order);
              return (
                <li key={order.id}>
                  <Link to={purchaseOrderPath(order.id)} className={styles.rowLink}>
                    {order.id}
                  </Link>{' '}
                  <span className={styles.muted}>
                    {formatPoDate(order.createdAt)} · {units.received} of {units.ordered} received
                  </span>{' '}
                  <PurchaseOrderBadge status={order.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </article>
  );
}

/** The maker's whole range as an order form, with suggested quantities filled in. */
function OrderBuilder({ detail }: { detail: SupplierDetail }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { supplier, rows, suggestions, onOrder, costs } = detail;
  const suggested = new Map(suggestions.map((suggestion) => [suggestion.row.variantId, suggestion]));
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.variantId, String(suggested.get(row.variantId)?.quantity ?? '')])),
  );
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const noteId = useId();

  const chosen = rows
    .map((row) => ({ row, text: quantities[row.variantId]?.trim() ?? '' }))
    .filter(({ text }) => text !== '' && text !== '0');
  const units = chosen.reduce((sum, { text }) => sum + (Number(text) || 0), 0);
  const cost = sumCents(chosen.map(({ row, text }) => multiplyCents(costs[row.variantId] ?? 0, Number(text) || 0)));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    const lines: { variantId: string; quantity: number }[] = [];
    for (const { row, text } of chosen) {
      const check = checkOrderQuantity(text);
      if (check.ok) lines.push({ variantId: row.variantId, quantity: check.quantity });
      else found[row.variantId] = check.error;
    }
    if (Object.keys(found).length === 0 && lines.length === 0) found.form = 'Enter a quantity for at least one item';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const order = await createPurchaseOrder(token!, { supplier: supplier.name, lines, note });
      toast({ title: `Draft ${order.id} saved`, description: 'Check it over, then send it to the maker.' });
      navigate(purchaseOrderPath(order.id));
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't save the order", description: isApiError(error) ? error.message : undefined });
      setSaving(false);
    }
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit} noValidate aria-labelledby="builder-title">
      <h3 id="builder-title" className={styles.legend}>
        <HeadingIcon icon={ClipboardPlus} />
        New purchase order
      </h3>
      <p className={styles.muted}>
        {suggestions.length > 0
          ? `${suggestions.length} ${suggestions.length === 1 ? 'item needs' : 'items need'} reordering; their quantities are filled in to cover ${supplier.leadDays} days of lead time and a month of sales.`
          : 'Nothing needs reordering right now. Enter quantities to order anyway.'}
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">In stock</th>
              <th scope="col">Sold, 30 days</th>
              <th scope="col">On order</th>
              <th scope="col">Unit cost</th>
              <th scope="col">Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const suggestion = suggested.get(row.variantId);
              const label = `${row.productName}${row.variantLabel ? `, ${row.variantLabel}` : ''}`;
              return (
                <tr key={row.variantId}>
                  <th scope="row">
                    <span className={styles.productName}>{row.productName}</span>
                    <span className={styles.muted}>
                      {row.variantLabel ? `${row.variantLabel} · ` : ''}
                      {row.sku}
                    </span>
                    {suggestion && <Badge tone={row.level === 'out' ? 'sale' : 'warning'}>{suggestion.reason}</Badge>}
                  </th>
                  <td className={styles.number}>{row.stock}</td>
                  <td className={styles.number}>{row.sold30}</td>
                  <td className={styles.number}>{onOrder[row.variantId] || '—'}</td>
                  <td className={styles.number}>{formatMoney(costs[row.variantId] ?? 0)}</td>
                  <td>
                    <input
                      className={styles.cellInput}
                      inputMode="numeric"
                      aria-label={`Units of ${label}`}
                      aria-invalid={errors[row.variantId] ? true : undefined}
                      aria-describedby={errors[row.variantId] ? `qty-error-${row.variantId}` : undefined}
                      value={quantities[row.variantId] ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setQuantities((current) => ({ ...current, [row.variantId]: value }));
                        if (errors[row.variantId] || errors.form) setErrors({});
                      }}
                    />
                    {errors[row.variantId] && (
                      <span id={`qty-error-${row.variantId}`} className={styles.error}>
                        {errors[row.variantId]}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.stockNote} aria-live="polite">
        {units} {units === 1 ? 'unit' : 'units'} · {formatMoney(cost)}
        {units > 0 && units < supplier.minUnits && ` · below ${supplier.name}'s minimum of ${supplier.minUnits}`}
      </p>
      <div className={styles.field}>
        <label htmlFor={noteId} className={styles.label}>
          Note to the maker (optional)
        </label>
        <textarea id={noteId} className={styles.textarea} rows={2} maxLength={PO_NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      {errors.form && (
        <p className={styles.error} role="alert">
          {errors.form}
        </p>
      )}
      <div>
        <Button type="submit" loading={saving} leadingIcon={<ClipboardPlus />}>
          Save draft
        </Button>
      </div>
    </form>
  );
}
