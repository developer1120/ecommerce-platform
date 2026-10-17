import { Link } from 'react-router';
import { ArrowRight, Clock, MapPin } from 'lucide-react';
import { ProductArt } from '@/components/product/ProductArt';
import { formatJournalDate, readingMinutes, tagLabel, type JournalArticle, type Maker } from '@/domain/stories';
import { cx } from '@/lib/cx';
import styles from './Stories.module.css';

export const articlePath = (slug: string) => `/journal/${slug}`;
export const makerPath = (slug: string) => `/about/makers/${slug}`;

interface ArticleCardProps {
  article: JournalArticle;
  /** Puts the art beside the text, for the lead story. */
  feature?: boolean;
  /** The card title's heading level, one below the section it sits in. */
  level?: 2 | 3;
}

/** A journal article as a card. */
export function ArticleCard({ article, feature = false, level = 3 }: ArticleCardProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <article className={cx(styles.articleCard, feature && styles.featureCard)} aria-labelledby={`article-${article.slug}`}>
      <ProductArt art={article.art} lazy className={styles.cardArt} />
      <div className={styles.cardText}>
        <p className={styles.kicker}>{article.tags.map(tagLabel).join(' · ')}</p>
        <Heading id={`article-${article.slug}`} className={styles.cardTitle}>
          <Link to={articlePath(article.slug)} className={styles.cardLink}>
            {article.title}
          </Link>
        </Heading>
        <p className={styles.dek}>{article.dek}</p>
        <p className={styles.byline}>
          {article.author} · <time dateTime={article.publishedAt}>{formatJournalDate(article.publishedAt)}</time> ·{' '}
          <span className={styles.readTime}>
            <Clock aria-hidden="true" />
            {readingMinutes(article)} min read
          </span>
        </p>
      </div>
    </article>
  );
}

/** A maker as a card, with how many of their pieces are in the shop. */
export function MakerCard({ maker, productCount, level = 3 }: { maker: Maker; productCount: number; level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <article className={styles.makerCard} aria-labelledby={`maker-${maker.slug}`}>
      <ProductArt art={maker.art} lazy className={styles.cardArt} />
      <div className={styles.cardText}>
        <p className={styles.kicker}>{maker.craft}</p>
        <Heading id={`maker-${maker.slug}`} className={styles.cardTitle}>
          <Link to={makerPath(maker.slug)} className={styles.cardLink}>
            {maker.name}
          </Link>
        </Heading>
        <p className={styles.dek}>{maker.intro}</p>
        <p className={styles.byline}>
          <MapPin aria-hidden="true" className={styles.inlineIcon} />
          {maker.place} · {productCount} {productCount === 1 ? 'piece' : 'pieces'} in the shop
        </p>
      </div>
    </article>
  );
}

export function MoreLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className={styles.more}>
      {children}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}
