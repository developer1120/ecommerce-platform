import { Link } from 'react-router';
import { PackageOpen, Undo2 } from 'lucide-react';
import { listMyReturns } from '@/api/returnsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { CancelReturn, ReturnSummary } from '@/components/returns/ReturnParts';
import { HeadingIcon, Spinner } from '@/components/ui';
import { isOpenReturn, RETURN_WINDOW_DAYS, type ReturnRequest } from '@/domain/returns';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import styles from './ReturnsPage.module.css';

/** Every return the shopper has started, in progress ones first. */
export function ReturnsPage() {
  usePageTitle('Your returns');
  const { token } = useAuth();
  const returns = useAsync((signal) => listMyReturns(token!, { signal }), [token]);

  if (returns.status === 'error') return <LoadError error={returns.error} onRetry={returns.reload} subject="your returns" />;
  if (!returns.data) return <Spinner label="Loading your returns" />;

  const open = returns.data.filter(isOpenReturn);
  const closed = returns.data.filter((request) => !isOpenReturn(request));

  return (
    <section className={styles.section} aria-labelledby="returns-page-title">
      <h2 id="returns-page-title" className={styles.title}>
        <HeadingIcon icon={Undo2} />
        Returns
      </h2>
      {returns.data.length === 0 ? (
        <div className={styles.empty}>
          <PackageOpen className={styles.emptyIcon} aria-hidden="true" />
          <p>
            No returns. If something isn't right, open the order from <Link to="/account/orders">your orders</Link> and start a return
            within {RETURN_WINDOW_DAYS} days of it arriving.
          </p>
        </div>
      ) : (
        <>
          <ReturnGroup title="In progress" empty="Nothing in progress." requests={open} onChanged={returns.reload} />
          {closed.length > 0 && <ReturnGroup title="Finished" requests={closed} onChanged={returns.reload} />}
        </>
      )}
    </section>
  );
}

interface ReturnGroupProps {
  title: string;
  empty?: string;
  requests: ReturnRequest[];
  onChanged: () => void;
}

function ReturnGroup({ title, empty, requests, onChanged }: ReturnGroupProps) {
  const id = `returns-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section className={styles.group} aria-labelledby={id}>
      <h3 id={id} className={styles.groupTitle}>
        {title} <span className={styles.count}>{requests.length}</span>
      </h3>
      {requests.length === 0 ? (
        <p className={styles.muted}>{empty}</p>
      ) : (
        <ul className={styles.list}>
          {requests.map((request) => (
            <li key={request.id}>
              <ReturnSummary
                request={request}
                showOrder
                action={request.status === 'requested' && <CancelReturn request={request} onCancelled={onChanged} />}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
