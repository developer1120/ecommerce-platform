import { SEED_SESSIONS, WORKSHOPS } from '@/data/workshops';
import { MAKERS } from '@/data/makers';
import { findMaker } from './stories';
import {
  availabilityLabel,
  bookingCalendar,
  canCancelBooking,
  checkNewSession,
  fillPercent,
  formatDuration,
  formatSessionDate,
  formatSessionTime,
  placesLeft,
  placesTaken,
  studioTimeToIso,
  upcomingSessions,
  validateBooking,
  type WorkshopBooking,
} from './workshops';

const booking = (sessionId: string, places: number, status: WorkshopBooking['status'] = 'booked'): WorkshopBooking => ({
  id: `WB-${sessionId}-${places}`,
  sessionId,
  workshop: 'w',
  name: 'Ada',
  email: 'ada@example.com',
  places,
  total: 0,
  createdAt: '2026-10-01T00:00:00Z',
  status,
});

describe('content', () => {
  it('has a maker for every workshop and sessions only for real workshops', () => {
    for (const workshop of WORKSHOPS) expect(findMaker(MAKERS, workshop.maker), workshop.slug).toBeDefined();
    for (const session of SEED_SESSIONS) expect(WORKSHOPS.some((workshop) => workshop.slug === session.workshop), session.id).toBe(true);
    expect(new Set(SEED_SESSIONS.map((session) => session.id)).size).toBe(SEED_SESSIONS.length);
  });
});

describe('places', () => {
  it('counts places that are still booked', () => {
    const bookings = [booking('a', 2), booking('a', 3), booking('a', 4, 'cancelled'), booking('b', 1)];
    expect(placesTaken('a', bookings)).toBe(5);
    expect(placesLeft({ id: 'a' }, { capacity: 6 }, bookings)).toBe(1);
    expect(placesLeft({ id: 'a' }, { capacity: 4 }, bookings)).toBe(0);
    expect([availabilityLabel(0), availabilityLabel(1), availabilityLabel(3), availabilityLabel(4)]).toEqual([
      'Sold out',
      'Only 1 place left',
      'Only 3 places left',
      undefined,
    ]);
  });

  it('checks a booking against what is left', () => {
    const form = { sessionId: 'a', name: 'Ada', email: 'ada@example.com', places: 2 };
    expect(validateBooking(form, 2)).toEqual({});
    expect(validateBooking(form, 1)).toEqual({ places: 'Only 1 place is left on this date' });
    expect(validateBooking(form, 0)).toEqual({ places: 'This date is sold out' });
    expect(validateBooking({ ...form, places: 5 }, 8)).toEqual({ places: 'Book up to 4 places at a time' });
    expect(validateBooking({ sessionId: '', name: '', email: 'nope', places: 0 }, 8)).toEqual({
      sessionId: 'Choose a date',
      name: 'Enter your name',
      email: 'Enter an email address like name@example.com',
      places: 'Book at least one place',
    });
  });
});

describe('dates', () => {
  const now = new Date('2026-11-10T12:00:00Z');

  it('lists upcoming scheduled sessions, soonest first', () => {
    const sessions = [
      { id: 'late', startsAt: '2026-12-01T00:00:00Z', status: 'scheduled' as const },
      { id: 'past', startsAt: '2026-11-01T00:00:00Z', status: 'scheduled' as const },
      { id: 'soon', startsAt: '2026-11-11T00:00:00Z', status: 'scheduled' as const },
      { id: 'off', startsAt: '2026-11-20T00:00:00Z', status: 'cancelled' as const },
    ];
    expect(upcomingSessions(sessions, now).map((session) => session.id)).toEqual(['soon', 'late']);
  });

  it('allows cancelling up to two days before', () => {
    expect(canCancelBooking({ startsAt: '2026-11-12T12:00:00Z' }, now)).toBe(true);
    expect(canCancelBooking({ startsAt: '2026-11-12T11:59:00Z' }, now)).toBe(false);
  });

  it('shows times in the studio’s time zone', () => {
    expect(formatSessionDate('2026-11-12T23:30:00Z')).toBe('Thu, Nov 12');
    expect(formatSessionTime('2026-11-12T23:30:00Z', 150)).toBe('6:30 PM – 9:00 PM ET');
    expect([formatDuration(90), formatDuration(120), formatDuration(150), formatDuration(180)]).toEqual([
      '90 minutes',
      '2 hours',
      '2½ hours',
      '3 hours',
    ]);
  });

  it('writes a calendar event in UTC', () => {
    const ics = bookingCalendar({ id: 'WB-ABC123', places: 2 }, { title: 'Candles, beeswax', durationMinutes: 90 }, { startsAt: '2026-11-19T23:30:00Z' });
    expect(ics.split('\r\n')).toEqual(
      expect.arrayContaining([
        'DTSTART:20261119T233000Z',
        'DTEND:20261120T010000Z',
        'SUMMARY:Candles\\, beeswax at Tanelt',
        'UID:WB-ABC123@tanelt.test',
        'DESCRIPTION:Booking WB-ABC123\\, 2 places.',
      ]),
    );
  });
});

describe('the studio schedule', () => {
  const workshops = [
    { slug: 'pots', title: 'Pots', durationMinutes: 150 },
    { slug: 'wax', title: 'Wax', durationMinutes: 90 },
  ];
  const now = new Date('2026-10-07T19:00:00Z');

  it('turns studio clock times into UTC, through daylight saving', () => {
    expect(studioTimeToIso('2026-10-20', '18:30')).toBe('2026-10-20T22:30:00.000Z');
    expect(studioTimeToIso('2026-11-12', '18:30')).toBe('2026-11-12T23:30:00.000Z');
    expect(studioTimeToIso('2026-02-30', '18:30')).toBeUndefined();
    expect(studioTimeToIso('2026-11-12', '25:00')).toBeUndefined();
  });

  it('refuses sessions in the past or overlapping another', () => {
    const sessions = [{ workshop: 'pots', startsAt: '2026-11-12T23:30:00Z', status: 'scheduled' as const }];
    expect(checkNewSession({ workshop: 'wax', date: '2026-11-13', time: '18:30' }, workshops, sessions, now)).toEqual({
      ok: true,
      startsAt: '2026-11-13T23:30:00.000Z',
    });
    // 8 PM starts during the 6:30–9:00 pots session.
    expect(checkNewSession({ workshop: 'wax', date: '2026-11-12', time: '20:00' }, workshops, sessions, now)).toEqual({
      ok: false,
      field: 'time',
      error: 'The studio is booked for Pots then (6:30 PM – 9:00 PM ET)',
    });
    // Ending as the other starts is fine.
    expect(checkNewSession({ workshop: 'wax', date: '2026-11-12', time: '17:00' }, workshops, sessions, now).ok).toBe(true);
    expect(checkNewSession({ workshop: 'wax', date: '2026-11-12', time: '20:00' }, workshops, [{ ...sessions[0]!, status: 'cancelled' }], now).ok).toBe(true);
    expect(checkNewSession({ workshop: 'wax', date: '2026-10-01', time: '10:00' }, workshops, [], now)).toMatchObject({ error: 'Choose a date in the future' });
    expect(checkNewSession({ workshop: '', date: '2026-11-01', time: '10:00' }, workshops, [], now)).toMatchObject({ field: 'workshop' });
  });

  it('works out how full a session is', () => {
    expect([fillPercent(0, 8), fillPercent(3, 8), fillPercent(9, 8), fillPercent(1, 0)]).toEqual([0, 38, 100, 0]);
  });
});
