import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { HeadingIcon } from '@/components/ui';
import { HELP_TOPICS } from '@/data/helpArticles';
import { findHelpTopic, HELP_VOTES_KEY, helpPath, isHelpVotes, type HelpArticle, type HelpVote } from '@/domain/help';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cx } from '@/lib/cx';
import { readJson, writeJson } from '@/lib/storage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ContactPrompt, topicIcon } from './HelpParts';
import styles from './Help.module.css';

/** One topic's questions as a list that opens one answer at a time, or several. Links can open one with #id. */
export function HelpTopicPage() {
  const { topic: slug } = useParams();
  const topic = findHelpTopic(HELP_TOPICS, slug);
  usePageTitle(topic ? `${topic.title} · Help` : 'Page not found');
  if (!topic) return <NotFoundPage />;
  // Keyed so a new topic starts with its own answers closed.
  return <Topic key={topic.slug} slug={topic.slug} />;
}

function Topic({ slug }: { slug: string }) {
  const topic = findHelpTopic(HELP_TOPICS, slug)!;
  const { hash } = useLocation();
  const linked = decodeURIComponent(hash.slice(1));
  const [open, setOpen] = useState<Set<string>>(() => new Set(topic.articles.some((article) => article.id === linked) ? [linked] : []));
  const [votes, setVotes] = useState(() => readJson(HELP_VOTES_KEY, {}, isHelpVotes));
  const Icon = topicIcon(topic.slug);

  // Following a link to an answer on this page opens it and brings it into view.
  useEffect(() => {
    if (!topic.articles.some((article) => article.id === linked)) return;
    setOpen((current) => (current.has(linked) ? current : new Set(current).add(linked)));
    document.getElementById(linked)?.scrollIntoView?.({ block: 'start' });
  }, [linked, topic.articles]);

  function toggle(id: string, isOpen: boolean) {
    setOpen((current) => {
      if (current.has(id) === isOpen) return current;
      const next = new Set(current);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function vote(id: string, value: HelpVote) {
    const next = { ...votes, [id]: value };
    setVotes(next);
    writeJson(HELP_VOTES_KEY, next);
  }

  return (
    <div className={styles.page}>
      <Breadcrumbs trail={[{ label: 'Help centre', to: '/help' }, { label: topic.title }]} />
      <div className={styles.topicLayout}>
        <section aria-labelledby="help-topic-title" className={styles.block}>
          <header className={styles.topicHeader}>
            <h1 id="help-topic-title" className={styles.title}>
              <HeadingIcon icon={Icon} badge />
              {topic.title}
            </h1>
            <p className={styles.lede}>{topic.summary}</p>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setOpen(open.size === topic.articles.length ? new Set() : new Set(topic.articles.map((article) => article.id)))}
            >
              {open.size === topic.articles.length ? 'Close all answers' : 'Open all answers'}
            </button>
          </header>
          <div className={styles.answers}>
            {topic.articles.map((article) => (
              <Answer
                key={article.id}
                article={article}
                open={open.has(article.id)}
                onToggle={(isOpen) => toggle(article.id, isOpen)}
                vote={votes[article.id]}
                onVote={(value) => vote(article.id, value)}
                topicSlug={topic.slug}
              />
            ))}
          </div>
        </section>

        <aside className={styles.aside}>
          <nav aria-label="Help topics" className={styles.topicNav}>
            <p className={styles.navTitle}>Topics</p>
            <ul>
              {HELP_TOPICS.map((other) => {
                const OtherIcon = topicIcon(other.slug);
                return (
                  <li key={other.slug}>
                    <NavLink to={helpPath(other.slug)} className={({ isActive }) => cx(styles.navLink, isActive && styles.navActive)}>
                      <OtherIcon aria-hidden="true" />
                      {other.title}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
          <ContactPrompt topic={CONTACT_TOPIC[topic.slug]} />
        </aside>
      </div>
    </div>
  );
}

/** The contact form topic that fits each help topic, so "Contact us" arrives pre-filled. */
const CONTACT_TOPIC: Record<string, string> = { shipping: 'order', orders: 'order', returns: 'return', care: 'product' };

interface AnswerProps {
  article: HelpArticle;
  open: boolean;
  onToggle: (open: boolean) => void;
  vote: HelpVote | undefined;
  onVote: (vote: HelpVote) => void;
  topicSlug: string;
}

function Answer({ article, open, onToggle, vote, onVote, topicSlug }: AnswerProps) {
  return (
    <details id={article.id} className={styles.answer} open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
      <summary className={styles.question}>{article.question}</summary>
      <div className={styles.answerBody}>
        {article.answer.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <div className={styles.feedback} role="group" aria-label={`Was the answer to “${article.question}” helpful?`}>
          {vote ? (
            <p className={styles.muted} role="status">
              {vote === 'yes' ? (
                'Thanks for letting us know.'
              ) : (
                <>
                  Sorry it didn't help. <Link to={`/help/contact?topic=${CONTACT_TOPIC[topicSlug] ?? 'other'}`}>Ask the studio</Link> and
                  we'll answer you directly.
                </>
              )}
            </p>
          ) : (
            <>
              <span className={styles.muted}>Was this helpful?</span>
              <button type="button" className={styles.voteButton} onClick={() => onVote('yes')}>
                <ThumbsUp aria-hidden="true" /> Yes
              </button>
              <button type="button" className={styles.voteButton} onClick={() => onVote('no')}>
                <ThumbsDown aria-hidden="true" /> No
              </button>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
