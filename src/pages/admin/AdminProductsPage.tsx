import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Boxes, Plus } from 'lucide-react';
import { listAdminProducts } from '@/api/adminApi';
import { LoadError } from '@/components/feedback/LoadError';
import { ProductArt } from '@/components/product/ProductArt';
import { Badge, type BadgeTone, HeadingIcon, Spinner, TextField, ToggleChip } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { priceRange, stockLevel, totalStock, type ProductStatus } from '@/domain/product';
import { fold } from '@/domain/search';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import styles from './Admin.module.css';

const STATUS_TONE: Record<ProductStatus, BadgeTone> = { active: 'success', draft: 'warning', archived: 'neutral' };
const STATUS_LABEL: Record<ProductStatus, string> = { active: 'Active', draft: 'Draft', archived: 'Archived' };
type Filter = 'all' | ProductStatus | 'low';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Drafts' },
  { value: 'archived', label: 'Archived' },
  { value: 'low', label: 'Low or out of stock' },
];

export function AdminProductsPage() {
  usePageTitle('Products · Admin');
  const { token } = useAuth();
  const products = useAsync((signal) => listAdminProducts(token!, { signal }), [token]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(() => {
    const words = fold(query.trim());
    return (products.data ?? []).filter((product) => {
      const status = product.status ?? 'active';
      if (filter === 'low' && stockLevel(totalStock(product)) === 'in') return false;
      if (filter !== 'all' && filter !== 'low' && status !== filter) return false;
      if (!words) return true;
      return fold(`${product.name} ${product.maker} ${product.type} ${product.variants.map((v) => v.sku).join(' ')}`).includes(words);
    });
  }, [products.data, query, filter]);

  if (products.status === 'error') return <LoadError error={products.error} onRetry={products.reload} subject="products" />;
  if (!products.data) return <Spinner label="Loading products" />;

  return (
    <section className={styles.section} aria-labelledby="admin-products-title">
      <div className={styles.toolbar}>
        <h2 id="admin-products-title" className={styles.sectionTitle}>
          <HeadingIcon icon={Boxes} />
          Products
        </h2>
        <Link to="/admin/products/new" className={styles.primary}>
          <Plus aria-hidden="true" /> New product
        </Link>
      </div>
      <div className={styles.filters}>
        <TextField
          label="Search products"
          hideLabel
          placeholder="Search by name, maker, type or SKU"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={styles.search}
        />
        <div className={styles.chips} role="group" aria-label="Show">
          {FILTERS.map((option) => (
            <ToggleChip key={option.value} selected={filter === option.value} onToggle={() => setFilter(option.value)}>
              {option.label}
            </ToggleChip>
          ))}
        </div>
      </div>
      <p className={styles.muted} aria-live="polite">
        {shown.length} of {products.data.length} products
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Department</th>
              <th scope="col">Price</th>
              <th scope="col">Stock</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((product) => {
              const stock = totalStock(product);
              const level = stockLevel(stock);
              const { min, max } = priceRange(product);
              const status = product.status ?? 'active';
              return (
                <tr key={product.id}>
                  <td>
                    <span className={styles.productCell}>
                      <ProductArt art={product.art} className={styles.thumb} />
                      <span>
                        <span className={styles.productName}>{product.name}</span>
                        <span className={styles.muted}>{product.maker}</span>
                      </span>
                    </span>
                  </td>
                  <td className={styles.capitalize}>{product.department}</td>
                  <td className={styles.number}>
                    {min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`}
                  </td>
                  <td className={styles.number} data-level={level}>
                    {stock}
                    {level !== 'in' && <span className={styles.stockNote}>{level === 'out' ? ' · out' : ' · low'}</span>}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                  </td>
                  <td>
                    <Link to={`/admin/products/${product.id}`} className={styles.rowLink} aria-label={`Edit ${product.name}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className={styles.empty}>No products match. Try another search or filter.</p>}
    </section>
  );
}
