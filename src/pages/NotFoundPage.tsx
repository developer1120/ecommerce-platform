import { Link, useLocation } from 'react-router';
import { ArrowRight, Compass } from 'lucide-react';
import { SearchForm } from '@/components/search/SearchForm';
import { HeadingIcon } from '@/components/ui';
import { NAV_CATEGORIES } from '@/config/navigation';
import { searchFromPath } from '@/domain/notFound';
import { usePageTitle } from '@/hooks/usePageTitle';
import styles from './NotFoundPage.module.css';

/**
 * For addresses that lead nowhere. It says which address that was, offers
 * a search seeded from it, and points to the main departments.
 */
export function NotFoundPage() {
  usePageTitle('Page not found');
  const { pathname } = useLocation();
  const guess = searchFromPath(pathname);

  return (
    <section className={styles.page} aria-labelledby="not-found-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>404</p>
        <h1 id="not-found-title" className={styles.title}>
          <HeadingIcon icon={Compass} badge />
          This page has wandered off
        </h1>
        <p className={styles.lede}>
          There's nothing at <code className={styles.path}>{pathname}</code>. The link may be old, or the page may have
          moved.
        </p>
      </div>

      <div className={styles.search}>
        <p className={styles.label}>{guess ? 'Were you looking for this?' : 'Search the shop instead'}</p>
        <SearchForm key={pathname} initial={guess ?? ''} />
      </div>

      <nav aria-label="Departments to try" className={styles.departments}>
        <p className={styles.label}>Or browse</p>
        <ul className={styles.links}>
          {NAV_CATEGORIES.map((category) => (
            <li key={category.slug}>
              <Link to={`/shop/${category.slug}`} className={styles.chip}>
                {category.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Link to="/" className={styles.home}>
        Back to the shop
        <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}
