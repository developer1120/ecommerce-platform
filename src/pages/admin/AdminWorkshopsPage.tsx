import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarPlus, Palette } from 'lucide-react';
import { addSession, listSchedule } from '@/api/adminWorkshopsApi';
import { isApiError } from '@/api/client';
import { LoadError } from '@/components/feedback/LoadError';
import { Badge, Button, HeadingIcon, Spinner, TextField, ToggleChip } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import { WORKSHOPS } from '@/data/workshops';
import { fillPercent, formatSessionDate, formatSessionTime, isUpcoming, type NewSession } from '@/domain/workshops';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Admin.module.css';

type When = 'upcoming' | 'past';

/** The studio's workshop schedule, with a form to add a session. */
export function AdminWorkshopsPage() {
  usePageTitle('Workshops · Admin');
  const { token } = useAuth();
  const schedule = useAsync((signal) => listSchedule(token!, { signal }), [token]);
  const [params, setParams] = useSearchParams();
  const when: When = params.get('show') === 'past' ? 'past' : 'upcoming';

  if (schedule.status === 'error') return <LoadError error={schedule.error} onRetry={schedule.reload} subject="the schedule" />;
  if (!schedule.data) return <Spinner label="Loading the schedule" />;

  const now = new Date();
  const upcoming = schedule.data.filter(({ session }) => isUpcoming(session, now));
  const past = schedule.data.filter(({ session }) => !isUpcoming(session, now)).reverse();
  const shown = when === 'upcoming' ? upcoming : past;

  return (
    <div className={styles.section}>
      <section className={styles.section} aria-labelledby="schedule-title">
        <h2 id="schedule-title" className={styles.sectionTitle}>
          <HeadingIcon icon={Palette} />
          Workshops
        </h2>
        <div className={styles.chips} role="group" aria-label="Show">
          <ToggleChip selected={when === 'upcoming'} accessibleLabel={`Upcoming, ${upcoming.length} sessions`} onToggle={() => setParams({}, { replace: true })}>
            Upcoming <span className={styles.count}>{upcoming.length}</span>
          </ToggleChip>
          <ToggleChip selected={when === 'past'} accessibleLabel={`Past, ${past.length} sessions`} onToggle={() => setParams({ show: 'past' }, { replace: true })}>
            Past <span className={styles.count}>{past.length}</span>
          </ToggleChip>
        </div>
        {shown.length === 0 ? (
          <p className={styles.empty}>{when === 'upcoming' ? 'Nothing scheduled. Add a session below.' : 'No past sessions yet.'}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-labelledby="schedule-title">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Workshop</th>
                  <th scope="col">Booked</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ session, workshop, taken, bookings }) => (
                  <tr key={session.id}>
                    <th scope="row" className={styles.nowrap}>
                      <Link to={`/admin/workshops/${session.id}`} className={styles.productName}>
                        {formatSessionDate(session.startsAt)}
                      </Link>
                      <span className={styles.muted}>{formatSessionTime(session.startsAt, workshop.durationMinutes)}</span>
                    </th>
                    <td>{workshop.title}</td>
                    <td className={styles.nowrap}>
                      <meter min={0} max={workshop.capacity} value={taken} aria-label={`${taken} of ${workshop.capacity} places booked`} />{' '}
                      {taken} / {workshop.capacity}
                      <span className={styles.muted}>
                        {bookings} {bookings === 1 ? 'booking' : 'bookings'} · {fillPercent(taken, workshop.capacity)}% full
                      </span>
                    </td>
                    <td>
                      {session.status === 'cancelled' ? (
                        <Badge tone="sale">Cancelled</Badge>
                      ) : taken >= workshop.capacity ? (
                        <Badge tone="success">Full</Badge>
                      ) : (
                        <Badge>Open</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <AddSession onAdded={schedule.reload} />
    </div>
  );
}

function AddSession({ onAdded }: { onAdded: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<NewSession>({ workshop: '', date: '', time: '18:30' });
  const [errors, setErrors] = useState<Partial<Record<keyof NewSession, string>>>({});
  const [saving, setSaving] = useState(false);

  function change(field: keyof NewSession, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found: typeof errors = {};
    if (!form.workshop) found.workshop = 'Choose a workshop';
    if (!form.date) found.date = 'Choose a date';
    if (!form.time) found.time = 'Choose a start time';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const session = await addSession(token!, form);
      const workshop = WORKSHOPS.find((candidate) => candidate.slug === session.workshop)!;
      toast({ title: 'Session added', description: `${workshop.title}, ${formatSessionDate(session.startsAt)}. It's open for booking now.` });
      setForm((current) => ({ ...current, date: '' }));
      onAdded();
    } catch (error) {
      // Clashes belong to the time; anything else to the date.
      const message = isApiError(error) ? error.message : "Couldn't add the session";
      setErrors(isApiError(error) && error.code === 'CONFLICT' ? { time: message } : { date: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit} noValidate aria-labelledby="add-session-title">
      <h3 id="add-session-title" className={styles.legend}>
        <HeadingIcon icon={CalendarPlus} />
        Add a session
      </h3>
      <div className={styles.pair}>
        <SelectField
          label="Workshop"
          placeholder="Choose a workshop"
          options={WORKSHOPS.map((workshop) => ({ value: workshop.slug, label: workshop.title }))}
          value={form.workshop}
          error={errors.workshop}
          onChange={(event) => change('workshop', event.target.value)}
        />
        <div className={styles.pair}>
          <TextField label="Date" type="date" value={form.date} error={errors.date} onChange={(event) => change('date', event.target.value)} />
          <TextField
            label="Starts (ET)"
            type="time"
            step={900}
            value={form.time}
            error={errors.time}
            onChange={(event) => change('time', event.target.value)}
          />
        </div>
      </div>
      <div>
        <Button type="submit" loading={saving} leadingIcon={<CalendarPlus />}>
          Add session
        </Button>
      </div>
    </form>
  );
}
