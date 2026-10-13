import { Link } from 'react-router';
import { BellRing, UserRound } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { cancelAlert, listMyAlerts } from '@/api/stockAlertsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { HeadingIcon, Spinner } from '@/components/ui';
import { describeOptions } from '@/domain/cart';
import { formatOrderDate } from '@/domain/order';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './OrderDetailPage.module.css';

/** What the account holds about the shopper, and the restock alerts they are waiting on. */
export function DetailsPage() {
  usePageTitle('Your details');
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <section className={styles.card} aria-labelledby="details-title">
        <h2 id="details-title" className={styles.title}>
          <HeadingIcon icon={UserRound} />
          Your details
        </h2>
        <dl className={styles.address}>
          <dt className={styles.muted}>Name</dt>
          <dd>{user.name}</dd>
          <dt className={styles.muted}>Email</dt>
          <dd>{user.email}</dd>
          <dt className={styles.muted}>Member since</dt>
          <dd>{formatOrderDate(user.createdAt)}</dd>
        </dl>
      </section>
      <StockAlerts />
    </>
  );
}

function StockAlerts() {
  const { token } = useAuth();
  const { toast } = useToast();
  const result = useAsync(
    async (signal) => {
      const alerts = await listMyAlerts(token!, { signal });
      const products = alerts.length ? await listProducts({ ids: [...new Set(alerts.map((a) => a.productId))] }, { signal }) : [];
      return alerts.map((alert) => {
        const product = products.find((candidate) => candidate.id === alert.productId);
        const variant = product?.variants.find((candidate) => candidate.id === alert.variantId);
        return { alert, product, options: variant ? describeOptions(variant.options) : '' };
      });
    },
    [token],
  );

  return (
    <section className={styles.card} aria-labelledby="alerts-title">
      <h2 id="alerts-title" className={styles.title}>
        <HeadingIcon icon={BellRing} />
        Restock alerts
      </h2>
      {result.status === 'error' ? (
        <LoadError error={result.error} onRetry={result.reload} subject="your alerts" />
      ) : !result.data ? (
        <Spinner label="Loading your alerts" />
      ) : result.data.length === 0 ? (
        <p className={styles.muted}>
          <BellRing aria-hidden="true" style={{ display: 'inline', width: '1rem', verticalAlign: '-2px' }} /> When
          something you like sells out, choose "Notify me" on its page and it will be listed here.
        </p>
      ) : (
        <ul className={styles.alertList}>
          {result.data.map(({ alert, product, options }) => (
            <li key={alert.id} className={styles.alertItem}>
              <span>
                {product ? <Link to={`/product/${product.slug}?variant=${alert.variantId}`}>{product.name}</Link> : 'A product'}
                {options && <span className={styles.muted}> · {options}</span>}
                <span className={styles.muted}> · asked {formatOrderDate(alert.createdAt)}</span>
              </span>
              <button
                type="button"
                className={styles.buyAgain}
                aria-label={`Cancel alert for ${product?.name ?? 'this product'}`}
                onClick={async () => {
                  await cancelAlert(token!, alert.id).catch(() => undefined);
                  toast({ tone: 'info', title: 'Alert cancelled', description: product?.name });
                  result.reload();
                }}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
