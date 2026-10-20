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
        <h2 id="booked-title" className={styles.smallTitle}>
          You're booked
        </h2>
        <p>
          {booked.places} {booked.places === 1 ? 'place' : 'places'} on <strong>{formatSessionDate(session.startsAt)}</strong>,{' '}
          {formatSessionTime(session.startsAt, workshop.durationMinutes)}. Reference <strong>{booked.id}</strong>.
        </p>
        <p className={styles.muted}>
          We've emailed the details to {booked.email}. {formatMoney(booked.total)} to pay at the studio on the day.
        </p>
        <Button
          variant="secondary"
          leadingIcon={<CalendarPlus />}
          onClick={() => downloadText(`tanelt-${booked.id}.ics`, bookingCalendar(booked, workshop, session), 'text/calendar')}
        >
          Add to calendar
        </Button>
        {booked.customerId && <Link to="/account/workshops">See your bookings</Link>}
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section className={styles.panel} aria-labelledby="booking-title">
        <h2 id="booking-title" className={styles.smallTitle}>
          No dates right now
        </h2>
        <p className={styles.muted}>
          New dates are added every month. <Link to="/help/contact?topic=other">Ask us</Link> to hear when this one runs again.
        </p>
      </section>
    );
  }

  const chosen = sessions.find((session) => session.id === sessionId);
  const left = chosen?.placesLeft ?? 0;
  const placeOptions = Array.from({ length: Math.max(1, Math.min(MAX_PLACES, left)) }, (_, index) => index + 1);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const form = { sessionId, name, email, places };
    const found = validateBooking(form, left);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBooking(true);
    try {
      setBooked(await bookWorkshop(token, form));
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "We couldn't book your places. Try again in a moment.");
      // Someone may have taken the last places; show the latest numbers. The choice and this message stay.
      if (isApiError(error) && error.code === 'CONFLICT') onStale();
    } finally {
      setBooking(false);
    }
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit} noValidate aria-labelledby="booking-title">
      <h2 id="booking-title" className={styles.smallTitle}>
        <HeadingIcon icon={Ticket} />
        Book a place
      </h2>
      <p>
        <span className={styles.price}>{formatMoney(workshop.price)}</span> <span className={styles.muted}>a place, paid on the day</span>
      </p>
      <fieldset className={styles.sessions} aria-describedby={errors.sessionId ? 'session-error' : undefined}>
        <legend className={styles.legend}>Choose a date</legend>
        {sessions.map((session) => {
          const label = availabilityLabel(session.placesLeft);
          return (
            <label key={session.id} className={styles.session} data-disabled={session.placesLeft === 0 || undefined}>
              <input
                type="radio"
                name="session"
                value={session.id}
                checked={sessionId === session.id}
                disabled={session.placesLeft === 0}
                onChange={() => {
                  setSessionId(session.id);
                  setPlaces((current) => Math.min(current, Math.max(1, session.placesLeft)));
                  setErrors({});
                }}
              />
              <span>
                <span className={styles.sessionDate}>{formatSessionDate(session.startsAt)}</span>
                <span className={styles.muted}>{formatSessionTime(session.startsAt, workshop.durationMinutes)}</span>
                {label && <span className={styles.sessionNote}>{label}</span>}
              </span>
            </label>
          );
        })}
        {errors.sessionId && (
          <p id="session-error" className={styles.error}>
            {errors.sessionId}
          </p>
        )}
      </fieldset>
      <SelectField
        label="Places"
        value={String(places)}
        options={placeOptions.map((count) => ({ value: String(count), label: String(count) }))}
        error={errors.places}
        onChange={(event) => setPlaces(Number(event.target.value))}
      />
      <TextField label="Your name" autoComplete="name" value={name} error={errors.name} onChange={(event) => setName(event.target.value)} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        error={errors.email}
        hint="For your confirmation and any changes to the date."
        onChange={(event) => setEmail(event.target.value)}
      />
      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}
      <Button type="submit" block size="lg" loading={booking} disabled={!chosen}>
        {`Book ${places} ${places === 1 ? 'place' : 'places'} · ${formatMoney(bookingTotal(workshop, places))}`}
      </Button>
      <p className={styles.muted}>Free to cancel up to {CANCEL_CUTOFF_HOURS} hours before.</p>
    </form>
  );
}
