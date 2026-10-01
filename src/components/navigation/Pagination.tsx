import { Link, useLocation, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageLinks, pageSearch, type Page } from '@/domain/pagination';
import { PAGINATION_STATE } from '@/hooks/usePage';
import styles from './Pagination.module.css';

interface PaginationProps {
  page: number;
  pageCount: number;
  /** Names the navigation landmark, e.g. "Product pages". */
  label?: string;
}

/**
 * Previous, numbered and next links to other pages of a list. They are real
 * links (?page=3), so they can be opened in a new tab and the back button
 * returns to the previous page. Nothing renders for a single page.
 */
export function Pagination({ page, pageCount, label = 'Pages' }: PaginationProps) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  if (pageCount <= 1) return null;

  // Keep the scroll position; the page moves focus to the top of the list itself.
  const to = (target: number) => ({ pathname, search: pageSearch(params, target) });

  return (
    <nav className={styles.pagination} aria-label={label}>
      {page > 1 ? (
        <Link to={to(page - 1)} className={styles.step} rel="prev" preventScrollReset state={PAGINATION_STATE}>
          <ChevronLeft aria-hidden="true" />
          Previous
        </Link>
      ) : (
        <span className={styles.step} data-disabled aria-hidden="true">
          <ChevronLeft aria-hidden="true" />
          Previous
        </span>
      )}

      <ul className={styles.pages}>
        {pageLinks(page, pageCount).map((link, index) =>
          link === 'gap' ? (
            <li key={`gap-${index}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={link}>
              <Link
                to={to(link)}
                className={styles.number}
                aria-label={`Page ${link}`}
                aria-current={link === page ? 'page' : undefined}
                preventScrollReset
                state={PAGINATION_STATE}
              >
                {link}
              </Link>
            </li>
          ),
        )}
      </ul>

      {page < pageCount ? (
        <Link to={to(page + 1)} className={styles.step} rel="next" preventScrollReset state={PAGINATION_STATE}>
          Next
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span className={styles.step} data-disabled aria-hidden="true">
          Next
          <ChevronRight aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}

interface PageFooterProps {
  page: Page<unknown>;
  /** What the list holds, plural: "products", "orders". */
  noun: string;
}

/** "Showing 13–24 of 30 products" and the page links, below a paged list. */
export function PageFooter({ page, noun }: PageFooterProps) {
  if (page.pageCount <= 1) return null;
  return (
    <div className={styles.footer}>
      <p className={styles.range}>
        Showing {page.first}–{page.last} of {page.total} {noun}
      </p>
      <Pagination page={page.page} pageCount={page.pageCount} label={`Pages of ${noun}`} />
    </div>
  );
}
