import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, CalendarX, Palette, UsersRound } from 'lucide-react';
import { cancelSession, getSessionDetail, setCheckedIn } from '@/api/adminWorkshopsApi';
import { isApiError } from '@/api/client';
import { LoadError } from '@/components/feedback/LoadError';
import { Badge, Button, HeadingIcon, Spinner } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { CANCEL_REASON_MAX, formatSessionDate, formatSessionTime, isUpcoming, STUDIO_ADDRESS, type WorkshopBooking } from '@/domain/workshops';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Admin.module.css';

/** One session: who's coming, a door list to tick off, and cancelling if it can't go ahead. */
export function AdminWorkshopSessionPage() {
  const { sessionId = '' } = useParams();
  const { token } = useAuth();
  const { toast } = useToast();
  const result = useAsync((signal) => getSessionDetail(token!, sessionId, { signal }), [token, sessionId]);
  // Check-ins change one booking at a time; keep them here so the list doesn't reload for each tick.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  usePageTitle(result.data ? `${result.data.workshop.title}, ${formatSessionDate(result.data.session.startsAt)} · Admin` : 'Workshop · Admin');

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="this session" />;
  if (!result.data) return <Spinner label="Loading session" />;

  const { session, workshop, bookings } = result.data;
  const standing = bookings.filter((booking) => booking.status === 'booked');
  const places = standing.reduce((sum, booking) => sum + booking.places, 0);
  const isChecked = (booking: WorkshopBooking) => checked[booking.id] ?? booking.checkedIn ?? false;
  const arrived = standing.filter(isChecked).reduce((sum, booking) => sum + booking.places, 0);

  async function toggle(booking: WorkshopBooking, value: boolean) {
    setChecked((current) => ({ ...current, [booking.id]: value }));
    try {
      await setCheckedIn(token!, booking.id, value);
    } catch (error) {
      setChecked((current) => ({ ...current, [booking.id]: !value }));
      toast({ tone: 'error', title: "Couldn't update the door list", description: isApiError(error) ? error.message : undefined });
    }
  }

  return (
    <article className={styles.section} aria-labelledby="session-title">
      <Link to="/admin/workshops" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> Schedule
      </Link>
      <header className={styles.toolbar}>
        <div>
          <h2 id="session-title" className={styles.sectionTitle}>
            <HeadingIcon icon={Palette} />
            {workshop.title}
          </h2>
          <p className={styles.muted}>
            {formatSessionDate(session.startsAt)}, {formatSessionTime(session.startsAt, workshop.durationMinutes)} · {STUDIO_ADDRESS}
          </p>
        </div>
        {session.status === 'cancelled' && <Badge tone="sale">Cancelled</Badge>}
      </header>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Places booked</dt>
          <dd>
            {places} / {workshop.capacity}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt>Arrived</dt>
          <dd>{arrived}</dd>
        </div>
        <div className={styles.stat}>
          <dt>To collect</dt>
          <dd>{formatMoney(standing.reduce((sum, booking) => sum + booking.total, 0))}</dd>
        </div>
      </dl>

      <div className={styles.form}>
        <section className={`${styles.panel} ${styles.formMain}`} aria-labelledby="door-list-title">
          <h3 id="door-list-title" className={styles.legend}>
            <HeadingIcon icon={UsersRound} />
            Door list
          </h3>
          {bookings.length === 0 ? (
            <p className={styles.muted}>Nobody has booked yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} aria-labelledby="door-list-title">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Places</th>
                    <th scope="col">To pay</th>
                    <th scope="col">Arrived</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <th scope="row">
                        <span className={styles.productName}>{booking.name}</span>
                        <span className={styles.muted}>
                          {booking.email} · {booking.id}
                        </span>
                      </th>
                      <td className={styles.number}>{booking.places}</td>
                      <td className={styles.number}>{formatMoney(booking.total)}</td>
                      <td>
                        {booking.status === 'cancelled' ? (
                          <Badge>Cancelled</Badge>
                        ) : (
                          <label className={styles.checkRow}>
                            <input
                              type="checkbox"
                              checked={isChecked(booking)}
                              disabled={session.status === 'cancelled'}
                              onChange={(event) => void toggle(booking, event.target.checked)}
                            />
                            <span className="visually-hidden">{booking.name} arrived</span>
                          </label>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className={styles.formSide}>
          {session.status === 'cancelled' ? (
            <section className={styles.panel} aria-labelledby="cancelled-title">
              <h3 id="cancelled-title" className={styles.legend}>
                <HeadingIcon icon={CalendarX} />
                Cancelled
              </h3>
              <p className={styles.note}>{session.cancelReason}</p>
            </section>
          ) : (
            isUpcoming(session, new Date()) && <CancelSession sessionId={session.id} booked={standing.length} onCancelled={result.reload} />
          )}
        </aside>
      </div>
    </article>
  );
}

function CancelSession({ sessionId, booked, onCancelled }: { sessionId: string; booked: number; onCancelled: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  const errorId = useId();

  async function cancel() {
    if (!reason.trim()) {
      setError('Tell the people booked why');
      return;
    }
    setBusy(true);
    try {
      const { notified } = await cancelSession(token!, sessionId, reason);
      toast({ tone: 'info', title: 'Session cancelled', description: notified > 0 ? `We've emailed ${notified} ${notified === 1 ? 'person' : 'people'}.` : undefined });
      onCancelled();
    } catch (failure) {
      setError(isApiError(failure) ? failure.message : "Couldn't cancel the session");
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="cancel-session-title">
      <h3 id="cancel-session-title" className={styles.legend}>
        <HeadingIcon icon={CalendarX} />
        Can't go ahead?
      </h3>
      {open ? (
        <div className={styles.confirm}>
          <div className={styles.field}>
            <label htmlFor={reasonId} className={styles.label}>
              Why, for the email to {booked} {booked === 1 ? 'booking' : 'bookings'}
            </label>
            <textarea
              id={reasonId}
              className={styles.textarea}
              rows={3}
              maxLength={CANCEL_REASON_MAX}
              value={reason}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
            />
            {error && (
              <p id={errorId} className={styles.error}>
                {error}
              </p>
            )}
          </div>
          <div className={styles.confirmActions}>
            <Button variant="secondary" size="sm" loading={busy} onClick={() => void cancel()}>
              Cancel session
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.muted}>Cancelling frees the date and emails everyone booked.</p>
          <Button variant="ghost" block onClick={() => setOpen(true)}>
            Cancel this session
          </Button>
        </>
      )}
    </section>
  );
}
