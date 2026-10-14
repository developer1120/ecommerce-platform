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
