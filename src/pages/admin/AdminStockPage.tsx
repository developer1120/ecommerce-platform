import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, History, PackagePlus, Warehouse } from 'lucide-react';
import { adjustStock, getStockHistory, type StockHistory } from '@/api/inventoryApi';
import { isApiError } from '@/api/client';
import { LoadError } from '@/components/feedback/LoadError';
import { Button, HeadingIcon, Spinner, TextField } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import {
  checkAdjustment,
  daysOfCover,
  MANUAL_REASONS,
  MOVEMENT_LABELS,
  MOVEMENT_NOTE_MAX,
  type ManualReason,
  type StockMovement,
} from '@/domain/inventory';
import { formatEventTime } from '@/domain/orderStatus';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Admin.module.css';

/** One variant's stock: adjust it by hand, and see every change that led here. */
export function AdminStockPage() {
  const { variantId = '' } = useParams();
  const { token } = useAuth();
  const result = useAsync((signal) => getStockHistory(token!, variantId, { signal }), [token, variantId]);
  const name = result.data ? [result.data.row.productName, result.data.row.variantLabel].filter(Boolean).join(', ') : 'Stock';
  usePageTitle(`${name} · Inventory · Admin`);

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="this item" />;
  if (!result.data) return <Spinner label="Loading stock" />;

  const { row, movements } = result.data;
  const cover = daysOfCover(row);
  const stats = [
    { label: 'In stock', value: String(row.stock) },
    { label: 'Sold, 30 days', value: String(row.sold30) },
    { label: 'Lasts about', value: cover === undefined ? '—' : `${cover} ${cover === 1 ? 'day' : 'days'}` },
  ];

  return (
    <article className={styles.section} aria-labelledby="stock-title">
      <Link to="/admin/inventory" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> All inventory
      </Link>
      <header className={styles.toolbar}>
        <div>
          <h2 id="stock-title" className={styles.sectionTitle}>
            <HeadingIcon icon={Warehouse} />
            {row.productName}
          </h2>
          <p className={styles.muted}>
            {[row.variantLabel, `SKU ${row.sku}`].filter(Boolean).join(' · ')} ·{' '}
            <Link to={`/admin/products/${row.productId}`}>Edit product</Link>
          </p>
        </div>
      </header>

      <dl className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.form}>
        <section className={styles.panel} aria-labelledby="stock-history-title">
          <h3 id="stock-history-title" className={styles.legend}>
            <HeadingIcon icon={History} />
            History
          </h3>
          {movements.length === 0 ? (
            <p className={styles.muted}>No changes yet. Sales, deliveries and counts will show here.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Change</th>
                    <th scope="col">What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatEventTime(movement.at)}</td>
                      <td className={styles.number} data-direction={movement.change > 0 ? 'in' : 'out'}>
                        {movement.change > 0 ? `+${movement.change}` : `−${-movement.change}`}
                      </td>
                      <td>
                        <MovementDetail movement={movement} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className={styles.formSide}>
          <AdjustPanel key={row.stock} history={result.data} onSaved={result.reload} />
        </aside>
      </div>
    </article>
  );
}

function MovementDetail({ movement }: { movement: StockMovement }) {
  const reference = movement.reference;
  const link = reference?.startsWith('OR-')
    ? `/admin/orders/${reference}`
    : reference?.startsWith('RT-')
      ? `/admin/returns/${reference}`
      : undefined;
  return (
    <>
      <span className={styles.productName}>{MOVEMENT_LABELS[movement.reason]}</span>
      <span className={styles.muted}>
        {link && <Link to={link}>{reference}</Link>}
        {link && movement.by && ' · '}
        {movement.by}
      </span>
      {movement.note && <span className={styles.note}>{movement.note}</span>}
    </>
  );
}

function AdjustPanel({ history, onSaved }: { history: StockHistory; onSaved: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const { row } = history;
  const [reason, setReason] = useState<ManualReason>('received');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noteId = useId();
  const option = MANUAL_REASONS.find((candidate) => candidate.value === reason)!;
  const preview = quantity.trim() ? checkAdjustment(row.stock, reason, quantity) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const check = checkAdjustment(row.stock, reason, quantity);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    try {
      const result = await adjustStock(token!, row.variantId, { reason, quantity, expected: row.stock, note });
      const waiting = result.notified > 0 ? ` ${result.notified} waiting ${result.notified === 1 ? 'shopper was' : 'shoppers were'} emailed.` : '';
      toast({ title: 'Stock updated', description: `${row.productName} now has ${result.stock} in stock.${waiting}` });
      onSaved();
    } catch (caught) {
      if (isApiError(caught) && caught.code === 'CONFLICT') {
        toast({ tone: 'error', title: 'Stock changed', description: caught.message });
        onSaved();
      } else {
        setError(isApiError(caught) ? caught.message : "We couldn't save that. Try again in a moment.");
      }
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="adjust-title">
      <h3 id="adjust-title" className={styles.legend}>
        <HeadingIcon icon={PackagePlus} />
        Adjust stock
      </h3>
      <form className={styles.statusForm} onSubmit={submit} noValidate>
        <SelectField
          label="Reason"
          value={reason}
          options={MANUAL_REASONS}
          onChange={(event) => {
            setReason(event.target.value as ManualReason);
            setError(null);
          }}
        />
        <TextField
          label={option.hint}
          inputMode="numeric"
          autoComplete="off"
          value={quantity}
          error={error}
          hint={preview?.ok ? `Stock will be ${preview.after}` : `Now ${row.stock}`}
          onChange={(event) => {
            setQuantity(event.target.value);
            setError(null);
          }}
        />
        <div className={styles.field}>
          <label htmlFor={noteId} className={styles.label}>
            Note (optional)
          </label>
          <textarea
            id={noteId}
            className={styles.textarea}
            rows={2}
            maxLength={MOVEMENT_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Button type="submit" block loading={busy}>
          Save adjustment
        </Button>
      </form>
    </section>
  );
}
