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
