import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, LifeBuoy, MessagesSquare, Receipt, RefreshCw, Reply, UserRound } from 'lucide-react';
import { getSupportTicket, replyToTicket, setTicketStatus } from '@/api/adminSupportApi';
import { isApiError } from '@/api/client';
import { LoadError } from '@/components/feedback/LoadError';
import { OrderStatusBadge } from '@/components/order/OrderParts';
import { MessageThread, ReplyForm, TicketStatusBadge } from '@/components/support/SupportParts';
import { Button, HeadingIcon, Spinner } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import { customerPath, guestKey } from '@/domain/customers';
import { formatMoney } from '@/domain/money';
import { formatOrderDate } from '@/domain/order';
import { formatEventTime } from '@/domain/orderStatus';
import { fillReply, formatWait, hoursWaiting, SAVED_REPLIES, topicLabel, type SupportTicket } from '@/domain/support';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Admin.module.css';

export function AdminSupportTicketPage() {
  const { ticketId = '' } = useParams();
  usePageTitle(`Support ${ticketId} · Admin`);
  const { token } = useAuth();
  const { toast } = useToast();
  const result = useAsync((signal) => getSupportTicket(token!, ticketId, { signal }), [token, ticketId]);
  // The latest saved version, so a change shows at once without another fetch.
  const [saved, setSaved] = useState<SupportTicket | null>(null);
  const [draft, setDraft] = useState({ text: '', version: 0 });
  const [closeAfter, setCloseAfter] = useState(false);
  const [busy, setBusy] = useState(false);

  if (result.status === 'error') return <LoadError error={result.error} onRetry={result.reload} subject="this conversation" />;
  if (!result.data) return <Spinner label="Loading conversation" />;

  const { order, orderCount, others } = result.data;
  const ticket = saved ?? result.data.ticket;
  const waited = hoursWaiting(ticket, new Date());

  function reloadAfterConflict(message: string) {
    toast({ tone: 'error', title: 'New message from the shopper', description: `${message} We've loaded it; read it before replying.` });
    setSaved(null);
    result.reload();
  }

  async function reply(body: string) {
    try {
      const updated = await replyToTicket(token!, ticket.id, { body, close: closeAfter, seen: ticket.messages.length });
      setSaved(updated);
      setCloseAfter(false);
      toast({ title: closeAfter ? 'Reply sent and closed' : 'Reply sent', description: `We've emailed ${ticket.email}.` });
      return true;
    } catch (error) {
      if (isApiError(error) && error.code === 'CONFLICT') reloadAfterConflict(error.message);
      else toast({ tone: 'error', title: "Couldn't send the reply", description: isApiError(error) ? error.message : undefined });
      return false;
    }
  }

  async function changeStatus(to: 'open' | 'closed') {
    setBusy(true);
    try {
      setSaved(await setTicketStatus(token!, ticket.id, { to, seen: ticket.messages.length }));
      toast({ title: to === 'closed' ? 'Conversation closed' : 'Conversation reopened' });
    } catch (error) {
      if (isApiError(error) && error.code === 'CONFLICT') reloadAfterConflict(error.message);
      else toast({ tone: 'error', title: "Couldn't update the conversation", description: isApiError(error) ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={styles.section} aria-labelledby="ticket-title">
      <Link to="/admin/support" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> All messages
      </Link>
      <header className={styles.toolbar}>
        <div>
          <h2 id="ticket-title" className={styles.sectionTitle}>
            <HeadingIcon icon={LifeBuoy} />
            {ticket.subject}
          </h2>
          <p className={styles.muted}>
            {ticket.id} · {topicLabel(ticket.topic)} · opened {formatEventTime(ticket.createdAt)}
            {waited !== undefined && ` · waiting ${formatWait(waited).toLowerCase()}`}
          </p>
        </div>
        <TicketStatusBadge status={ticket.status} view="studio" />
      </header>

      <div className={styles.form}>
        <div className={styles.formMain}>
          <section className={styles.panel} aria-labelledby="ticket-thread-title">
            <h3 id="ticket-thread-title" className={styles.legend}>
              <HeadingIcon icon={MessagesSquare} />
              Conversation
            </h3>
            <MessageThread messages={ticket.messages} view="studio" labelledBy="ticket-thread-title" />
          </section>

          <section className={styles.panel} aria-labelledby="ticket-reply-title">
            <h3 id="ticket-reply-title" className={styles.legend}>
              <HeadingIcon icon={Reply} />
