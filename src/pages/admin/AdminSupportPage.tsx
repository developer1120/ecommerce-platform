import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LifeBuoy } from 'lucide-react';
import { listSupportTickets } from '@/api/adminSupportApi';
import { LoadError } from '@/components/feedback/LoadError';
import { TicketStatusBadge } from '@/components/support/SupportParts';
import { Badge, HeadingIcon, Spinner, TextField, ToggleChip } from '@/components/ui';
import { formatEventTime } from '@/domain/orderStatus';
import { fold } from '@/domain/search';
import {
  excerpt,
  formatWait,
  hoursWaiting,
  inSupportQueue,
  isOverdue,
  isSupportQueue,
  lastMessage,
  sortTickets,
  SUPPORT_QUEUES,
  topicLabel,
  type SupportQueue,
} from '@/domain/support';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import styles from './Admin.module.css';

const EMPTY: Record<SupportQueue, string> = {
  open: 'Inbox zero. Every message has a reply.',
  waiting: 'Nobody owes the studio a reply.',
  closed: 'No closed conversations yet.',
  all: "No messages yet. They'll appear here when shoppers use the contact form.",
};

/** Messages from shoppers, the ones waiting longest for a reply first. */
export function AdminSupportPage() {
  usePageTitle('Support · Admin');
  const { token } = useAuth();
  const tickets = useAsync((signal) => listSupportTickets(token!, { signal }), [token]);
  const [params, setParams] = useSearchParams();
  const requested = params.get('queue');
  const queue: SupportQueue = isSupportQueue(requested) ? requested : 'open';
  const [query, setQuery] = useState('');
  const now = new Date();

  const counts = useMemo(
    () => new Map(SUPPORT_QUEUES.map((option) => [option.value, (tickets.data ?? []).filter((ticket) => inSupportQueue(ticket, option.value)).length])),
    [tickets.data],
  );
  const shown = useMemo(() => {
    const words = fold(query.trim());
    const matching = (tickets.data ?? []).filter(
      (ticket) =>
        inSupportQueue(ticket, queue) &&
        (!words || fold(`${ticket.id} ${ticket.subject} ${ticket.name} ${ticket.email} ${ticket.orderId ?? ''}`).includes(words)),
    );
    return sortTickets(matching, new Date());
  }, [tickets.data, queue, query]);

  if (tickets.status === 'error') return <LoadError error={tickets.error} onRetry={tickets.reload} subject="messages" />;
  if (!tickets.data) return <Spinner label="Loading messages" />;

  return (
    <section className={styles.section} aria-labelledby="admin-support-title">
      <div className={styles.toolbar}>
        <h2 id="admin-support-title" className={styles.sectionTitle}>
          <HeadingIcon icon={LifeBuoy} />
          Support
        </h2>
      </div>
      <div className={styles.filters}>
        <TextField
          label="Search messages"
          hideLabel
          placeholder="Search by reference, subject, name, email or order"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={styles.search}
        />
        <div className={styles.chips} role="group" aria-label="Show">
          {SUPPORT_QUEUES.map((option) => {
            const count = counts.get(option.value) ?? 0;
            return (
              <ToggleChip
                key={option.value}
                selected={queue === option.value}
                accessibleLabel={`${option.label}, ${count} ${count === 1 ? 'conversation' : 'conversations'}`}
                onToggle={() => setParams(option.value === 'open' ? {} : { queue: option.value }, { replace: true })}
              >
                {option.label} <span className={styles.count}>{count}</span>
              </ToggleChip>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>{query.trim() ? `No messages match "${query.trim()}".` : EMPTY[queue]}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Conversation</th>
                <th scope="col">From</th>
                <th scope="col">Latest</th>
                <th scope="col">Waiting</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((ticket) => {
                const last = lastMessage(ticket);
                const waited = hoursWaiting(ticket, now);
                return (
                  <tr key={ticket.id}>
                    <th scope="row">
                      <Link to={`/admin/support/${ticket.id}`} className={styles.productName}>
                        {ticket.subject}
                      </Link>
                      <span className={styles.muted}>
                        {ticket.id} · {topicLabel(ticket.topic)}
                      </span>
                    </th>
                    <td>
                      <span className={styles.productName}>{ticket.name}</span>
                      <span className={styles.muted}>{ticket.email}</span>
                    </td>
                    <td>
                      <span className={styles.muted}>
                        {last.from === 'studio' ? `${last.author}: ` : ''}
                        {excerpt(last.body, 80)}
                      </span>
                      <span className={styles.muted}>{formatEventTime(last.at)}</span>
                    </td>
                    <td className={styles.nowrap}>
                      {waited === undefined ? (
                        <span className={styles.muted}>—</span>
                      ) : isOverdue(ticket, now) ? (
                        <Badge tone="sale">{formatWait(waited)}</Badge>
                      ) : (
                        formatWait(waited)
                      )}
                    </td>
                    <td>
                      <TicketStatusBadge status={ticket.status} view="studio" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
