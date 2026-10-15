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
