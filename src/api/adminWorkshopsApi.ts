import { WORKSHOPS } from '@/data/workshops';
import {
  CANCEL_REASON_MAX,
  checkNewSession,
  formatSessionDate,
  formatSessionTime,
  placesTaken,
  type NewSession,
  type Workshop,
  type WorkshopBooking,
  type WorkshopSession,
} from '@/domain/workshops';
import { randomHex } from '@/lib/crypto';
import { requireAdmin } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { sendEmails } from './outbox';
import { findWorkshop, loadBookings, loadSessions, saveBookings, saveSessions } from './workshopsApi';

export interface ScheduledSession {
  session: WorkshopSession;
  workshop: Workshop;
  taken: number;
  bookings: number;
}

/** The whole schedule, past and future, in date order. Admins only. */
export function listSchedule(token: string, options?: RequestOptions): Promise<ScheduledSession[]> {
  return simulateRequest(() => {
    requireAdmin(token);
    const bookings = loadBookings();
    return loadSessions()
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((session) => ({
        session,
        workshop: findWorkshop(session.workshop)!,
        taken: placesTaken(session.id, bookings),
        bookings: bookings.filter((booking) => booking.sessionId === session.id && booking.status === 'booked').length,
      }));
  }, options);
}

export interface SessionDetail {
  session: WorkshopSession;
  workshop: Workshop;
  /** Everyone who booked, standing bookings first, then by name. */
  bookings: WorkshopBooking[];
}

const SESSION_NOT_FOUND = "We couldn't find that session.";

export function getSessionDetail(token: string, sessionId: string, options?: RequestOptions): Promise<SessionDetail> {
  return simulateRequest(() => {
    requireAdmin(token);
    const session = loadSessions().find((candidate) => candidate.id === sessionId);
    if (!session) throw new ApiError('NOT_FOUND', SESSION_NOT_FOUND);
    const bookings = loadBookings()
      .filter((booking) => booking.sessionId === sessionId)
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'booked' ? -1 : 1));
    return { session, workshop: findWorkshop(session.workshop)!, bookings };
  }, options);
}

/** Adds a session on the studio's clock, as long as the room is free. */
export function addSession(token: string, input: NewSession, options?: RequestOptions): Promise<WorkshopSession> {
  return simulateRequest(() => {
    requireAdmin(token);
    const sessions = loadSessions();
    const check = checkNewSession(input, WORKSHOPS, sessions, new Date());
    if (!check.ok) throw new ApiError(check.field === 'time' && check.error.startsWith('The studio') ? 'CONFLICT' : 'VALIDATION', check.error);
    const session: WorkshopSession = { id: `ws-${randomHex(4)}`, workshop: input.workshop, startsAt: check.startsAt, status: 'scheduled' };
    saveSessions([...sessions, session]);
    return session;
  }, options);
}

/** Cancels a session and every booking on it, emailing each person why. */
export function cancelSession(token: string, sessionId: string, reason: string, options?: RequestOptions): Promise<{ session: WorkshopSession; notified: number }> {
  return simulateRequest(() => {
    requireAdmin(token);
    const text = reason.trim();
    if (!text) throw new ApiError('VALIDATION', 'Tell the people booked why');
    if (text.length > CANCEL_REASON_MAX) throw new ApiError('VALIDATION', `Keep the reason under ${CANCEL_REASON_MAX} characters`);
    const sessions = loadSessions();
    const index = sessions.findIndex((candidate) => candidate.id === sessionId);
    if (index < 0) throw new ApiError('NOT_FOUND', SESSION_NOT_FOUND);
    const session = sessions[index]!;
    if (session.status === 'cancelled') throw new ApiError('CONFLICT', 'This session is already cancelled.');
    if (new Date(session.startsAt) <= new Date()) throw new ApiError('CONFLICT', 'This session has already started.');

    const at = new Date().toISOString();
    const updated: WorkshopSession = { ...session, status: 'cancelled', cancelReason: text };
    sessions[index] = updated;
    saveSessions(sessions);

    const workshop = findWorkshop(session.workshop)!;
    const bookings = loadBookings();
    const affected = bookings.filter((booking) => booking.sessionId === sessionId && booking.status === 'booked');
    saveBookings(bookings.map((booking) => (affected.includes(booking) ? { ...booking, status: 'cancelled', cancelledAt: at } : booking)));
    sendEmails(
      affected.map((booking) => ({
        to: booking.email,
        subject: `Cancelled: ${workshop.title} on ${formatSessionDate(session.startsAt)}`,
        body: `Hi ${booking.name.split(' ')[0]}, we're sorry: we've had to cancel ${workshop.title} on ${formatSessionDate(session.startsAt)}, ${formatSessionTime(session.startsAt, workshop.durationMinutes)}. ${text} Your booking ${booking.id} is cancelled and there's nothing to pay.`,
        sentAt: at,
      })),
    );
    return { session: updated, notified: affected.length };
  }, options);
}

/** Ticks someone off at the door, or un-ticks a mistake. */
export function setCheckedIn(token: string, bookingId: string, checkedIn: boolean, options?: RequestOptions): Promise<WorkshopBooking> {
  return simulateRequest(() => {
    requireAdmin(token);
    const bookings = loadBookings();
    const index = bookings.findIndex((booking) => booking.id === bookingId);
    if (index < 0) throw new ApiError('NOT_FOUND', "We couldn't find that booking.");
    if (bookings[index]!.status !== 'booked') throw new ApiError('CONFLICT', 'This booking was cancelled.');
    const updated = { ...bookings[index]!, checkedIn };
    bookings[index] = updated;
    saveBookings(bookings);
    return updated;
  }, options);
}
