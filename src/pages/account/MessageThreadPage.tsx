import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, CircleCheck, MessagesSquare } from 'lucide-react';
import { isApiError } from '@/api/client';
import { closeMyTicket, getMyTicket, REPLY_WITHIN, replyAsShopper } from '@/api/supportApi';
import { LoadError } from '@/components/feedback/LoadError';
import { MessageThread, ReplyForm, TicketStatusBadge } from '@/components/support/SupportParts';
import { Button, HeadingIcon, Spinner } from '@/components/ui';
import { formatEventTime } from '@/domain/orderStatus';
import { topicLabel, type SupportTicket } from '@/domain/support';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Messages.module.css';

export function MessageThreadPage() {
  const { ticketId = '' } = useParams();
  const { token } = useAuth();
  const { toast } = useToast();
  const result = useAsync((signal) => getMyTicket(token!, ticketId, { signal }), [token, ticketId]);
  const [saved, setSaved] = useState<SupportTicket | null>(null);
  const [closing, setClosing] = useState(false);
  const ticket = saved ?? result.data;
  usePageTitle(ticket ? `${ticket.subject} · Messages` : 'Your messages');

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="this conversation" />;
  if (!ticket) return <Spinner label="Loading conversation" />;

  async function reply(body: string) {
    try {
      setSaved(await replyAsShopper(token!, ticket!.id, body));
      toast({ title: 'Reply sent', description: `We'll get back to you within ${REPLY_WITHIN}.` });
      return true;
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't send your reply", description: isApiError(error) ? error.message : undefined });
      return false;
    }
  }

  async function close() {
    setClosing(true);
    try {
      setSaved(await closeMyTicket(token!, ticket!.id));
      toast({ title: 'Marked as resolved', description: 'Glad we could help.' });
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't close the conversation", description: isApiError(error) ? error.message : undefined });
    } finally {
      setClosing(false);
    }
  }

  return (
    <article className={styles.section} aria-labelledby="thread-title">
      <Link to="/account/messages" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> All messages
      </Link>
      <header className={styles.threadHeader}>
        <div>
          <h2 id="thread-title" className={styles.title}>
            <HeadingIcon icon={MessagesSquare} />
            {ticket.subject}
          </h2>
          <p className={styles.meta}>
            {ticket.id} · {topicLabel(ticket.topic)} · started {formatEventTime(ticket.createdAt)}
            {ticket.orderId && (
              <>
                {' · '}
                <Link to={`/account/orders/${ticket.orderId}`}>Order {ticket.orderId}</Link>
              </>
            )}
          </p>
        </div>
        <TicketStatusBadge status={ticket.status} />
      </header>

      <h3 id="thread-messages" className="visually-hidden">
        Conversation
      </h3>
      <MessageThread messages={ticket.messages} view="shopper" labelledBy="thread-messages" />

      <section className={styles.replyPanel} aria-labelledby="reply-title">
        <h3 id="reply-title" className={styles.panelTitle}>
          {ticket.status === 'closed' ? 'Need something else?' : 'Reply'}
        </h3>
        {ticket.status === 'closed' && <p className={styles.meta}>This conversation is closed. Replying opens it again.</p>}
        <ReplyForm label="Your reply" submitLabel="Send reply" onSubmit={reply} />
        {ticket.status !== 'closed' && (
          <div className={styles.resolve}>
            <p className={styles.meta}>All sorted?</p>
            <Button variant="secondary" size="sm" loading={closing} leadingIcon={<CircleCheck />} onClick={() => void close()}>
              Mark as resolved
            </Button>
          </div>
        )}
      </section>
    </article>
  );
}
