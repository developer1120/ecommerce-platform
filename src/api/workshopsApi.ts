import { SEED_SESSIONS, WORKSHOPS } from '@/data/workshops';
import { normalizeEmail } from '@/domain/auth';
import { formatMoney } from '@/domain/money';
import {
  bookingTotal,
  canCancelBooking,
  CANCEL_CUTOFF_HOURS,
  formatSessionDate,
  formatSessionTime,
  isUpcoming,
  placesLeft,
  STUDIO_ADDRESS,
  upcomingSessions,
  validateBooking,
  type BookingForm,
  type Workshop,
  type WorkshopBooking,
  type WorkshopSession,
} from '@/domain/workshops';
import { randomHex } from '@/lib/crypto';
import { readJson, writeJson } from '@/lib/storage';
import { userForToken } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { sendEmails } from './outbox';

export const SESSIONS_KEY = 'tanelt:mock-db:workshop-sessions';
export const BOOKINGS_KEY = 'tanelt:mock-db:workshop-bookings';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
/** The schedule: the opening sessions until the studio changes it, then whatever it saved. */
export const loadSessions = (): WorkshopSession[] => readJson(SESSIONS_KEY, SEED_SESSIONS, isArray) as WorkshopSession[];
export const saveSessions = (sessions: WorkshopSession[]) => writeJson(SESSIONS_KEY, sessions);
export const loadBookings = (): WorkshopBooking[] => readJson(BOOKINGS_KEY, [], isArray) as WorkshopBooking[];
export const saveBookings = (bookings: WorkshopBooking[]) => writeJson(BOOKINGS_KEY, bookings);

export function findWorkshop(slug: string): Workshop | undefined {
  return WORKSHOPS.find((workshop) => workshop.slug === slug);
}

export interface SessionAvailability extends WorkshopSession {
  placesLeft: number;
}

function withAvailability(sessions: WorkshopSession[], bookings: WorkshopBooking[]): SessionAvailability[] {
  return sessions.map((session) => ({ ...session, placesLeft: placesLeft(session, findWorkshop(session.workshop)!, bookings) }));
}

export interface WorkshopListing {
  workshop: Workshop;
  /** Upcoming sessions, soonest first. */
  sessions: SessionAvailability[];
}

/** Every workshop with its upcoming dates. Workshops with no dates yet are listed last. */
export function listWorkshops(options?: RequestOptions): Promise<WorkshopListing[]> {
  return simulateRequest(() => {
    const bookings = loadBookings();
    const upcoming = upcomingSessions(loadSessions(), new Date());
    return WORKSHOPS.map((workshop) => ({
      workshop,
      sessions: withAvailability(
        upcoming.filter((session) => session.workshop === workshop.slug),
        bookings,
      ),
    })).sort((a, b) => (a.sessions[0]?.startsAt ?? '9999').localeCompare(b.sessions[0]?.startsAt ?? '9999'));
  }, options);
}

export function getWorkshop(slug: string, options?: RequestOptions): Promise<WorkshopListing> {
  return simulateRequest(() => {
    const workshop = findWorkshop(slug);
    if (!workshop) throw new ApiError('NOT_FOUND', "We couldn't find that workshop.");
    const upcoming = upcomingSessions(loadSessions(), new Date()).filter((session) => session.workshop === slug);
    return { workshop, sessions: withAvailability(upcoming, loadBookings()) };
  }, options);
}

/**
 * Books places on a session. Places are counted again here, so two people
 * racing for the last place can't both get it.
 */
