import { useSearchParams } from 'react-router';
import { Newspaper } from 'lucide-react';
import { HeadingIcon, ToggleChip } from '@/components/ui';
import { JOURNAL } from '@/data/journal';
import { journalTags, sortArticles, tagLabel } from '@/domain/stories';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArticleCard } from './StoriesParts';
import styles from './Stories.module.css';

const ARTICLES = sortArticles(JOURNAL);
const TAGS = journalTags(JOURNAL);

/** The journal: the newest story up top, the rest in a grid, filterable by tag. */
export function JournalPage() {
  usePageTitle('Journal');
  const [params, setParams] = useSearchParams();
  const requested = params.get('tag');
  const tag = TAGS.some((option) => option.tag === requested) ? requested : null;
  const shown = tag ? ARTICLES.filter((article) => article.tags.includes(tag)) : ARTICLES;
  const [feature, ...rest] = shown;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Journal</p>
        <h1 className={styles.title}>
          <HeadingIcon icon={Newspaper} badge />
          Stories from the studio
        </h1>
        <p className={styles.lede}>Visits to our makers, notes on caring for what you buy, and the occasional slow morning.</p>
      </header>

      <div className={styles.chips} role="group" aria-label="Filter by topic">
        <ToggleChip selected={tag === null} onToggle={() => setParams({}, { replace: true })}>
          All
        </ToggleChip>
        {TAGS.map((option) => (
          <ToggleChip
            key={option.tag}
            selected={tag === option.tag}
            accessibleLabel={`${tagLabel(option.tag)}, ${option.count} ${option.count === 1 ? 'story' : 'stories'}`}
            onToggle={() => setParams(tag === option.tag ? {} : { tag: option.tag }, { replace: true })}
          >
            {tagLabel(option.tag)}
          </ToggleChip>
        ))}
      </div>

      <section aria-label={tag ? `Stories about ${tagLabel(tag).toLowerCase()}` : 'All stories'} className={styles.stories}>
        {feature && <ArticleCard article={feature} feature level={2} />}
        {rest.length > 0 && (
          <div className={styles.grid}>
            {rest.map((article) => (
              <ArticleCard key={article.slug} article={article} level={2} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
