import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, NotebookPen, Receipt, Undo2, UserRound } from 'lucide-react';
import { getCustomer, saveCustomerNote, type CustomerNote } from '@/api/adminCustomersApi';
import { isApiError } from '@/api/client';
import { LoadError } from '@/components/feedback/LoadError';
import { OrderStatusBadge } from '@/components/order/OrderParts';
import { ReturnStatusBadge } from '@/components/returns/ReturnParts';
import { Badge, Button, HeadingIcon, Spinner } from '@/components/ui';
import { CUSTOMER_NOTE_MAX } from '@/domain/customers';
import { formatMoney } from '@/domain/money';
import { formatOrderDate, itemCountOf } from '@/domain/order';
import { formatEventTime } from '@/domain/orderStatus';
import { formatReturnDate, returnItemCount } from '@/domain/returns';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import { SegmentBadges } from './SegmentBadges';
import styles from './Admin.module.css';

export function AdminCustomerDetailPage() {
  const { customerKey = '' } = useParams();
  const { token } = useAuth();
  const result = useAsync((signal) => getCustomer(token!, customerKey, { signal }), [token, customerKey]);
  usePageTitle(`${result.data?.customer.name ?? 'Customer'} · Admin`);

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="this customer" />;
  if (!result.data) return <Spinner label="Loading customer" />;

  const { customer, orders, returns, note } = result.data;
  const stats = [
    { label: 'Orders', value: String(customer.orders) },
    { label: 'Spent', value: formatMoney(customer.spent) },
    { label: 'Refunded', value: formatMoney(customer.refunded) },
    { label: 'Returns', value: String(customer.returns) },
  ];

  return (
    <article className={styles.section} aria-labelledby="customer-title">
      <Link to="/admin/customers" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> All customers
      </Link>
      <header className={styles.toolbar}>
        <div>
          <h2 id="customer-title" className={styles.sectionTitle}>
            <HeadingIcon icon={UserRound} />
            {customer.name}
          </h2>
          <p className={styles.muted}>
            {customer.email} · {customer.kind === 'account' ? 'Account' : 'Guest checkout'} since {formatOrderDate(customer.since)}
          </p>
        </div>
        <span className={styles.badges}>
          {customer.kind === 'guest' && <Badge tone="inverse">Guest</Badge>}
          <SegmentBadges segments={customer.segments} />
        </span>
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
        <div className={styles.formMain}>
          <section className={styles.panel} aria-labelledby="customer-orders-title">
            <h3 id="customer-orders-title" className={styles.legend}>
              <HeadingIcon icon={Receipt} />
              Orders
            </h3>
            {orders.length === 0 ? (
              <p className={styles.muted}>No orders yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Order</th>
                      <th scope="col">Placed</th>
                      <th scope="col">Items</th>
                      <th scope="col">Total</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <th scope="row" className={styles.nowrap}>
                          <Link to={`/admin/orders/${order.id}`} className={styles.rowLink}>
                            {order.id}
                          </Link>
                        </th>
                        <td>{formatOrderDate(order.placedAt)}</td>
                        <td className={styles.number}>{itemCountOf(order)}</td>
                        <td className={styles.number}>{formatMoney(order.totals.total)}</td>
                        <td>
                          <OrderStatusBadge status={order.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {returns.length > 0 && (
            <section className={styles.panel} aria-labelledby="customer-returns-title">
              <h3 id="customer-returns-title" className={styles.legend}>
                <HeadingIcon icon={Undo2} />
                Returns
              </h3>
              <ul className={styles.plainList}>
                {returns.map((request) => (
                  <li key={request.id}>
                    <span>
                      <Link to={`/admin/returns/${request.id}`} className={styles.rowLink}>
                        {request.id}
                      </Link>
                      <span className={styles.muted}>
                        {' '}
                        · {formatReturnDate(request.createdAt)} · {returnItemCount(request)} items · {formatMoney(request.refund)}
                      </span>
                    </span>
                    <ReturnStatusBadge status={request.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className={styles.formSide}>
          <NotePanel key={note?.at ?? 'none'} customerKey={customer.key} saved={note} />
        </aside>
      </div>
    </article>
  );
}

function NotePanel({ customerKey, saved }: { customerKey: string; saved?: CustomerNote }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState(saved ?? null);
  const [text, setText] = useState(saved?.text ?? '');
  const [busy, setBusy] = useState(false);
  const fieldId = useId();
  const hintId = useId();
  const unchanged = text.trim() === (current?.text ?? '');

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const note = await saveCustomerNote(token!, customerKey, text);
      setCurrent(note);
      setText(note?.text ?? '');
      toast({ title: note ? 'Note saved' : 'Note removed' });
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't save the note", description: isApiError(error) ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="customer-note-title">
      <h3 id="customer-note-title" className={styles.legend}>
        <HeadingIcon icon={NotebookPen} />
        Studio note
      </h3>
      <form className={styles.statusForm} onSubmit={save} noValidate>
        <div className={styles.field}>
          <label htmlFor={fieldId} className={styles.label}>
            Only the team sees this
          </label>
          <textarea
            id={fieldId}
            className={styles.textarea}
            rows={4}
            maxLength={CUSTOMER_NOTE_MAX}
            value={text}
            aria-describedby={hintId}
            onChange={(event) => setText(event.target.value)}
          />
          <p id={hintId} className={styles.hint}>
            {current ? `Last saved by ${current.by}, ${formatEventTime(current.at)}` : 'Sizes they prefer, a gift they were planning, anything useful.'}
          </p>
        </div>
        <Button type="submit" size="sm" block loading={busy} disabled={unchanged}>
          {current && !text.trim() ? 'Remove note' : 'Save note'}
        </Button>
      </form>
    </section>
  );
}
