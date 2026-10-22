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

/** "6:30 – 9:00 PM ET". */
export function formatSessionTime(iso: string, durationMinutes: number): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return `${SESSION_TIME.format(start)} – ${SESSION_TIME.format(end)} ET`;
}

/** "2½ hours", "3 hours", "90 minutes". */
export function formatDuration(minutes: number): string {
  if (minutes < 120 && minutes % 60 !== 0) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const half = minutes % 60 === 30 ? '½' : '';
  return `${hours}${half} hours`;
}

/** UTC timestamps as calendar files want them: 20261112T233000Z. */
function icsTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const icsText = (text: string) => text.replace(/\\/g, '\\\\').replace(/([;,])/g, '\\$1').replace(/\n/g, '\\n');

/** A calendar event for a booking, so shoppers can add it to their calendar. */
export function bookingCalendar(booking: Pick<WorkshopBooking, 'id' | 'places'>, workshop: Pick<Workshop, 'title' | 'durationMinutes'>, session: Pick<WorkshopSession, 'startsAt'>): string {
  const start = new Date(session.startsAt);
  const end = new Date(start.getTime() + workshop.durationMinutes * 60 * 1000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tanelt//Workshops//EN',
    'BEGIN:VEVENT',
    `UID:${booking.id}@tanelt.test`,
    `DTSTAMP:${icsTime(new Date())}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(`${workshop.title} at Tanelt`)}`,
    `LOCATION:${icsText(STUDIO_ADDRESS)}`,
    `DESCRIPTION:${icsText(`Booking ${booking.id}, ${booking.places} ${booking.places === 1 ? 'place' : 'places'}.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/* The studio's side: adding sessions in local time, and keeping the room free of clashes. */

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_INPUT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The studio clock's offset from UTC at an instant, in minutes (−300 for EST). */
function studioOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: STUDIO_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * A date and time on the studio's clock ("2026-11-12", "18:30") as a UTC
 * timestamp, allowing for daylight saving. Undefined if either is malformed.
 */
export function studioTimeToIso(date: string, time: string): string | undefined {
  if (!DATE_INPUT.test(date) || !TIME_INPUT.test(time)) return undefined;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(wall).getUTCDate() !== day) return undefined;
  // Guess with the offset at the wall time, then correct once for a change of offset in between.
  let instant = wall - studioOffsetMinutes(new Date(wall)) * 60_000;
  instant = wall - studioOffsetMinutes(new Date(instant)) * 60_000;
  return new Date(instant).toISOString();
}

export interface NewSession {
  workshop: string;
  date: string;
  time: string;
}

export type SessionCheck = { ok: true; startsAt: string } | { ok: false; field: keyof NewSession; error: string };

/** The studio has one room: a new session can't overlap another scheduled one. */
export function checkNewSession(
  input: NewSession,
  workshops: Pick<Workshop, 'slug' | 'title' | 'durationMinutes'>[],
  sessions: Pick<WorkshopSession, 'workshop' | 'startsAt' | 'status'>[],
  now: Date,
): SessionCheck {
  const workshop = workshops.find((candidate) => candidate.slug === input.workshop);
  if (!workshop) return { ok: false, field: 'workshop', error: 'Choose a workshop' };
  if (!DATE_INPUT.test(input.date)) return { ok: false, field: 'date', error: 'Choose a date' };
  if (!TIME_INPUT.test(input.time)) return { ok: false, field: 'time', error: 'Choose a start time' };
  const startsAt = studioTimeToIso(input.date, input.time);
  if (!startsAt) return { ok: false, field: 'date', error: 'Choose a real date' };
  if (new Date(startsAt) <= now) return { ok: false, field: 'date', error: 'Choose a date in the future' };

  const start = new Date(startsAt).getTime();
  const end = start + workshop.durationMinutes * 60_000;
  for (const session of sessions) {
    if (session.status !== 'scheduled') continue;
    const other = workshops.find((candidate) => candidate.slug === session.workshop);
    const otherStart = new Date(session.startsAt).getTime();
    const otherEnd = otherStart + (other?.durationMinutes ?? 0) * 60_000;
    if (start < otherEnd && otherStart < end) {
      return {
        ok: false,
        field: 'time',
        error: `The studio is booked for ${other?.title ?? 'another workshop'} then (${formatSessionTime(session.startsAt, other?.durationMinutes ?? 0)})`,
      };
    }
  }
  return { ok: true, startsAt };
}

export const CANCEL_REASON_MAX = 300;

/** How full a session is, for the admin's schedule. */
export function fillPercent(taken: number, capacity: number): number {
  return capacity > 0 ? Math.min(100, Math.round((taken / capacity) * 100)) : 0;
}
