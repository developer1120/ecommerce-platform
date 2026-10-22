import { validateEmail, validateName } from './auth';
import { multiplyCents, type Cents } from './money';
import type { ProductArt } from './product';

/*
 * Workshops in the Brooklyn studio, taught by our makers. Each workshop runs
 * as several dated sessions with a fixed number of places; shoppers book
 * places on a session and can cancel up to two days before it starts.
 */

export interface Workshop {
  slug: string;
  title: string;
  /** The maker who teaches it; matches a maker's slug. */
  maker: string;
  summary: string;
  description: string[];
  /** What's included, such as materials or a piece to take home. */
  includes: string[];
  durationMinutes: number;
  /** Per place. */
  price: Cents;
  /** Places per session. */
  capacity: number;
  art: ProductArt;
}

export type SessionStatus = 'scheduled' | 'cancelled';

export interface WorkshopSession {
  id: string;
  workshop: string;
  startsAt: string;
  status: SessionStatus;
  /** Shown to anyone who booked, when the studio cancels. */
  cancelReason?: string;
}

export type BookingStatus = 'booked' | 'cancelled';

export interface WorkshopBooking {
  /** "WB-" and six characters, the reference in emails. */
  id: string;
  sessionId: string;
  workshop: string;
  name: string;
  email: string;
  customerId?: string;
  places: number;
  total: Cents;
  createdAt: string;
  status: BookingStatus;
  /** Set when the shopper, or a cancelled session, cancelled it. */
  cancelledAt?: string;
  /** Ticked off at the door by the studio. */
  checkedIn?: boolean;
}

export const STUDIO_ADDRESS = 'Tanelt studio, 41 Water Street, Brooklyn';
export const STUDIO_TIME_ZONE = 'America/New_York';
/** The most places one booking can hold. */
export const MAX_PLACES = 4;
/** Shoppers can cancel up to this long before a session starts. */
export const CANCEL_CUTOFF_HOURS = 48;
const HOUR = 60 * 60 * 1000;

export const workshopPath = (slug: string) => `/workshops/${slug}`;

/** Places taken on a session by bookings that still stand. */
export function placesTaken(sessionId: string, bookings: Pick<WorkshopBooking, 'sessionId' | 'status' | 'places'>[]): number {
  return bookings.filter((booking) => booking.sessionId === sessionId && booking.status === 'booked').reduce((sum, booking) => sum + booking.places, 0);
}

export function placesLeft(session: Pick<WorkshopSession, 'id'>, workshop: Pick<Workshop, 'capacity'>, bookings: WorkshopBooking[]): number {
  return Math.max(0, workshop.capacity - placesTaken(session.id, bookings));
}

export function isUpcoming(session: Pick<WorkshopSession, 'startsAt'>, now: Date): boolean {
  return new Date(session.startsAt).getTime() > now.getTime();
}

/** Sessions still to come and not cancelled, soonest first. */
export function upcomingSessions<T extends Pick<WorkshopSession, 'startsAt' | 'status'>>(sessions: T[], now: Date): T[] {
  return sessions.filter((session) => session.status === 'scheduled' && isUpcoming(session, now)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Whether a shopper can still cancel a booking themselves. */
export function canCancelBooking(session: Pick<WorkshopSession, 'startsAt'>, now: Date): boolean {
  return new Date(session.startsAt).getTime() - now.getTime() >= CANCEL_CUTOFF_HOURS * HOUR;
}

/** "Only 2 places left", "Sold out", or nothing worth saying. */
export function availabilityLabel(left: number): string | undefined {
  if (left === 0) return 'Sold out';
  if (left <= 3) return `Only ${left} ${left === 1 ? 'place' : 'places'} left`;
  return undefined;
}

export const bookingTotal = (workshop: Pick<Workshop, 'price'>, places: number): Cents => multiplyCents(workshop.price, places);

export interface BookingForm {
  sessionId: string;
  name: string;
  email: string;
  places: number;
}

export type BookingErrors = Partial<Record<keyof BookingForm, string>>;

export function validateBooking(form: BookingForm, left: number): BookingErrors {
  const errors: BookingErrors = {};
  if (!form.sessionId) errors.sessionId = 'Choose a date';
  const name = validateName(form.name);
  if (name) errors.name = name;
  const email = validateEmail(form.email);
  if (email) errors.email = email;
  if (!Number.isInteger(form.places) || form.places < 1) errors.places = 'Book at least one place';
  else if (form.places > MAX_PLACES) errors.places = `Book up to ${MAX_PLACES} places at a time`;
  else if (form.sessionId && form.places > left) {
    errors.places = left === 0 ? 'This date is sold out' : `Only ${left} ${left === 1 ? 'place is' : 'places are'} left on this date`;
  }
  return errors;
}

const SESSION_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: STUDIO_TIME_ZONE });
const SESSION_TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: STUDIO_TIME_ZONE });

/** "Thu, Nov 12", in the studio's time zone. */
export const formatSessionDate = (iso: string) => SESSION_DATE.format(new Date(iso));

