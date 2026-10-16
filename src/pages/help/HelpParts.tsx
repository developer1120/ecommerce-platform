import { Link } from 'react-router';
import { CreditCard, LifeBuoy, MessageCircle, Package, Sparkles, Truck, Undo2, UserRound, type LucideIcon } from 'lucide-react';
import { REPLY_WITHIN } from '@/api/supportApi';
import { HeadingIcon } from '@/components/ui';
import styles from './Help.module.css';

const TOPIC_ICONS: Record<string, LucideIcon> = {
  shipping: Truck,
  returns: Undo2,
  orders: Package,
  payments: CreditCard,
  care: Sparkles,
  account: UserRound,
};

export const topicIcon = (slug: string): LucideIcon => TOPIC_ICONS[slug] ?? LifeBuoy;

/** The way out of the help centre when no answer fits: a message to the studio. */
export function ContactPrompt({ topic }: { topic?: string }) {
  return (
    <section className={styles.prompt} aria-labelledby="contact-prompt-title">
      <h2 id="contact-prompt-title" className={styles.promptTitle}>
        <HeadingIcon icon={MessageCircle} />
        Still need help?
      </h2>
      <p className={styles.muted}>Send the studio a message. We reply within {REPLY_WITHIN}, Monday to Friday.</p>
      <Link to={topic ? `/help/contact?topic=${topic}` : '/help/contact'} className={styles.promptLink}>
        Contact us
      </Link>
    </section>
  );
}
