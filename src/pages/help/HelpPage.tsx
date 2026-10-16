import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, LifeBuoy, Search, SearchX } from 'lucide-react';
import { HeadingIcon, TextField } from '@/components/ui';
import { HELP_TOPICS } from '@/data/helpArticles';
import { helpPath, popularQuestions, searchHelp } from '@/domain/help';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ContactPrompt, topicIcon } from './HelpParts';
import styles from './Help.module.css';

/** The help centre's front page: a search over every answer, the topics, and the commonest questions. */
export function HelpPage() {
  usePageTitle('Help centre');
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const settled = useDebouncedValue(query, 150);
  const results = useMemo(() => searchHelp(HELP_TOPICS, settled), [settled]);
  const searching = settled.trim().length > 0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Help centre</p>
        <h1 className={styles.title}>
          <HeadingIcon icon={LifeBuoy} badge />
          How can we help?
        </h1>
        <form role="search" aria-label="Search help" className={styles.search} onSubmit={(event) => event.preventDefault()}>
          <TextField
            label="Search help"
            hideLabel
            type="search"
            placeholder="Try “refund”, “linen” or “late parcel”"
            leading={<Search />}
            value={query}
            // The query lives in the address, so a search can be shared or come back to.
            onChange={(event) => setParams(event.target.value ? { q: event.target.value } : {}, { replace: true })}
          />
        </form>
      </header>

      {searching ? (
        <section aria-labelledby="help-results-title" className={styles.results}>
          <h2 id="help-results-title" className={styles.sectionTitle}>
            {results.length === 0 ? 'No answers found' : `${results.length} ${results.length === 1 ? 'answer' : 'answers'} for “${settled.trim()}”`}
          </h2>
          {results.length === 0 ? (
            <div className={styles.noResults}>
              <SearchX aria-hidden="true" />
              <p>
                Nothing in the help centre matches “{settled.trim()}”. Try different words, browse the topics below, or{' '}
                <Link to="/help/contact">ask the studio</Link>.
              </p>
            </div>
          ) : (
            <ul className={styles.resultList}>
              {results.map(({ topic, article }) => (
                <li key={article.id}>
                  <Link to={helpPath(topic.slug, article.id)} className={styles.result}>
                    <span className={styles.resultQuestion}>{article.question}</span>
                    <span className={styles.resultTopic}>{topic.title}</span>
                    <span className={styles.muted}>{article.answer[0]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="help-topics-title" className={styles.block}>
        <h2 id="help-topics-title" className={styles.sectionTitle}>
          Browse by topic
        </h2>
        <ul className={styles.topics}>
          {HELP_TOPICS.map((topic) => {
            const Icon = topicIcon(topic.slug);
            return (
              <li key={topic.slug}>
                <Link to={helpPath(topic.slug)} className={styles.topicCard}>
                  <span className={styles.topicIcon} aria-hidden="true">
                    <Icon />
                  </span>
                  <span className={styles.topicTitle}>{topic.title}</span>
                  <span className={styles.muted}>{topic.summary}</span>
                  <span className={styles.topicCount}>
                    {topic.articles.length} answers <ArrowRight aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className={styles.split}>
        <section aria-labelledby="help-popular-title" className={styles.block}>
          <h2 id="help-popular-title" className={styles.sectionTitle}>
            Common questions
          </h2>
          <ul className={styles.questionList}>
            {popularQuestions(HELP_TOPICS).map(({ topic, article }) => (
              <li key={article.id}>
                <Link to={helpPath(topic.slug, article.id)}>{article.question}</Link>
              </li>
            ))}
          </ul>
        </section>
        <ContactPrompt />
      </div>
    </div>
  );
}