export function bookWorkshop(token: string | null, form: BookingForm, options?: RequestOptions): Promise<WorkshopBooking> {
  return simulateRequest(() => {
    const session = loadSessions().find((candidate) => candidate.id === form.sessionId);
    const workshop = session && findWorkshop(session.workshop);
    if (!session || !workshop) throw new ApiError('NOT_FOUND', "We couldn't find that date.");
    const now = new Date();
    if (session.status === 'cancelled' || !isUpcoming(session, now)) throw new ApiError('CONFLICT', 'This date is no longer available. Choose another.');

    const bookings = loadBookings();
    const left = placesLeft(session, workshop, bookings);
    const errors = validateBooking(form, left);
    const problem = Object.values(errors)[0];
    if (problem) throw new ApiError(errors.places && left < form.places ? 'CONFLICT' : 'VALIDATION', problem);
    const email = normalizeEmail(form.email);
    if (bookings.some((booking) => booking.sessionId === session.id && booking.email === email && booking.status === 'booked')) {
      throw new ApiError('CONFLICT', "You're already booked on this date. Your confirmation email has the details.");
    }

    const user = userForToken(token);
    const booking: WorkshopBooking = {
      id: `WB-${randomHex(3).toUpperCase()}`,
      sessionId: session.id,
      workshop: workshop.slug,
      name: form.name.trim(),
      email,
      ...(user && { customerId: user.id }),
      places: form.places,
      total: bookingTotal(workshop, form.places),
      createdAt: now.toISOString(),
      status: 'booked',
    };
    saveBookings([...bookings, booking]);
    sendEmails([
      {
        to: email,
        subject: `You're booked: ${workshop.title} [${booking.id}]`,
        body: `Hi ${booking.name.split(' ')[0]}, see you on ${formatSessionDate(session.startsAt)}, ${formatSessionTime(session.startsAt, workshop.durationMinutes)}, at ${STUDIO_ADDRESS}. ${booking.places} ${booking.places === 1 ? 'place' : 'places'}, ${formatMoney(booking.total)} to pay at the studio on the day. If plans change, cancel up to ${CANCEL_CUTOFF_HOURS} hours before so someone else can come.`,
        sentAt: booking.createdAt,
      },
    ]);
    return booking;
  }, options);
}

export interface MyBooking {
  booking: WorkshopBooking;
  workshop: Workshop;
  session: WorkshopSession;
  canCancel: boolean;
}

function signedIn(token: string) {
  const user = userForToken(token);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
  return user;
}

/** The shopper's bookings, by account or by the email they booked with, soonest session first. */
export function listMyBookings(token: string, options?: RequestOptions): Promise<MyBooking[]> {
  return simulateRequest(() => {
    const user = signedIn(token);
    const email = normalizeEmail(user.email);
    const sessions = loadSessions();
    const now = new Date();
    return loadBookings()
      .filter((booking) => booking.customerId === user.id || booking.email === email)
      .flatMap((booking) => {
        const session = sessions.find((candidate) => candidate.id === booking.sessionId);
        const workshop = findWorkshop(booking.workshop);
        if (!session || !workshop) return [];
        const canCancel = booking.status === 'booked' && session.status === 'scheduled' && canCancelBooking(session, now);
        return [{ booking, workshop, session, canCancel }];
      })
      .sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt));
  }, options);
}

/** Cancels a booking, freeing its places, up to the cut-off. */
export function cancelBooking(token: string, bookingId: string, options?: RequestOptions): Promise<WorkshopBooking> {
  return simulateRequest(() => {
    const user = signedIn(token);
    const bookings = loadBookings();
    const index = bookings.findIndex(
      (booking) => booking.id === bookingId && (booking.customerId === user.id || booking.email === normalizeEmail(user.email)),
    );
    if (index < 0) throw new ApiError('NOT_FOUND', "We couldn't find that booking.");
    const booking = bookings[index]!;
    if (booking.status === 'cancelled') throw new ApiError('CONFLICT', 'This booking is already cancelled.');
    const session = loadSessions().find((candidate) => candidate.id === booking.sessionId);
    if (!session || !canCancelBooking(session, new Date())) {
      throw new ApiError('CONFLICT', `Bookings can only be cancelled up to ${CANCEL_CUTOFF_HOURS} hours before the workshop. Contact us instead.`);
    }
    const at = new Date().toISOString();
    const updated: WorkshopBooking = { ...booking, status: 'cancelled', cancelledAt: at };
    bookings[index] = updated;
    saveBookings(bookings);
    sendEmails([
      {
        to: booking.email,
        subject: `Booking cancelled [${booking.id}]`,
        body: `Your booking for ${booking.places} ${booking.places === 1 ? 'place' : 'places'} has been cancelled. Nothing to pay. We hope to see you at another workshop.`,
        sentAt: at,
      },
    ]);
    return updated;
  }, options);
}
