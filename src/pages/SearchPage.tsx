import { useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search, SearchX } from 'lucide-react';
import { searchProducts } from '@/api/catalogApi';
import { SortSelect } from '@/components/catalog/SortSelect';
import { LoadError } from '@/components/feedback/LoadError';
import { PageFooter } from '@/components/navigation/Pagination';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/ProductGrid';
import { SearchForm } from '@/components/search/SearchForm';
import { searchUrl } from '@/components/search/SearchPanel';
import { HeadingIcon } from '@/components/ui';
import { sortProducts } from '@/domain/catalogFilters';
import { paginate } from '@/domain/pagination';
import { POPULAR_SEARCHES } from '@/domain/search';
import { useAsync } from '@/hooks/useAsync';
import { useCatalogFilters } from '@/hooks/useCatalogFilters';
import { useFocusOnPagination, usePageParam } from '@/hooks/usePage';
import { usePageTitle } from '@/hooks/usePageTitle';
import styles from './SearchPage.module.css';

export const SEARCH_PAGE_SIZE = 12;

export function SearchPage() {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  usePageTitle(query ? `Search: ${query}` : 'Search');
  const { filters, update } = useCatalogFilters();

  const results = useAsync(
    (signal) => (query ? searchProducts(query, undefined, { signal }) : Promise.resolve(null)),
    [query],
  );
  // "Featured" keeps relevance order; other sorts reorder the matches.
  const items = useMemo(
    () => (results.data ? sortProducts(results.data.items, filters.sort) : undefined),
    [results.data, filters.sort],
  );
  const requestedPage = usePageParam();
  const paged = useMemo(() => (items ? paginate(items, requestedPage, SEARCH_PAGE_SIZE) : undefined), [items, requestedPage]);
  const resultsTitleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnPagination(resultsTitleRef);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Search</p>
        <h1 className={styles.title}>
          <HeadingIcon icon={Search} badge />
          {query ? <>Results for “{query}”</> : 'Search the shop'}
        </h1>
        <SearchForm key={query} initial={query} className={styles.form} />
      </header>

      {!query ? (
        <Suggestions intro="Search above, or start with one of these." />
      ) : results.status === 'error' ? (
        <LoadError error={results.error} onRetry={results.reload} subject="search results" />
      ) : items === undefined ? (
        <ProductGridSkeleton count={4} />
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>
            <HeadingIcon icon={SearchX} />
            No matches
          </h2>
          <Suggestions intro="Check the spelling, try a broader word, or start with one of these." />
          <Link to="/shop" className={styles.browse}>
            Browse everything
          </Link>
        </div>
      ) : (
        <section aria-labelledby="search-results-title" className={styles.results}>
          <h2 id="search-results-title" ref={resultsTitleRef} tabIndex={-1} className="visually-hidden">
            Search results
          </h2>
          <div className={styles.toolbar}>
            <p role="status" className={styles.count}>
              {items.length} {items.length === 1 ? 'product' : 'products'}
            </p>
            <SortSelect value={filters.sort} onChange={(sort) => update({ sort })} />
          </div>
          <ProductGrid products={paged!.items} featureEvery={0} />
          <PageFooter page={paged!} noun="results" />
        </section>
      )}
    </div>
  );
}

function Suggestions({ intro }: { intro: string }) {
  return (
    <div className={styles.suggestions}>
      <p>{intro}</p>
      <ul className={styles.pills} aria-label="Popular searches">
        {POPULAR_SEARCHES.map((term) => (
          <li key={term}>
            <Link to={searchUrl(term)} className={styles.pill}>
              {term}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
