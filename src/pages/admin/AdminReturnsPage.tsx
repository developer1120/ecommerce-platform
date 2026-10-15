import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Undo2 } from 'lucide-react';
import { listAdminReturns } from '@/api/adminReturnsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { ReturnStatusBadge } from '@/components/returns/ReturnParts';
import { HeadingIcon, Spinner, TextField, ToggleChip } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { formatReturnDate, inQueue, RETURN_QUEUES, returnItemCount, type ReturnQueue } from '@/domain/returns';
import { fold } from '@/domain/search';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import styles from './Admin.module.css';

const isQueue = (value: string | null): value is ReturnQueue => RETURN_QUEUES.some((queue) => queue.value === value);

const EMPTY: Record<ReturnQueue, string> = {
  review: 'No returns waiting for review.',
  awaiting: 'No parcels on their way back.',
  refund: 'Nothing waiting for a refund.',
  closed: 'No closed returns yet.',
  all: "No returns yet. They'll appear here when shoppers send something back.",
};

/** Returns shoppers asked for, sorted into what the studio has to do next. */
export function AdminReturnsPage() {
  usePageTitle('Returns · Admin');
  const { token } = useAuth();
  const returns = useAsync((signal) => listAdminReturns(token!, { signal }), [token]);
  const [params, setParams] = useSearchParams();
  const requested = params.get('queue');
  // The tab lives in the address, so going back from a return lands on the same list.
  const queue: ReturnQueue = isQueue(requested) ? requested : 'review';
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => new Map(RETURN_QUEUES.map((option) => [option.value, (returns.data ?? []).filter((request) => inQueue(request, option.value)).length])),
    [returns.data],
  );
  const shown = useMemo(() => {
    const words = fold(query.trim());
    return (returns.data ?? []).filter(
      (request) => inQueue(request, queue) && (!words || fold(`${request.id} ${request.orderId} ${request.email}`).includes(words)),
    );
  }, [returns.data, queue, query]);

  if (returns.status === 'error') return <LoadError error={returns.error} onRetry={returns.reload} subject="returns" />;
  if (!returns.data) return <Spinner label="Loading returns" />;

  return (
    <section className={styles.section} aria-labelledby="admin-returns-title">
      <div className={styles.toolbar}>
        <h2 id="admin-returns-title" className={styles.sectionTitle}>
          <HeadingIcon icon={Undo2} />
          Returns
        </h2>
      </div>
      <div className={styles.filters}>
        <TextField
          label="Search returns"
          hideLabel
          placeholder="Search by return, order or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={styles.search}
        />
        <div className={styles.chips} role="group" aria-label="Show">
          {RETURN_QUEUES.map((option) => {
            const count = counts.get(option.value) ?? 0;
            return (
              <ToggleChip
                key={option.value}
                selected={queue === option.value}
                accessibleLabel={`${option.label}, ${count} ${count === 1 ? 'return' : 'returns'}`}
                onToggle={() => setParams(option.value === 'review' ? {} : { queue: option.value }, { replace: true })}
              >
                {option.label} <span className={styles.count}>{count}</span>
              </ToggleChip>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>{query.trim() ? `No returns match "${query.trim()}".` : EMPTY[queue]}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Return</th>
                <th scope="col">Requested</th>
                <th scope="col">Customer</th>
                <th scope="col">Items</th>
                <th scope="col">Refund</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((request) => (
                <tr key={request.id}>
                  <th scope="row" className={styles.nowrap}>
                    <Link to={`/admin/returns/${request.id}`} className={styles.productName}>
                      {request.id}
                    </Link>
                    <span className={styles.muted}>Order {request.orderId}</span>
                  </th>
                  <td>{formatReturnDate(request.createdAt)}</td>
                  <td>{request.email}</td>
                  <td className={styles.number}>{returnItemCount(request)}</td>
                  <td className={styles.number}>{formatMoney(request.refund)}</td>
                  <td>
                    <ReturnStatusBadge status={request.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
