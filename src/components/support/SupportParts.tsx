import { useState, type FormEvent, type ReactNode } from 'react';
import { Send } from 'lucide-react';
import { Badge, Button, TextAreaField, type BadgeTone } from '@/components/ui';
import { formatEventTime } from '@/domain/orderStatus';
import {
  ADMIN_TICKET_STATUS_LABELS,
  REPLY_MAX,
  TICKET_STATUS_LABELS,
  validateReply,
  type TicketMessage,
  type TicketStatus,
} from '@/domain/support';
import { cx } from '@/lib/cx';
import styles from './Support.module.css';

const SHOPPER_TONES: Record<TicketStatus, BadgeTone> = { open: 'neutral', waiting: 'accent', closed: 'success' };
const STUDIO_TONES: Record<TicketStatus, BadgeTone> = { open: 'warning', waiting: 'neutral', closed: 'success' };

/** The status in the words of whoever is looking: "Replied" for the shopper is "Waiting on shopper" for the studio. */
export function TicketStatusBadge({ status, view = 'shopper' }: { status: TicketStatus; view?: 'shopper' | 'studio' }) {
  return view === 'studio' ? (
    <Badge tone={STUDIO_TONES[status]}>{ADMIN_TICKET_STATUS_LABELS[status]}</Badge>
  ) : (
    <Badge tone={SHOPPER_TONES[status]}>{TICKET_STATUS_LABELS[status]}</Badge>
  );
}

interface MessageThreadProps {
  messages: TicketMessage[];
  /** Whose side of the conversation is "you", for the labels. */
  view: 'shopper' | 'studio';
  labelledBy: string;
}

/** A conversation, oldest first, with the reader's own messages set apart. */
export function MessageThread({ messages, view, labelledBy }: MessageThreadProps) {
  return (
    <ol className={styles.thread} aria-labelledby={labelledBy}>
      {messages.map((message) => {
        const own = message.from === (view === 'shopper' ? 'shopper' : 'studio');
        return (
          <li key={message.id} className={cx(styles.message, own && styles.own, message.from === 'studio' && styles.studio)}>
            <article aria-label={`${message.from === 'studio' ? 'Reply' : 'Message'} from ${message.author}`}>
              <header className={styles.messageHeader}>
                <span className={styles.author}>
                  {message.author}
                  {message.from === 'studio' && <span className={styles.role}>Tanelt studio</span>}
                </span>
                <time dateTime={message.at} className={styles.time}>
                  {formatEventTime(message.at)}
                </time>
              </header>
              <p className={styles.body}>{message.body}</p>
            </article>
          </li>
        );
      })}
    </ol>
  );
}

interface ReplyFormProps {
  label: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<boolean>;
  /** Text to start from, such as a saved reply. A new value replaces the draft. */
  draft?: { text: string; version: number };
  hint?: ReactNode;
  /** Extra controls between the box and the button, such as "close after sending". */
  children?: ReactNode;
}

/** A reply box that checks the text, sends it, and clears itself once sent. */
export function ReplyForm({ label, submitLabel, onSubmit, draft, hint, children }: ReplyFormProps) {
  const [body, setBody] = useState(draft?.text ?? '');
  const [version, setVersion] = useState(draft?.version ?? 0);
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  // A new draft from outside (a saved reply) replaces whatever was typed.
  if (draft && draft.version !== version) {
    setVersion(draft.version);
    setBody(draft.text);
    setError(undefined);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateReply(body);
    setError(problem);
    if (problem) return;
    setSending(true);
    const sent = await onSubmit(body);
    setSending(false);
    if (sent) setBody('');
  }

  return (
    <form className={styles.replyForm} onSubmit={handleSubmit} noValidate>
      <TextAreaField
        label={label}
        rows={5}
        maxLength={REPLY_MAX}
        value={body}
        error={error}
        hint={hint}
        onChange={(event) => {
          setBody(event.target.value);
          if (error) setError(undefined);
        }}
      />
      {children}
      <Button type="submit" loading={sending} leadingIcon={<Send />} className={styles.send}>
        {submitLabel}
      </Button>
    </form>
  );
}
