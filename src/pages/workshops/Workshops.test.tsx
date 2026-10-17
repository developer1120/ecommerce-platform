import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { loadOutbox } from '@/api/outbox';
import { bookWorkshop, cancelBooking, listMyBookings, loadBookings, saveSessions } from '@/api/workshopsApi';
import { SEED_SESSIONS } from '@/data/workshops';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { axeViolations } from '@/test/axe';
import { renderRoute } from '@/test/renderRoute';
import * as download from '@/lib/download';

const main = () => within(screen.getByRole('main'));
const DAY = 24 * 60 * 60 * 1000;
let guests = 0;
const book = (sessionId: string, places: number, email = `guest${(guests += 1)}@example.com`) =>
  bookWorkshop(null, { sessionId, name: 'Someone Else', email, places });

async function ada() {
  const { token, user } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
  return { token, user };
}

describe('bookings on the server', () => {
  it('books places, refusing more than are left, past dates and double bookings', async () => {
    const booking = await bookWorkshop(null, { sessionId: 'ws-print-1128', name: ' Grace Hopper ', email: 'GRACE@example.com', places: 2 });
    expect(booking).toMatchObject({ workshop: 'linen-napkin-printing', name: 'Grace Hopper', email: 'grace@example.com', places: 2, total: 17_000 });
    expect(booking.id).toMatch(/^WB-[0-9A-F]{6}$/);
    expect(loadOutbox().at(-1)).toMatchObject({ to: 'grace@example.com', subject: `You're booked: Block printing on linen [${booking.id}]` });
    expect(loadOutbox().at(-1)!.body).toContain('Sat, Nov 28, 10:00 AM – 1:00 PM ET');

    await expect(book('ws-print-1128', 2, 'grace@example.com')).rejects.toMatchObject({ code: 'CONFLICT', message: /already booked/ });
    await book('ws-print-1128', 3);
    // Six places: two and three taken.
    await expect(book('ws-print-1128', 2)).rejects.toMatchObject({ code: 'CONFLICT', message: 'Only 1 place is left on this date' });

    vi.setSystemTime(new Date('2026-11-29T12:00:00Z'));
    await expect(book('ws-print-1128', 1)).rejects.toMatchObject({ code: 'CONFLICT', message: 'This date is no longer available. Choose another.' });
  });

  it('lets shoppers see and cancel their bookings until two days before', async () => {
    // Late enough that the session is still signed in at the end.
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const { token } = await ada();
    const early = await bookWorkshop(token, { sessionId: 'ws-candle-1119', name: 'Ada', email: 'ada@example.com', places: 1 });
    // Booked as a guest with the same email: still theirs.
    const guest = await bookWorkshop(null, { sessionId: 'ws-mend-1121', name: 'Ada', email: 'ada@example.com', places: 2 });
    expect((await listMyBookings(token)).map((entry) => entry.booking.id)).toEqual([early.id, guest.id]);

    expect((await cancelBooking(token, early.id)).status).toBe('cancelled');
    await expect(cancelBooking(token, early.id)).rejects.toMatchObject({ code: 'CONFLICT' });

    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    expect((await listMyBookings(token)).find((entry) => entry.booking.id === guest.id)!.canCancel).toBe(false);
    await expect(cancelBooking(token, guest.id)).rejects.toMatchObject({ code: 'CONFLICT', message: /up to 48 hours/ });
  });
});

