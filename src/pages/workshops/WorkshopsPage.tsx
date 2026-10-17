import { Link } from 'react-router';
import { CalendarDays, Clock, Palette, Users } from 'lucide-react';
import { listWorkshops } from '@/api/workshopsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { ProductArt } from '@/components/product/ProductArt';
import { Badge, HeadingIcon, Spinner } from '@/components/ui';
import { MAKERS } from '@/data/makers';
import { formatMoney } from '@/domain/money';
import { findMaker } from '@/domain/stories';
import { availabilityLabel, formatDuration, formatSessionDate, STUDIO_ADDRESS, workshopPath } from '@/domain/workshops';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import styles from './Workshops.module.css';

/** Every workshop, the one with the soonest date first. */
export function WorkshopsPage() {
  usePageTitle('Workshops');
  const listings = useAsync((signal) => listWorkshops({ signal }), []);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Workshops</p>
        <h1 className={styles.title}>
          <HeadingIcon icon={Palette} badge />
          Make it with the makers
        </h1>
        <p className={styles.lede}>
          Small evening and weekend classes in our Brooklyn studio, taught by the people who make what we sell. Everything you need is
          provided, and you take home what you make.
        </p>
        <p className={styles.muted}>{STUDIO_ADDRESS}</p>
      </header>

      {listings.status === 'error' ? (
        <LoadError error={listings.error} onRetry={listings.reload} subject="workshops" />
      ) : !listings.data ? (
        <Spinner label="Loading workshops" />
      ) : (
        <ul className={styles.list}>
          {listings.data.map(({ workshop, sessions }) => {
            const next = sessions[0];
            const maker = findMaker(MAKERS, workshop.maker);
            const label = next && availabilityLabel(next.placesLeft);
            return (
              <li key={workshop.slug}>
                <article className={styles.card} aria-labelledby={`workshop-${workshop.slug}`}>
                  <ProductArt art={workshop.art} lazy className={styles.cardArt} />
                  <div className={styles.cardText}>
                    <p className={styles.eyebrow}>With {maker?.name ?? 'our makers'}</p>
                    <h2 id={`workshop-${workshop.slug}`} className={styles.cardTitle}>
                      <Link to={workshopPath(workshop.slug)} className={styles.cardLink}>
                        {workshop.title}
                      </Link>
                    </h2>
                    <p className={styles.muted}>{workshop.summary}</p>
                    <ul className={styles.facts}>
                      <li>
                        <Clock aria-hidden="true" /> {formatDuration(workshop.durationMinutes)}
                      </li>
                      <li>
                        <Users aria-hidden="true" /> Up to {workshop.capacity}
                      </li>
                      <li>
                        <CalendarDays aria-hidden="true" />
                        {next ? `Next: ${formatSessionDate(next.startsAt)}` : 'New dates soon'}
                        {sessions.length > 1 && ` (+${sessions.length - 1} more)`}
                      </li>
                    </ul>
                    <p className={styles.priceRow}>
                      <span className={styles.price}>{formatMoney(workshop.price)}</span>
                      <span className={styles.muted}> a place</span>
                      {label && (
                        <Badge tone={next!.placesLeft === 0 ? 'sale' : 'warning'} className={styles.badge}>
                          {label}
                        </Badge>
                      )}
                    </p>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
