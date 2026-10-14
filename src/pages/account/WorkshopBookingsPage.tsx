import { useState } from 'react';
import { Link } from 'react-router';
import { Palette } from 'lucide-react';
import { isApiError } from '@/api/client';
import { cancelBooking, listMyBookings, type MyBooking } from '@/api/workshopsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Badge, Button, HeadingIcon, Spinner } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { CANCEL_CUTOFF_HOURS, formatSessionDate, formatSessionTime, isUpcoming, workshopPath } from '@/domain/workshops';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Messages.module.css';

/** Workshops the shopper has booked: what's coming up, then what's past or cancelled. */
export function WorkshopBookingsPage() {
  usePageTitle('Your workshops');
  const { token } = useAuth();
  const result = useAsync((signal) => listMyBookings(token!, { signal }), [token]);

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="your workshops" />;
  if (!result.data) return <Spinner label="Loading your workshops" />;

  const now = new Date();
  const upcoming = result.data.filter(({ booking, session }) => booking.status === 'booked' && session.status === 'scheduled' && isUpcoming(session, now));
  const rest = result.data.filter((entry) => !upcoming.includes(entry)).reverse();

  return (
    <section className={styles.section} aria-labelledby="bookings-title">
      <div className={styles.titleRow}>
        <h2 id="bookings-title" className={styles.title}>
          <HeadingIcon icon={Palette} />
          Workshops
        </h2>
        <Link to="/workshops" className={styles.newLink}>
          See all workshops
        </Link>
      </div>
      {result.data.length === 0 ? (
        <div className={styles.empty}>
          <Palette className={styles.emptyIcon} aria-hidden="true" />
          <p>
            No workshops booked. Throw a pot, dip a candle or mend a jumper with our makers: <Link to="/workshops">see what's on</Link>.
          </p>
        </div>
      ) : (
        <>
          <BookingGroup title="Coming up" entries={upcoming} onChanged={result.reload} empty="Nothing coming up." />
          {rest.length > 0 && <BookingGroup title="Past and cancelled" entries={rest} onChanged={result.reload} />}
        </>
      )}
    </section>
  );
}

function BookingGroup({ title, entries, onChanged, empty }: { title: string; entries: MyBooking[]; onChanged: () => void; empty?: string }) {
  const id = `bookings-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={styles.replyPanel}>
      <h3 id={id} className={styles.panelTitle}>
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className={styles.meta}>{empty}</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <BookingCard key={entry.booking.id} entry={entry} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BookingCard({ entry, onChanged }: { entry: MyBooking; onChanged: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const { booking, workshop, session, canCancel } = entry;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await cancelBooking(token!, booking.id);
      toast({ title: 'Booking cancelled', description: 'Your places are free for someone else. Nothing to pay.' });
      onChanged();
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't cancel the booking", description: isApiError(error) ? error.message : undefined });
      setBusy(false);
    }
  }

  const status =
    session.status === 'cancelled' ? (
      <Badge tone="sale">Cancelled by the studio</Badge>
    ) : booking.status === 'cancelled' ? (
      <Badge>Cancelled</Badge>
    ) : null;

  return (
    <li>
      <article className={styles.card} aria-label={`${workshop.title}, ${formatSessionDate(session.startsAt)}`}>
        <span className={styles.cardTop}>
          <Link to={workshopPath(workshop.slug)} className={styles.subject}>
            {workshop.title}
          </Link>
          {status}
        </span>
        <span className={styles.meta}>
          {formatSessionDate(session.startsAt)}, {formatSessionTime(session.startsAt, workshop.durationMinutes)}
        </span>
        <span className={styles.meta}>
          {booking.id} · {booking.places} {booking.places === 1 ? 'place' : 'places'} · {formatMoney(booking.total)}
        </span>
        {session.cancelReason && <span className={styles.preview}>{session.cancelReason}</span>}
        {booking.status === 'booked' && session.status === 'scheduled' && isUpcoming(session, new Date()) && (
          <div className={styles.resolve}>
            {!canCancel ? (
              <p className={styles.meta}>
                It's less than {CANCEL_CUTOFF_HOURS} hours away, so <Link to="/help/contact?topic=other">contact us</Link> to cancel.
              </p>
            ) : confirming ? (
              <>
                <p className={styles.meta}>Cancel this booking?</p>
                <Button variant="secondary" size="sm" loading={busy} onClick={() => void cancel()}>
                  Yes, cancel it
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                Cancel booking
              </Button>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