describe('the workshops pages', () => {
  it('lists workshops by their next date', async () => {
    await book('ws-candle-1119', 4);
    await book('ws-candle-1119', 4);
    renderRoute('/workshops');
    const cards = await main().findAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Wheel throwing for beginners',
      'Hand-dipped beeswax candles',
      'Visible mending',
      'Block printing on linen',
    ]);
    expect(cards[0]).toHaveTextContent('Next: Thu, Nov 12 (+2 more)');
    expect(cards[1]).toHaveTextContent('Only 2 places left');
    expect(cards[1]).toHaveTextContent('$55.00 a place');
  });

  it('books a place as a guest and offers a calendar file', async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(download, 'downloadText').mockImplementation(() => {});
    await book('ws-throw-1112', 4);
    await book('ws-throw-1112', 4);
    renderRoute('/workshops/wheel-throwing-for-beginners');

    expect(await main().findByRole('heading', { level: 1, name: 'Wheel throwing for beginners' })).toBeInTheDocument();
    const dates = main().getByRole('group', { name: 'Choose a date' });
    expect(within(dates).getByRole('radio', { name: /Thu, Nov 12.*Sold out/ })).toBeDisabled();
    expect(within(dates).getByRole('radio', { name: /Sat, Dec 5/ })).toBeChecked();

    await user.selectOptions(main().getByLabelText('Places'), '2');
    await user.click(main().getByRole('button', { name: 'Book 2 places · $190.00' }));
    expect(main().getByText('Enter your name')).toBeInTheDocument();
    await user.type(main().getByLabelText('Your name'), 'Grace Hopper');
    await user.type(main().getByLabelText('Email'), 'grace@example.com');
    await user.click(main().getByRole('button', { name: 'Book 2 places · $190.00' }));

    const done = await main().findByRole('status');
    expect(done).toHaveTextContent("You're booked");
    expect(done).toHaveTextContent('2 places on Sat, Dec 5, 10:00 AM – 12:30 PM ET');
    await user.click(within(done).getByRole('button', { name: 'Add to calendar' }));
    const [filename, ics, type] = save.mock.calls[0]!;
    expect(filename).toMatch(/^tanelt-WB-[0-9A-F]{6}\.ics$/);
    expect(ics).toContain('DTSTART:20261205T150000Z');
    expect(type).toBe('text/calendar');
    expect(loadBookings().filter((entry) => entry.email === 'grace@example.com')).toHaveLength(1);
  });

  it('reloads the dates when the last places go while booking', async () => {
    const user = userEvent.setup();
    renderRoute('/workshops/linen-napkin-printing');
    await user.type(await main().findByLabelText('Your name'), 'Grace Hopper');
    await user.type(main().getByLabelText('Email'), 'grace@example.com');
    await book('ws-print-1128', 4);
    await book('ws-print-1128', 2);
    await user.click(main().getByRole('button', { name: /^Book 1 place/ }));

    expect(await main().findByRole('alert')).toHaveTextContent('This date is sold out');
    await waitFor(() => expect(main().getByRole('radio', { name: /Sat, Nov 28.*Sold out/ })).toBeDisabled());
  });

  it('shows the missing page for an unknown workshop', async () => {
    renderRoute('/workshops/juggling');
    expect(await main().findByRole('heading', { level: 1, name: 'This page has wandered off' })).toBeInTheDocument();
  });

  it('says so when a workshop has no dates', async () => {
    saveSessions(SEED_SESSIONS.filter((session) => session.workshop !== 'visible-mending'));
    renderRoute('/workshops/visible-mending');
    expect(await main().findByRole('heading', { name: 'No dates right now' })).toBeInTheDocument();
  });
});

describe('the shopper’s workshops', () => {
  it('fills in the shopper, and lists and cancels their bookings', async () => {
    const user = userEvent.setup();
    const { token } = await ada();
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    renderRoute('/workshops/hand-dipped-candles');
    expect(await main().findByLabelText('Your name')).toHaveValue('Ada Lovelace');
    await user.click(main().getByRole('button', { name: 'Book 1 place · $55.00' }));
    await user.click(await main().findByRole('link', { name: 'See your bookings' }));

    const upcoming = await main().findByRole('region', { name: 'Coming up' });
    const card = within(upcoming).getByRole('article', { name: 'Hand-dipped beeswax candles, Thu, Nov 19' });
    expect(card).toHaveTextContent('6:30 PM – 8:00 PM ET');
    await user.click(within(card).getByRole('button', { name: 'Cancel booking' }));
    await user.click(within(card).getByRole('button', { name: 'Yes, cancel it' }));

    expect(await screen.findByText('Booking cancelled')).toBeInTheDocument();
    const past = await main().findByRole('region', { name: 'Past and cancelled' });
    expect(within(past).getByText('Cancelled')).toBeInTheDocument();
    expect(within(main().getByRole('region', { name: 'Coming up' })).getByText('Nothing coming up.')).toBeInTheDocument();
  });

  it('points to contacting the studio inside two days', async () => {
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const { token } = await ada();
    await bookWorkshop(token, { sessionId: 'ws-throw-1112', name: 'Ada', email: 'ada@example.com', places: 1 });
    vi.setSystemTime(new Date(new Date('2026-11-12T23:30:00Z').getTime() - DAY));
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    renderRoute('/account/workshops');
    expect(await main().findByText(/less than 48 hours away/)).toBeInTheDocument();
    expect(main().queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it.each([
    ['/workshops', 'Make it with the makers'],
    ['/workshops/visible-mending', 'Visible mending'],
  ])('%s', async (path, title) => {
    renderRoute(path);
    await main().findByRole('heading', { level: 1, name: title });
    await waitFor(() => expect(screen.queryByText(/Loading/)).not.toBeInTheDocument());
    expect(await axeViolations()).toEqual([]);
  });
});
