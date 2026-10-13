import { Link } from 'react-router';
import { MessagesSquare, PenLine } from 'lucide-react';
import { listMyTickets } from '@/api/supportApi';
import { LoadError } from '@/components/feedback/LoadError';
import { TicketStatusBadge } from '@/components/support/SupportParts';
import { HeadingIcon, Spinner } from '@/components/ui';
import { formatEventTime } from '@/domain/orderStatus';
import { excerpt, lastMessage, topicLabel } from '@/domain/support';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import styles from './Messages.module.css';

/** The shopper's conversations with the studio, most recently active first. */
export function MessagesPage() {
  usePageTitle('Your messages');
  const { token } = useAuth();
  const tickets = useAsync((signal) => listMyTickets(token!, { signal }), [token]);

  if (tickets.status === 'error') return <LoadError error={tickets.error} onRetry={tickets.reload} subject="your messages" />;
  if (!tickets.data) return <Spinner label="Loading your messages" />;

  return (
    <section className={styles.section} aria-labelledby="messages-title">
      <div className={styles.titleRow}>
        <h2 id="messages-title" className={styles.title}>
          <HeadingIcon icon={MessagesSquare} />
          Messages
        </h2>
        <Link to="/help/contact" className={styles.newLink}>
          <PenLine aria-hidden="true" /> New message
        </Link>
      </div>

      {tickets.data.length === 0 ? (
        <div className={styles.empty}>
          <MessagesSquare className={styles.emptyIcon} aria-hidden="true" />
          <p>
            No messages yet. Questions about an order, a return or a product? <Link to="/help">The help centre</Link> may already have
            the answer, or <Link to="/help/contact">write to the studio</Link>.
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {tickets.data.map((ticket) => {
            const last = lastMessage(ticket);
            return (
              <li key={ticket.id}>
                <Link to={`/account/messages/${ticket.id}`} className={styles.card} aria-label={`${ticket.subject}, ${ticket.id}`}>
                  <span className={styles.cardTop}>
                    <span className={styles.subject}>{ticket.subject}</span>
                    <TicketStatusBadge status={ticket.status} />
                  </span>
                  <span className={styles.meta}>
                    {ticket.id} · {topicLabel(ticket.topic)} · {ticket.messages.length}{' '}
                    {ticket.messages.length === 1 ? 'message' : 'messages'}
                  </span>
                  <span className={styles.preview}>
                    <strong>{last.from === 'studio' ? 'Studio' : 'You'}:</strong> {excerpt(last.body)}
                  </span>
                  <span className={styles.meta}>Last activity {formatEventTime(ticket.updatedAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
