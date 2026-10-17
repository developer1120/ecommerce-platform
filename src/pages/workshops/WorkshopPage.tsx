import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { CalendarPlus, CircleCheck, Clock, MapPin, Ticket, Users } from 'lucide-react';
import { isApiError } from '@/api/client';
import { bookWorkshop, getWorkshop, type SessionAvailability } from '@/api/workshopsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { ProductArt } from '@/components/product/ProductArt';
import { Button, HeadingIcon, Spinner, TextField } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import { MAKERS } from '@/data/makers';
import { formatMoney } from '@/domain/money';
import { findMaker } from '@/domain/stories';
import {
  availabilityLabel,
  bookingCalendar,
  bookingTotal,
  CANCEL_CUTOFF_HOURS,
  formatDuration,
  formatSessionDate,
  formatSessionTime,
  MAX_PLACES,
  STUDIO_ADDRESS,
  validateBooking,
  type BookingErrors,
  type Workshop,
  type WorkshopBooking,
} from '@/domain/workshops';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { downloadText } from '@/lib/download';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { useAuth } from '@/state/AuthProvider';
import { makerPath } from '@/pages/stories/StoriesParts';
import styles from './Workshops.module.css';

export function WorkshopPage() {
  const { slug = '' } = useParams();
  const result = useAsync((signal) => getWorkshop(slug, { signal }), [slug]);
  usePageTitle(result.data ? `${result.data.workshop.title} · Workshops` : result.status === 'error' ? 'Page not found' : 'Workshops');

  if (result.status === 'error') {
    if (isApiError(result.error) && result.error.code === 'NOT_FOUND') return <NotFoundPage />;
    return <LoadError error={result.error} onRetry={result.reload} subject="this workshop" />;
  }
  if (!result.data) return <Spinner label="Loading workshop" />;

  const { workshop, sessions } = result.data;
  const maker = findMaker(MAKERS, workshop.maker);
  return (
    <div className={styles.page}>
      <Breadcrumbs trail={[{ label: 'Workshops', to: '/workshops' }, { label: workshop.title }]} />
      <div className={styles.detail}>
        <div className={styles.detailMain}>
          <ProductArt art={workshop.art} zoom={1.3} className={styles.detailArt} />
          <header className={styles.detailHeader}>
            <p className={styles.eyebrow}>
              With {maker ? <Link to={makerPath(maker.slug)}>{maker.name}</Link> : 'our makers'}
            </p>
            <h1 className={styles.title}>{workshop.title}</h1>
            <p className={styles.lede}>{workshop.summary}</p>
          </header>
          <ul className={styles.facts}>
            <li>
              <Clock aria-hidden="true" /> {formatDuration(workshop.durationMinutes)}
            </li>
            <li>
              <Users aria-hidden="true" /> Up to {workshop.capacity} people
            </li>
            <li>
              <MapPin aria-hidden="true" /> {STUDIO_ADDRESS}
            </li>
          </ul>
          <div className={styles.prose}>
            {workshop.description.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <section aria-labelledby="includes-title" className={styles.includes}>
            <h2 id="includes-title" className={styles.smallTitle}>
              Included
            </h2>
            <ul>
              {workshop.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
        <aside className={styles.detailSide}>
          <BookingPanel key={workshop.slug} workshop={workshop} sessions={sessions} onStale={result.reload} />
        </aside>
      </div>
    </div>
  );
}

interface BookingPanelProps {
  workshop: Workshop;
  sessions: SessionAvailability[];
  /** Reloads availability, when places ran out while the shopper was booking. */
  onStale: () => void;
}

function BookingPanel({ workshop, sessions, onStale }: BookingPanelProps) {
  const { user, token } = useAuth();
  const firstOpen = sessions.find((session) => session.placesLeft > 0);
  const [sessionId, setSessionId] = useState(firstOpen?.id ?? '');
  const [places, setPlaces] = useState(1);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [errors, setErrors] = useState<BookingErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<WorkshopBooking | null>(null);

  // The session check may finish after the page opens; fill in the shopper without overwriting typing.
  useEffect(() => {
    if (!user) return;
    setName((current) => current || user.name);
    setEmail((current) => current || user.email);
  }, [user]);

  if (booked) {
    const session = sessions.find((candidate) => candidate.id === booked.sessionId)!;
    return (
      <section className={styles.panel} aria-labelledby="booked-title" role="status">
        <CircleCheck className={styles.doneIcon} aria-hidden="true" />
