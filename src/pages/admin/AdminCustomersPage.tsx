import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Download, UsersRound } from 'lucide-react';
import { listCustomers } from '@/api/adminCustomersApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Button, HeadingIcon, Spinner, TextField, ToggleChip } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import {
  CUSTOMER_SORTS,
  customerPath,
  customersToCsv,
  SEGMENT_LABELS,
  sortCustomers,
  type CustomerSegment,
  type CustomerSort,
  type CustomerSummary,
} from '@/domain/customers';
import { formatMoney } from '@/domain/money';
import { formatOrderDate } from '@/domain/order';
import { fold } from '@/domain/search';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { downloadText } from '@/lib/download';
import { useAuth } from '@/state/AuthProvider';
import { SegmentBadges } from './SegmentBadges';
import styles from './Admin.module.css';

type Filter = 'all' | CustomerSegment;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'vip', label: SEGMENT_LABELS.vip },
  { value: 'repeat', label: SEGMENT_LABELS.repeat },
  { value: 'new', label: SEGMENT_LABELS.new },
  { value: 'lapsed', label: SEGMENT_LABELS.lapsed },
  { value: 'no-orders', label: SEGMENT_LABELS['no-orders'] },
];

const isFilter = (value: string | null): value is Filter => FILTERS.some((filter) => filter.value === value);
const isSort = (value: string | null): value is CustomerSort => CUSTOMER_SORTS.some((sort) => sort.value === value);
const matches = (customer: CustomerSummary, filter: Filter) => filter === 'all' || customer.segments.includes(filter);

/** Everyone who shops here, with what they've spent and when they last ordered. */
export function AdminCustomersPage() {
  usePageTitle('Customers · Admin');
  const { token } = useAuth();
  const customers = useAsync((signal) => listCustomers(token!, { signal }), [token]);
  const [params, setParams] = useSearchParams();
  const filter: Filter = isFilter(params.get('segment')) ? (params.get('segment') as Filter) : 'all';
  const sort: CustomerSort = isSort(params.get('sort')) ? (params.get('sort') as CustomerSort) : 'recent';
  const [query, setQuery] = useState('');

  function setParam(name: string, value: string, fallback: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === fallback) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  }

  const counts = useMemo(
    () => new Map(FILTERS.map((option) => [option.value, (customers.data ?? []).filter((customer) => matches(customer, option.value)).length])),
    [customers.data],
  );
  const shown = useMemo(() => {
    const words = fold(query.trim());
    const list = (customers.data ?? []).filter(
      (customer) => matches(customer, filter) && (!words || fold(`${customer.name} ${customer.email}`).includes(words)),
    );
    return sortCustomers(list, sort);
  }, [customers.data, filter, sort, query]);

  if (customers.status === 'error') return <LoadError error={customers.error} onRetry={customers.reload} subject="customers" />;
  if (!customers.data) return <Spinner label="Loading customers" />;

  return (
    <section className={styles.section} aria-labelledby="admin-customers-title">
      <div className={styles.toolbar}>
        <h2 id="admin-customers-title" className={styles.sectionTitle}>
          <HeadingIcon icon={UsersRound} />
          Customers
        </h2>
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Download />}
          disabled={shown.length === 0}
          onClick={() => downloadText('tanelt-customers.csv', customersToCsv(shown), 'text/csv')}
        >
          Export CSV
        </Button>
      </div>
      <div className={styles.filters}>
        <div className={styles.searchRow}>
          <TextField
            label="Search customers"
            hideLabel
            placeholder="Search by name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={styles.search}
          />
          <SelectField
            label="Sort by"
            value={sort}
            options={CUSTOMER_SORTS}
            onChange={(event) => setParam('sort', event.target.value, 'recent')}
            className={styles.sort}
          />
        </div>
        <div className={styles.chips} role="group" aria-label="Show">
          {FILTERS.map((option) => {
            const count = counts.get(option.value) ?? 0;
            return (
              <ToggleChip
                key={option.value}
                selected={filter === option.value}
                accessibleLabel={`${option.label}, ${count} ${count === 1 ? 'customer' : 'customers'}`}
                onToggle={() => setParam('segment', option.value, 'all')}
              >
                {option.label} <span className={styles.count}>{count}</span>
              </ToggleChip>
            );
          })}
        </div>
      </div>

      {customers.data.length === 0 ? (
        <p className={styles.empty}>No customers yet. Shoppers appear here when they make an account or check out.</p>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>No customers match.</p>
      ) : (
        <>
          <p className={styles.muted} aria-live="polite">
            {shown.length} of {customers.data.length} customers
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Spent</th>
                  <th scope="col">Last order</th>
                  <th scope="col">Groups</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((customer) => (
                  <tr key={customer.key}>
                    <th scope="row">
                      <Link to={customerPath(customer.key)} className={styles.productName}>
                        {customer.name}
                      </Link>
                      <span className={styles.muted}>
                        {customer.email}
                        {customer.kind === 'guest' && ' · Guest'}
                      </span>
                    </th>
                    <td className={styles.number}>{customer.orders}</td>
                    <td className={styles.number}>{formatMoney(customer.spent)}</td>
                    <td>{customer.lastOrderAt ? formatOrderDate(customer.lastOrderAt) : '—'}</td>
                    <td>
                      <SegmentBadges segments={customer.segments} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

