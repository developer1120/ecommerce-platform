import { useParams } from 'react-router';
import { CalendarDays, MapPin } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { ProductArt } from '@/components/product/ProductArt';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/ProductGrid';
import { JOURNAL } from '@/data/journal';
import { MAKERS } from '@/data/makers';
import { findMaker, productsByMaker, sortArticles, type Maker } from '@/domain/stories';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ArticleCard } from './StoriesParts';
import styles from './Stories.module.css';

export function MakerPage() {
  const { slug } = useParams();
  const maker = findMaker(MAKERS, slug);
  usePageTitle(maker ? `${maker.name} · Makers` : 'Page not found');
  if (!maker) return <NotFoundPage />;
  return <MakerProfile key={maker.slug} maker={maker} />;
}

function MakerProfile({ maker }: { maker: Maker }) {
  const products = useAsync((signal) => listProducts({}, { signal }), []);
  const own = productsByMaker(products.data ?? [], maker);
  const stories = sortArticles(JOURNAL).filter((article) => article.maker === maker.slug);

  return (
    <div className={styles.page}>
      <Breadcrumbs trail={[{ label: 'Our story', to: '/about' }, { label: 'Makers', to: '/about/makers' }, { label: maker.name }]} />
      <header className={styles.makerHeader}>
        <div className={styles.makerIntro}>
          <p className={styles.eyebrow}>{maker.craft}</p>
          <h1 className={styles.title}>{maker.name}</h1>
          <p className={styles.lede}>{maker.intro}</p>
          <ul className={styles.facts}>
            <li>
              <MapPin aria-hidden="true" /> {maker.place}
            </li>
            <li>
              <CalendarDays aria-hidden="true" /> Making since {maker.founded}
            </li>
          </ul>
        </div>
        <ProductArt art={maker.art} zoom={1.3} className={styles.makerArt} />
      </header>

      <section aria-labelledby="maker-story-title" className={styles.prose}>
        <h2 id="maker-story-title" className={styles.sectionTitle}>
          Their story
        </h2>
        {maker.story.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>

      <section aria-labelledby="maker-products-title" className={styles.block}>
        <h2 id="maker-products-title" className={styles.sectionTitle}>
          {products.data ? `${own.length} ${own.length === 1 ? 'piece' : 'pieces'} by ${maker.name}` : `Pieces by ${maker.name}`}
        </h2>
        {products.status === 'error' ? (
          <LoadError error={products.error} onRetry={products.reload} subject="their pieces" />
        ) : !products.data ? (
          <ProductGridSkeleton count={3} />
        ) : own.length === 0 ? (
          <p className={styles.dek}>Nothing from {maker.name} is on sale right now. New pieces are on the way.</p>
        ) : (
          <ProductGrid products={own} featureEvery={0} />
        )}
      </section>

      {stories.length > 0 && (
        <section aria-labelledby="maker-stories-title" className={styles.block}>
          <h2 id="maker-stories-title" className={styles.sectionTitle}>
            In the journal
          </h2>
          <div className={styles.grid}>
            {stories.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
