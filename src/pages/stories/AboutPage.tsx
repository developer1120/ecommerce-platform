import { Hand, Handshake, Leaf, PackageCheck, Sprout } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { HeadingIcon } from '@/components/ui';
import { JOURNAL } from '@/data/journal';
import { MAKERS } from '@/data/makers';
import { productsByMaker, sortArticles } from '@/domain/stories';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArticleCard, MakerCard, MoreLink } from './StoriesParts';
import styles from './Stories.module.css';

const VALUES = [
  {
    icon: Handshake,
    title: 'Made by people we know',
    text: 'Every maker in the shop is someone we have visited, and most are a phone call away. We pay them what they ask, on time.',
  },
  {
    icon: Sprout,
    title: 'Made to last',
    text: 'We choose things that get better with use: linen that softens, wood that darkens, knits that can be mended.',
  },
  {
    icon: PackageCheck,
    title: 'Packed by hand',
    text: 'Orders are packed in our studio with paper and card only, and no plastic fill. Most leave the day they are placed.',
  },
];

const FEATURED_MAKERS = 3;

/** Our story: why the shop exists, what it stands for, and who makes what it sells. */
export function AboutPage() {
  usePageTitle('Our story');
  const products = useAsync((signal) => listProducts({}, { signal }), []);
  const latest = sortArticles(JOURNAL).slice(0, 2);
  const stats = [
    { label: 'Independent makers', value: MAKERS.length },
    { label: 'Pieces in the shop', value: products.data?.length },
    { label: 'Years our longest-standing maker has been at it', value: new Date().getUTCFullYear() - Math.min(...MAKERS.map((maker) => maker.founded)) },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Our story</p>
        <h1 className={styles.title}>
          <HeadingIcon icon={Leaf} badge />
          Fewer, better things
        </h1>
        <p className={styles.lede}>
          Tanelt began as a market stall selling one potter's mugs. Today it is a small studio in Brooklyn working with ten independent
          makers across the country, but the idea is the same: things for everyday life, made slowly and made well.
        </p>
      </header>

      <dl className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <dt>{stat.label}</dt>
            <dd>{stat.value ?? '…'}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="values-title" className={styles.block}>
        <h2 id="values-title" className={styles.sectionTitle}>
          What we care about
        </h2>
        <ul className={styles.values}>
          {VALUES.map(({ icon: Icon, title, text }) => (
            <li key={title} className={styles.value}>
              <span className={styles.valueIcon} aria-hidden="true">
                <Icon />
              </span>
              <h3 className={styles.smallTitle}>{title}</h3>
              <p className={styles.dek}>{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-makers-title" className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 id="about-makers-title" className={styles.sectionTitle}>
            <HeadingIcon icon={Hand} />
            Some of our makers
          </h2>
          <MoreLink to="/about/makers">{`All ${MAKERS.length} makers`}</MoreLink>
        </div>
        <div className={styles.grid}>
          {MAKERS.slice(0, FEATURED_MAKERS).map((maker) => (
            <MakerCard key={maker.slug} maker={maker} productCount={productsByMaker(products.data ?? [], maker).length} />
          ))}
        </div>
      </section>

      <section aria-labelledby="about-journal-title" className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 id="about-journal-title" className={styles.sectionTitle}>
            From the journal
          </h2>
          <MoreLink to="/journal">Read the journal</MoreLink>
        </div>
        <div className={styles.grid}>
          {latest.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </section>
    </div>
  );
}
