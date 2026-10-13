import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Flower2,
  LayoutGrid,
  PackageOpen,
  SearchX,
  Shirt,
  SlidersHorizontal,
  Sofa,
  Sparkles,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { ActiveFilters } from '@/components/catalog/ActiveFilters';
import { FilterPanel } from '@/components/catalog/FilterPanel';
import { SortSelect } from '@/components/catalog/SortSelect';
import { LoadError } from '@/components/feedback/LoadError';
import { Breadcrumbs, type Crumb } from '@/components/navigation/Breadcrumbs';
import { PageFooter } from '@/components/navigation/Pagination';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/ProductGrid';
import { Button, HeadingIcon, Sheet } from '@/components/ui';
import { collectionInfo } from '@/config/collections';
import { activeFilterCount, buildFacets, filterAndSort } from '@/domain/catalogFilters';
import { isCollectionSlug, type CollectionSlug } from '@/domain/product';
import { useAsync } from '@/hooks/useAsync';
import { paginate } from '@/domain/pagination';
import { useCatalogFilters } from '@/hooks/useCatalogFilters';
import { useIsCompact } from '@/hooks/useMediaQuery';
import { useFocusOnPagination, usePageParam } from '@/hooks/usePage';
import { usePageTitle } from '@/hooks/usePageTitle';
import { NotFoundPage } from './NotFoundPage';
import styles from './ShopPage.module.css';

const COLLECTION_ICONS: Record<CollectionSlug | 'all', LucideIcon> = {
  all: LayoutGrid,
  new: Sparkles,
  home: Sofa,
  apparel: Shirt,
  beauty: Flower2,
  sale: Tag,
};

/** Three rows of four on a wide screen; the bento feature card takes two cells on page one. */
export const SHOP_PAGE_SIZE = 12;

export function ShopPage() {
  const { category } = useParams();
  if (category !== undefined && !isCollectionSlug(category)) return <NotFoundPage />;
  return <CollectionPage collection={category} />;
}

function CollectionPage({ collection }: { collection: CollectionSlug | undefined }) {
  const info = collectionInfo(collection);
  usePageTitle(info.title);
  const products = useAsync((signal) => listProducts({ collection }, { signal }), [collection]);
  const { filters, update, clear } = useCatalogFilters();
  const compact = useIsCompact();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  const all = products.data;
  const visible = useMemo(() => (all ? filterAndSort(all, filters) : undefined), [all, filters]);
  const facets = useMemo(() => (all ? buildFacets(all, filters) : undefined), [all, filters]);
  const activeCount = activeFilterCount(filters);
  // The bento layout only suits the curated order; sorted or filtered results read better as an even grid.
  const curated = filters.sort === 'featured' && activeCount === 0;
  const requestedPage = usePageParam();
  const paged = useMemo(() => (visible ? paginate(visible, requestedPage, SHOP_PAGE_SIZE) : undefined), [visible, requestedPage]);
  const resultsTitleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnPagination(resultsTitleRef);

  const trail: Crumb[] = collection
    ? [{ label: 'Home', to: '/' }, { label: 'Shop', to: '/shop' }, { label: info.title }]
    : [{ label: 'Home', to: '/' }, { label: 'Shop' }];

  return (
    <div className={styles.page}>
      <header className={styles.header} data-tint={info.tint}>
        <Breadcrumbs trail={trail} />
        <h1 className={styles.title}>
          <HeadingIcon icon={COLLECTION_ICONS[collection ?? 'all']} badge />
          {info.title}
        </h1>
        <p className={styles.intro}>{info.intro}</p>
      </header>

      <div className={styles.layout}>
        {!compact && (
          <aside className={styles.sidebar} aria-label="Filters">
            {facets && <FilterPanel facets={facets} filters={filters} onChange={update} />}
          </aside>
        )}

        <section className={styles.results} aria-labelledby="products-title" aria-busy={products.status === 'loading'}>
          <h2 id="products-title" ref={resultsTitleRef} tabIndex={-1} className="visually-hidden">
            Products
          </h2>
          <div className={styles.toolbar}>
            {compact && (
              <Button
                ref={filtersButtonRef}
                variant="secondary"
                size="sm"
                className={styles.filtersButton}
                leadingIcon={<SlidersHorizontal />}
                aria-haspopup="dialog"
                disabled={!facets}
                onClick={() => setFiltersOpen(true)}
              >
                Filters{activeCount > 0 && ` (${activeCount})`}
              </Button>
            )}
            <p className={styles.resultCount} role="status">
              {visible &&
                (activeCount > 0
                  ? `${visible.length} of ${all!.length} ${all!.length === 1 ? 'product' : 'products'}`
                  : `${visible.length} ${visible.length === 1 ? 'product' : 'products'}`)}
            </p>
            <SortSelect value={filters.sort} onChange={(sort) => update({ sort })} hideLabel={compact} />
          </div>
          <ActiveFilters filters={filters} onChange={update} onClear={clear} />

          {products.status === 'error' ? (
            <LoadError error={products.error} onRetry={products.reload} subject="these products" />
          ) : visible === undefined ? (
            <ProductGridSkeleton />
          ) : all!.length === 0 ? (
            <div className={styles.empty}>
              <h2 className={styles.emptyTitle}>
                <HeadingIcon icon={PackageOpen} />
                Nothing here just now
              </h2>
              <p>This collection is between batches. New pieces arrive every week.</p>
              <Link to="/shop" className={styles.emptyLink}>
                Browse everything
              </Link>
            </div>
          ) : visible.length === 0 ? (
            <div className={styles.empty}>
              <h2 className={styles.emptyTitle}>
                <HeadingIcon icon={SearchX} />
                No matches
              </h2>
              <p>Nothing in {info.title.toLowerCase()} fits every filter. Try removing one.</p>
              <Button variant="primary" onClick={clear}>
                Clear filters
              </Button>
            </div>
          ) : (
            <>
              <ProductGrid products={paged!.items} featureEvery={curated ? undefined : 0} />
              <PageFooter page={paged!} noun="products" />
            </>
          )}
        </section>
      </div>

      {facets && visible && (
        <Sheet
          // Widening the window past the breakpoint puts the filters back in the sidebar.
          open={compact && filtersOpen}
          onClose={closeFilters}
          title="Filters"
          icon={SlidersHorizontal}
          returnFocus={() => filtersButtonRef.current}
          footer={
            <>
              <Button variant="secondary" onClick={clear} disabled={activeCount === 0}>
                Clear all
              </Button>
              <Button onClick={closeFilters}>
                {visible.length === 0 ? 'No matches' : `Show ${visible.length} ${visible.length === 1 ? 'product' : 'products'}`}
              </Button>
            </>
          }
        >
          <FilterPanel facets={facets} filters={filters} onChange={update} />
        </Sheet>
      )}
    </div>
  );
}
