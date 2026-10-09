import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Clock, History, Search, TrendingUp, X } from 'lucide-react';
import { searchProducts } from '@/api/catalogApi';
import { ProductArt } from '@/components/product/ProductArt';
import { HeadingIcon, Spinner } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { priceRange, type Product } from '@/domain/product';
import { clearRecentSearches, loadRecentSearches, rememberSearch } from '@/domain/recentSearches';
import { highlight, POPULAR_SEARCHES } from '@/domain/search';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import styles from './SearchPanel.module.css';

export const SEARCH_DEBOUNCE_MS = 180;
export const MIN_QUERY_LENGTH = 2;
export const MAX_SUGGESTIONS = 6;

export function searchUrl(query: string): string {
  return `/search?q=${encodeURIComponent(query.trim())}`;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((segment, index) =>
        segment.match ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}

interface SearchPanelProps {
  id: string;
  onClose: () => void;
}

/**
 * The header search: a combobox that suggests products as you type
 * (ARIA 1.2 pattern, focus stays in the input while arrows move the
 * highlighted option), with recent and popular searches before you start.
 */
export function SearchPanel({ id, onClose }: SearchPanelProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState(loadRecentSearches);

  const term = query.trim();
  const debounced = useDebouncedValue(term, SEARCH_DEBOUNCE_MS);
  const ready = debounced.length >= MIN_QUERY_LENGTH;
  const results = useAsync(
    (signal) => (ready ? searchProducts(debounced, MAX_SUGGESTIONS, { signal }) : Promise.resolve(null)),
    [debounced, ready],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // New suggestions start with nothing highlighted.
  useEffect(() => {
    setActive(-1);
  }, [debounced]);

  const typing = term.length >= MIN_QUERY_LENGTH;
  const data = typing ? results.data : null;
  const suggestions: Product[] = data?.items ?? [];
  const hasResults = suggestions.length > 0;
  // The last option is always "See all results".
  const optionCount = hasResults ? suggestions.length + 1 : 0;
  const loading = typing && (results.status === 'loading' || debounced !== term);

  function openProduct(product: Product) {
    rememberSearch(term);
    navigate(`/product/${product.slug}`);
    onClose();
  }

  function submit(value: string) {
    if (!value.trim()) return;
    rememberSearch(value);
    navigate(searchUrl(value));
    onClose();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const chosen = active >= 0 ? suggestions[active] : undefined;
    if (chosen) openProduct(chosen);
    else submit(term);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && optionCount > 0) {
      event.preventDefault();
      setActive((index) => (index + 1) % optionCount);
    } else if (event.key === 'ArrowUp' && optionCount > 0) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? optionCount - 1 : index - 1));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (query) setQuery('');
      else onClose();
    }
  }

  return (
    <div id={id} className={styles.panel}>
      <form role="search" aria-label="Site search" className={styles.inner} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <Search className={styles.fieldIcon} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            className={styles.input}
            placeholder="Search linen, stoneware, face oil…"
            aria-label="Search the shop"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={hasResults}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <Spinner className={styles.spinner} />}
          <button type="button" className={styles.close} aria-label="Close search" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>

        <p className="visually-hidden" role="status">
          {typing && data
            ? data.total === 0
              ? `No products match ${term}`
              : `${data.total} ${data.total === 1 ? 'product matches' : 'products match'}. Use the arrow keys to browse.`
            : ''}
        </p>

        <ul id={listId} role="listbox" aria-label="Suggestions" className={styles.list} hidden={!hasResults}>
          {suggestions.map((product, index) => (
            <li
              key={product.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={styles.option}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => openProduct(product)}
            >
              <ProductArt art={product.art} className={styles.thumb} />
              <span className={styles.optionText}>
                <span className={styles.optionName}>
                  <Highlighted text={product.name} query={term} />
                </span>
                <span className={styles.optionMeta}>
                  {product.maker} · {product.type}
                </span>
              </span>
              <span className={styles.optionPrice}>{formatMoney(priceRange(product).min)}</span>
            </li>
          ))}
          {hasResults && data && (
            <li
              id={optionId(suggestions.length)}
              role="option"
              aria-selected={active === suggestions.length}
              className={styles.seeAll}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(suggestions.length)}
              onClick={() => submit(term)}
            >
              See all {data.total} {data.total === 1 ? 'result' : 'results'} for “{term}”
              <ArrowRight aria-hidden="true" />
            </li>
          )}
        </ul>

        {typing && data && data.total === 0 && !loading && (
          <p className={styles.noResults}>
            Nothing matches “{term}”. Check the spelling, or try a broader word like “linen” or “gift”.
          </p>
        )}

        {!typing && (
          <div className={styles.starters}>
            {recent.length > 0 && (
              <section aria-labelledby={`${listId}-recent`}>
                <div className={styles.startersHeader}>
                  <h2 id={`${listId}-recent`} className={styles.startersTitle}>
                    <HeadingIcon icon={History} />
                    <Clock aria-hidden="true" /> Recent searches
                  </h2>
                  <button
                    type="button"
                    className={styles.clearRecent}
                    onClick={() => {
                      clearRecentSearches();
                      setRecent([]);
                      inputRef.current?.focus();
                    }}
                  >
                    Clear
                  </button>
                </div>
                <ul className={styles.pills}>
                  {recent.map((item) => (
                    <li key={item}>
                      <button type="button" className={styles.pill} onClick={() => submit(item)}>
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby={`${listId}-popular`}>
              <h2 id={`${listId}-popular`} className={styles.startersTitle}>
                <HeadingIcon icon={TrendingUp} />
                <TrendingUp aria-hidden="true" /> Popular right now
              </h2>
              <ul className={styles.pills}>
                {POPULAR_SEARCHES.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      className={styles.pill}
                      onClick={() => {
                        setQuery(item);
                        inputRef.current?.focus();
                      }}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </form>
    </div>
  );
}
