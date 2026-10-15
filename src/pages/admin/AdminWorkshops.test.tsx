import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addSession, cancelSession, listSchedule, setCheckedIn } from '@/api/adminWorkshopsApi';
import { signIn, signUp } from '@/api/authApi';
import { loadOutbox } from '@/api/outbox';
import { bookWorkshop, loadBookings, loadSessions } from '@/api/workshopsApi';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const main = () => within(screen.getByRole('main'));

async function admin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  return token;
}

const book = (sessionId: string, name: string, places = 1) =>
  bookWorkshop(null, { sessionId, name, email: `${name.split(' ')[0]!.toLowerCase()}@example.com`, places });

describe('the schedule on the server', () => {
  it('adds sessions on the studio clock and refuses clashes', async () => {
    const token = await admin();
    const session = await addSession(token, { workshop: 'hand-dipped-candles', date: '2026-11-13', time: '18:30' });
    expect(session).toMatchObject({ workshop: 'hand-dipped-candles', startsAt: '2026-11-13T23:30:00.000Z', status: 'scheduled' });
    expect(loadSessions().at(-1)).toEqual(session);
    // The beginners' throwing class runs 6:30–9:00 on November 12.
    await expect(addSession(token, { workshop: 'visible-mending', date: '2026-11-12', time: '20:00' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The studio is booked for Wheel throwing for beginners then (6:30 PM – 9:00 PM ET)',
    });
    await expect(addSession(token, { workshop: 'nope', date: '2026-11-12', time: '20:00' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('cancels a session with everyone on it, and only admins can', async () => {
    const token = await admin();
    await book('ws-candle-1119', 'Grace Hopper', 2);
    await book('ws-candle-1119', 'Ken Thompson');
    const { token: shopper } = await signUp({ name: 'Ada', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
    await expect(cancelSession(shopper, 'ws-candle-1119', 'Ill')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(cancelSession(token, 'ws-candle-1119', '  ')).rejects.toMatchObject({ code: 'VALIDATION' });

    const { notified } = await cancelSession(token, 'ws-candle-1119', 'Our candle maker is unwell.');
    expect(notified).toBe(2);
    expect(loadBookings().every((booking) => booking.status === 'cancelled')).toBe(true);
    expect(loadOutbox().at(-1)).toMatchObject({ to: 'ken@example.com', subject: 'Cancelled: Hand-dipped beeswax candles on Thu, Nov 19' });
    expect(loadOutbox().at(-1)!.body).toContain('Our candle maker is unwell.');
    await expect(cancelSession(token, 'ws-candle-1119', 'Again')).rejects.toMatchObject({ code: 'CONFLICT' });
    // Nobody can book a cancelled date.
    await expect(book('ws-candle-1119', 'Late Comer')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await listSchedule(token)).find((entry) => entry.session.id === 'ws-candle-1119')).toMatchObject({ taken: 0, bookings: 0 });
  });

  it('ticks people off at the door', async () => {
    const token = await admin();
    const booking = await book('ws-mend-1121', 'Grace Hopper');
    expect((await setCheckedIn(token, booking.id, true)).checkedIn).toBe(true);
    expect((await setCheckedIn(token, booking.id, false)).checkedIn).toBe(false);
  });
});

describe('workshops in the admin', () => {
  beforeEach(async () => {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(await admin()));
  });

  it('shows the schedule and adds a session', async () => {
    const user = userEvent.setup();
    await book('ws-print-1128', 'Grace Hopper', 4);
    await book('ws-print-1128', 'Ken Thompson', 2);
    renderRoute('/admin/workshops');

    const table = await main().findByRole('table', { name: 'Workshops' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toHaveTextContent('Thu, Nov 12');
    const printing = within(table).getByRole('row', { name: /Sat, Nov 28/ });
    expect(printing).toHaveTextContent('6 / 6');
    expect(within(printing).getByText('Full')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Admin' })).getByRole('link', { name: 'Workshops' })).toHaveAttribute('aria-current', 'page');

    await user.click(main().getByRole('button', { name: 'Add session' }));
    expect(main().getByText('Choose a workshop', { selector: 'p' })).toBeInTheDocument();
    await user.selectOptions(main().getByLabelText('Workshop'), 'Visible mending');
    await user.type(main().getByLabelText('Date'), '2026-11-12');
    await user.clear(main().getByLabelText('Starts (ET)'));
    await user.type(main().getByLabelText('Starts (ET)'), '19:00');
    await user.click(main().getByRole('button', { name: 'Add session' }));
    expect(await main().findByText(/The studio is booked for Wheel throwing/)).toBeInTheDocument();

    await user.clear(main().getByLabelText('Date'));
    await user.type(main().getByLabelText('Date'), '2026-11-14');
    await user.click(main().getByRole('button', { name: 'Add session' }));
    expect(await screen.findByText('Session added')).toBeInTheDocument();
    await waitFor(() => expect(within(main().getByRole('table', { name: 'Workshops' })).getAllByRole('row')).toHaveLength(11));
  });

  it('keeps a door list and cancels a session', async () => {
    const user = userEvent.setup();
    await book('ws-mend-1121', 'Grace Hopper', 2);
    await book('ws-mend-1121', 'Ken Thompson');
    renderRoute('/admin/workshops/ws-mend-1121');

    expect(await main().findByRole('heading', { level: 2, name: 'Visible mending' })).toBeInTheDocument();
    expect(main().getByText('Places booked', { selector: 'dt' }).closest('div')).toHaveTextContent('3 / 8');
    await user.click(main().getByRole('checkbox', { name: 'Grace Hopper arrived' }));
    expect(main().getByText('Arrived', { selector: 'dt' }).closest('div')).toHaveTextContent('2');
    await waitFor(() => expect(loadBookings().find((booking) => booking.name === 'Grace Hopper')!.checkedIn).toBe(true));

    await user.click(main().getByRole('button', { name: 'Cancel this session' }));
    await user.click(main().getByRole('button', { name: 'Cancel session' }));
    expect(main().getByText('Tell the people booked why')).toBeInTheDocument();
    await user.type(main().getByLabelText(/Why, for the email to 2 bookings/), 'The studio is flooded.');
    await user.click(main().getByRole('button', { name: 'Cancel session' }));

    expect(await screen.findByText('Session cancelled')).toBeInTheDocument();
    expect(await main().findByText('The studio is flooded.')).toBeInTheDocument();
    expect(main().getAllByText('Cancelled').length).toBeGreaterThan(1);
  });
});
