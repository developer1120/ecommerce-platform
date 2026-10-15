import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ClipboardList, Factory } from 'lucide-react';
import { listPurchaseOrders, listSuppliers } from '@/api/purchaseOrdersApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Badge, HeadingIcon, Spinner, ToggleChip } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { inPurchaseQueue, isLate, orderCost, orderUnits, PURCHASE_QUEUES, type PurchaseQueue } from '@/domain/purchasing';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { formatPoDate, PurchaseOrderBadge, purchaseOrderPath, supplierPath } from './PurchasingParts';
import styles from '../Admin.module.css';

const isQueue = (value: string | null): value is PurchaseQueue => PURCHASE_QUEUES.some((queue) => queue.value === value);

const EMPTY: Record<PurchaseQueue, string> = {
  open: 'Nothing on order. Start one from a maker below.',
  draft: 'No drafts.',
  closed: 'No received or cancelled orders yet.',
  all: 'No purchase orders yet. Start one from a maker below.',
};

/** Buying from makers: open purchase orders, and which makers need a new one. */
export function AdminPurchasingPage() {
  usePageTitle('Purchasing · Admin');
  const { token } = useAuth();
  const data = useAsync(
    async (signal) => {
      const [suppliers, orders] = await Promise.all([listSuppliers(token!, { signal }), listPurchaseOrders(token!, { signal })]);
      return { suppliers, orders };
    },
    [token],
  );
  const [params, setParams] = useSearchParams();
  const requested = params.get('queue');
  const queue: PurchaseQueue = isQueue(requested) ? requested : 'open';
  const now = new Date();

  const counts = useMemo(
    () => new Map(PURCHASE_QUEUES.map((option) => [option.value, (data.data?.orders ?? []).filter((order) => inPurchaseQueue(order, option.value)).length])),
    [data.data],
  );

  if (data.status === 'error') return <LoadError error={data.error} onRetry={data.reload} subject="purchasing" />;
  if (!data.data) return <Spinner label="Loading purchasing" />;

  const shown = data.data.orders.filter((order) => inPurchaseQueue(order, queue));
  // Makers with something to reorder come first.
  const suppliers = [...data.data.suppliers].sort((a, b) => b.toReorder - a.toReorder || a.supplier.name.localeCompare(b.supplier.name));

  return (
    <div className={styles.section}>
      <section className={styles.section} aria-labelledby="po-title">
        <div className={styles.toolbar}>
          <h2 id="po-title" className={styles.sectionTitle}>
            <HeadingIcon icon={ClipboardList} />
            Purchase orders
          </h2>
        </div>
        <div className={styles.chips} role="group" aria-label="Show">
          {PURCHASE_QUEUES.map((option) => {
            const count = counts.get(option.value) ?? 0;
            return (
              <ToggleChip
                key={option.value}
                selected={queue === option.value}
                accessibleLabel={`${option.label}, ${count} ${count === 1 ? 'order' : 'orders'}`}
                onToggle={() => setParams(option.value === 'open' ? {} : { queue: option.value }, { replace: true })}
              >
                {option.label} <span className={styles.count}>{count}</span>
              </ToggleChip>
            );
          })}
        </div>
        {shown.length === 0 ? (
          <p className={styles.empty}>{EMPTY[queue]}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-labelledby="po-title">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Maker</th>
                  <th scope="col">Received</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((order) => {
                  const units = orderUnits(order);
                  return (
                    <tr key={order.id}>
                      <th scope="row" className={styles.nowrap}>
                        <Link to={purchaseOrderPath(order.id)} className={styles.productName}>
                          {order.id}
                        </Link>
                        <span className={styles.muted}>{formatPoDate(order.createdAt)}</span>
                      </th>
                      <td>{order.supplier}</td>
                      <td className={styles.number}>
                        {units.received} / {units.ordered}
                      </td>
                      <td className={styles.number}>{formatMoney(orderCost(order))}</td>
                      <td className={styles.nowrap}>
                        {order.expectedAt ? formatPoDate(order.expectedAt) : <span className={styles.muted}>Not sent</span>}
                        {isLate(order, now) && (
                          <>
                            {' '}
                            <Badge tone="sale">Late</Badge>
                          </>
                        )}
                      </td>
                      <td>
                        <PurchaseOrderBadge status={order.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="makers-title">
        <h2 id="makers-title" className={styles.sectionTitle}>
          <HeadingIcon icon={Factory} />
          Makers
        </h2>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-labelledby="makers-title">
            <thead>
              <tr>
                <th scope="col">Maker</th>
                <th scope="col">Lead time</th>
                <th scope="col">Items</th>
                <th scope="col">To reorder</th>
                <th scope="col">On order</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(({ supplier, variants, toReorder, unitsOnOrder, openOrders }) => (
                <tr key={supplier.name}>
                  <th scope="row">
                    <Link to={supplierPath(supplier.name)} className={styles.productName}>
                      {supplier.name}
                    </Link>
                    <span className={styles.muted}>{supplier.email}</span>
                  </th>
                  <td className={styles.nowrap}>{supplier.leadDays} working days</td>
                  <td className={styles.number}>{variants}</td>
                  <td>{toReorder > 0 ? <Badge tone="warning">{`${toReorder} to reorder`}</Badge> : <span className={styles.muted}>None</span>}</td>
                  <td className={styles.nowrap}>
                    {openOrders > 0 ? `${unitsOnOrder} units on ${openOrders} ${openOrders === 1 ? 'order' : 'orders'}` : <span className={styles.muted}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
