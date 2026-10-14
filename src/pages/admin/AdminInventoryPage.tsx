import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Warehouse } from 'lucide-react';
import { listInventory } from '@/api/inventoryApi';
import { LoadError } from '@/components/feedback/LoadError';
import { HeadingIcon, Spinner, TextField, ToggleChip } from '@/components/ui';
import { daysOfCover, matchesInventoryFilter, type InventoryFilter, type InventoryRow } from '@/domain/inventory';
import { fold } from '@/domain/search';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import styles from './Admin.module.css';

const FILTERS: { value: InventoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Running low' },
  { value: 'out', label: 'Sold out' },
];

const isFilter = (value: string | null): value is InventoryFilter => FILTERS.some((filter) => filter.value === value);

/** Low and sold-out items first, then the fastest sellers, so the next reorder is at the top. */
function byUrgency(a: InventoryRow, b: InventoryRow): number {
  const rank = { out: 0, low: 1, in: 2 } as const;
  return rank[a.level] - rank[b.level] || b.sold30 - a.sold30 || a.productName.localeCompare(b.productName);
}

export function AdminInventoryPage() {
  usePageTitle('Inventory · Admin');
  const { token } = useAuth();
  const inventory = useAsync((signal) => listInventory(token!, { signal }), [token]);
  const [params, setParams] = useSearchParams();
  const requested = params.get('show');
  const filter: InventoryFilter = isFilter(requested) ? requested : 'all';
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => new Map(FILTERS.map((option) => [option.value, (inventory.data ?? []).filter((row) => matchesInventoryFilter(row, option.value)).length])),
    [inventory.data],
  );
  const shown = useMemo(() => {
    const words = fold(query.trim());
    return (inventory.data ?? [])
      .filter((row) => matchesInventoryFilter(row, filter) && (!words || fold(`${row.productName} ${row.variantLabel} ${row.sku}`).includes(words)))
      .sort(byUrgency);
  }, [inventory.data, filter, query]);

  if (inventory.status === 'error') return <LoadError error={inventory.error} onRetry={inventory.reload} subject="inventory" />;
  if (!inventory.data) return <Spinner label="Loading inventory" />;

  const units = inventory.data.reduce((total, row) => total + Math.max(0, row.stock), 0);

  return (
    <section className={styles.section} aria-labelledby="admin-inventory-title">
      <div className={styles.toolbar}>
        <div>
          <h2 id="admin-inventory-title" className={styles.sectionTitle}>
            <HeadingIcon icon={Warehouse} />
            Inventory
          </h2>
          <p className={styles.muted}>
            {units.toLocaleString('en-US')} units across {inventory.data.length} items
          </p>
        </div>
      </div>
      <div className={styles.filters}>
        <TextField
          label="Search inventory"
          hideLabel
          placeholder="Search by product, option or SKU"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={styles.search}
        />
        <div className={styles.chips} role="group" aria-label="Show">
          {FILTERS.map((option) => {
            const count = counts.get(option.value) ?? 0;
            return (
              <ToggleChip
                key={option.value}
                selected={filter === option.value}
                accessibleLabel={`${option.label}, ${count} ${count === 1 ? 'item' : 'items'}`}
                onToggle={() => setParams(option.value === 'all' ? {} : { show: option.value }, { replace: true })}
              >
                {option.label} <span className={styles.count}>{count}</span>
              </ToggleChip>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>{filter === 'all' ? 'Nothing matches that search.' : 'Nothing here. Stock looks healthy.'}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">SKU</th>
                <th scope="col">In stock</th>
                <th scope="col">Sold, 30 days</th>
                <th scope="col">Lasts about</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const cover = daysOfCover(row);
                return (
                  <tr key={row.variantId}>
                    <th scope="row">
                      <Link to={`/admin/inventory/${row.variantId}`} className={styles.productName}>
                        {row.productName}
                      </Link>
                      {row.variantLabel && <span className={styles.muted}>{row.variantLabel}</span>}
                    </th>
                    <td>
                      <span className={styles.code}>{row.sku}</span>
                    </td>
                    <td className={styles.number} data-level={row.level === 'in' ? undefined : 'low'}>
                      {row.level === 'out' ? 'Sold out' : row.stock}
                    </td>
                    <td className={styles.number}>{row.sold30}</td>
                    <td className={styles.number}>{cover === undefined ? '—' : `${cover} ${cover === 1 ? 'day' : 'days'}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
