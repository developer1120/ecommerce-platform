import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Award, BadgeDollarSign, GitCompareArrows, X } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { LoadError } from '@/components/feedback/LoadError';
import { ProductArt } from '@/components/product/ProductArt';
import { Badge, HeadingIcon, Spinner } from '@/components/ui';
import { compareRows, compareUrl, parseCompareIds, standouts, toCompareItem } from '@/domain/compare';
import type { Product } from '@/domain/product';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useCompare } from '@/state/CompareProvider';
import styles from './ComparePage.module.css';

/**
 * The comparison table. Its address lists the products (`?ids=a,b`), so a
 * comparison can be shared; opening one makes it the shopper's comparison.
 */
export function ComparePage() {
  usePageTitle('Compare');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { items, replace, remove } = useCompare();
  const fromUrl = params.has('ids');
  const ids = fromUrl ? parseCompareIds(params.get('ids')) : items.map((item) => item.id);
  const key = ids.join(',');

  const products = useAsync(
    (signal) => (key ? listProducts({ ids: key.split(',') }, { signal }) : Promise.resolve([] as Product[])),
    [key],
  );
  // Keep the columns in the order picked, and drop anything that no longer exists.
  const columns = useMemo(
    () => (products.data ? ids.map((id) => products.data!.find((product) => product.id === id)).filter((p): p is Product => !!p) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `ids`.
    [products.data, key],
  );

  // A shared link becomes this shopper's comparison, so the tray and toggles agree with the page.
  useEffect(() => {
    if (!fromUrl || !columns) return;
    const current = items.map((item) => item.id).join(',');
    const shown = columns.map((product) => product.id).join(',');
    if (current !== shown) replace(columns.map(toCompareItem));
  }, [fromUrl, columns, items, replace]);

  const [differencesOnly, setDifferencesOnly] = useState(false);

  function removeColumn(productId: string) {
    remove(productId);
    const next = ids.filter((id) => id !== productId);
    navigate(compareUrl(next), { replace: true });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <HeadingIcon icon={GitCompareArrows} badge />
          Compare
        </h1>
        <p className={styles.intro}>Up to four products side by side. Pick them with "Compare" on any product.</p>
      </header>

      {products.status === 'error' ? (
        <LoadError error={products.error} onRetry={products.reload} subject="these products" />
      ) : !columns ? (
        <Spinner label="Loading the comparison" />
      ) : columns.length === 0 ? (
        <section className={styles.empty}>
          <h2 className={styles.emptyTitle}>Nothing to compare yet</h2>
          <p>Use "Compare" on two or more products to see them side by side.</p>
          <Link to="/shop" className={styles.shopLink}>
            Browse the shop
          </Link>
        </section>
      ) : (
        <CompareTable products={columns} differencesOnly={differencesOnly} onDifferencesOnly={setDifferencesOnly} onRemove={removeColumn} />
      )}
    </div>
  );
}

interface CompareTableProps {
  products: Product[];
  differencesOnly: boolean;
  onDifferencesOnly: (value: boolean) => void;
  onRemove: (productId: string) => void;
}

function CompareTable({ products, differencesOnly, onDifferencesOnly, onRemove }: CompareTableProps) {
  const rows = compareRows(products);
  const shown = differencesOnly ? rows.filter((row) => !row.same) : rows;
  const { cheapest, topRated } = standouts(products);
  const canCompare = products.length > 1;

  return (
    <section className={styles.comparison} aria-labelledby="compare-table-title">
      <h2 id="compare-table-title" className="visually-hidden">
        Comparison
      </h2>
      <div className={styles.toolbar}>
        <p className={styles.count}>
          {products.length} {products.length === 1 ? 'product' : 'products'}
          {!canCompare && ' · add another to compare'}
        </p>
        {canCompare && (
          <label className={styles.differences}>
            <input type="checkbox" checked={differencesOnly} onChange={(event) => onDifferencesOnly(event.target.checked)} />
            Show only differences
          </label>
        )}
        <Link to={compareUrl(products.map((product) => product.id))} className={styles.share}>
          Link to this comparison
        </Link>
      </div>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <td className={styles.corner} />
              {products.map((product) => (
                <th key={product.id} scope="col" className={styles.productHead}>
                  <button type="button" className={styles.remove} aria-label={`Remove ${product.name}`} onClick={() => onRemove(product.id)}>
                    <X aria-hidden="true" />
                  </button>
                  <ProductArt art={product.art} className={styles.art} />
                  <Link to={`/product/${product.slug}`} className={styles.name}>
                    {product.name}
                  </Link>
                  <span className={styles.badges}>
                    {product.id === cheapest && (
                      <Badge tone="success" icon={<BadgeDollarSign />}>
                        Lowest price
                      </Badge>
                    )}
                    {product.id === topRated && (
                      <Badge tone="accent" icon={<Award />}>
                        Top rated
                      </Badge>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.label} data-same={row.same || undefined}>
                <th scope="row" className={styles.rowHead}>
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={products[index]!.id}>
                    {value.length > 1 ? (
                      <ul className={styles.list}>
                        {value.map((entry) => (
                          <li key={entry}>{entry}</li>
                        ))}
                      </ul>
                    ) : (
                      value[0]
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {differencesOnly && shown.length === 0 && <p className={styles.same}>These products are the same on every point we compare.</p>}
    </section>
  );
}
