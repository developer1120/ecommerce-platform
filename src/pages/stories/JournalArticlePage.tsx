import { Link, useParams } from 'react-router';
import { ArrowLeft, ArrowRight, Clock, Quote } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { ProductArt } from '@/components/product/ProductArt';
import { ProductGrid } from '@/components/product/ProductGrid';
import { JOURNAL } from '@/data/journal';
import { MAKERS } from '@/data/makers';
import {
  adjacentArticles,
  findMaker,
  formatJournalDate,
  productsForBlock,
  readingMinutes,
  relatedArticles,
  tagLabel,
  type JournalArticle,
  type JournalBlock,
} from '@/domain/stories';
import type { Product } from '@/domain/product';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ArticleCard, articlePath, makerPath } from './StoriesParts';
import styles from './Stories.module.css';

export function JournalArticlePage() {
  const { slug } = useParams();
  const article = JOURNAL.find((candidate) => candidate.slug === slug);
  usePageTitle(article ? `${article.title} · Journal` : 'Page not found');
  if (!article) return <NotFoundPage />;
  return <Article key={article.slug} article={article} />;
}

function Article({ article }: { article: JournalArticle }) {
  // The live catalog, so products taken off sale since publishing drop out of the article.
  const products = useAsync((signal) => listProducts({}, { signal }), []);
  const maker = findMaker(MAKERS, article.maker);
  const { newer, older } = adjacentArticles(article, JOURNAL);
  const related = relatedArticles(article, JOURNAL);
  const headingId = `journal-${article.slug}`;

  return (
    <div className={styles.page}>
      <Breadcrumbs trail={[{ label: 'Journal', to: '/journal' }, { label: article.title }]} />
      <article className={styles.article} aria-labelledby={headingId}>
        <header className={styles.articleHeader}>
          <p className={styles.kicker}>
            {article.tags.map((tag, index) => (
              <span key={tag}>
                {index > 0 && ' · '}
                <Link to={`/journal?tag=${tag}`}>{tagLabel(tag)}</Link>
              </span>
            ))}
          </p>
          <h1 id={headingId} className={styles.title}>
            {article.title}
          </h1>
          <p className={styles.lede}>{article.dek}</p>
          <p className={styles.byline}>
            By {article.author} · <time dateTime={article.publishedAt}>{formatJournalDate(article.publishedAt)}</time> ·{' '}
            <span className={styles.readTime}>
              <Clock aria-hidden="true" />
              {readingMinutes(article)} min read
            </span>
          </p>
        </header>
        <ProductArt art={article.art} zoom={1.4} className={styles.articleArt} />

        <div className={styles.articleBody}>
          {article.body.map((block, index) => (
            <Block key={index} block={block} products={products.data} />
          ))}
        </div>

        {maker && (
          <aside className={styles.makerNote} aria-labelledby="article-maker-title">
            <h2 id="article-maker-title" className={styles.smallTitle}>
              About {maker.name}
            </h2>
            <p>{maker.intro}</p>
            <Link to={makerPath(maker.slug)} className={styles.more}>
              Meet {maker.name} <ArrowRight aria-hidden="true" />
            </Link>
          </aside>
        )}
      </article>

      <nav aria-label="More stories" className={styles.pager}>
        {newer ? (
          <Link to={articlePath(newer.slug)} className={styles.pagerLink}>
            <ArrowLeft aria-hidden="true" />
            <span>
              <span className={styles.kicker}>Newer</span>
              {newer.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {older && (
          <Link to={articlePath(older.slug)} className={`${styles.pagerLink} ${styles.pagerOlder}`}>
            <span>
              <span className={styles.kicker}>Older</span>
              {older.title}
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        )}
      </nav>

      <section aria-labelledby="related-title" className={styles.block}>
        <h2 id="related-title" className={styles.sectionTitle}>
          Read next
        </h2>
        <div className={styles.grid}>
          {related.map((other) => (
            <ArticleCard key={other.slug} article={other} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Block({ block, products }: { block: JournalBlock; products: Product[] | undefined }) {
  switch (block.type) {
    case 'h':
      return <h2 className={styles.bodyHeading}>{block.text}</h2>;
    case 'quote':
      return (
        <figure className={styles.quote}>
          <Quote aria-hidden="true" className={styles.quoteMark} />
          <blockquote>
            <p>{block.text}</p>
          </blockquote>
          <figcaption>{block.cite}</figcaption>
        </figure>
      );
    case 'list':
      return (
        <ul className={styles.bodyList}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'products': {
      // Until the catalog loads, nothing; products no longer on sale are skipped.
      const shown = products ? productsForBlock(products, block.ids) : [];
      if (shown.length === 0) return null;
      return (
        <section className={styles.shopBlock} aria-label={block.caption}>
          <p className={styles.kicker}>{block.caption}</p>
          <ProductGrid products={shown} featureEvery={0} />
        </section>
      );
    }
    default:
      return <p>{block.text}</p>;
  }
}
