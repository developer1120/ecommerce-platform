import { Link } from 'react-router';
import { ArrowRight, Heart, Leaf, RotateCcw, Sparkles, Truck } from 'lucide-react';
import { listBestsellers, listProducts } from '@/api/catalogApi';
import { ProductArt } from '@/components/product/ProductArt';
import { ProductRail } from '@/components/product/ProductRail';
import { RecentlyViewed } from '@/components/product/RecentlyViewed';
import type { CollectionSlug, ProductArt as ProductArtSpec } from '@/domain/product';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import styles from './HomePage.module.css';

const RAIL_SIZE = 4;

interface CategoryTile {
  slug: CollectionSlug;
  title: string;
  blurb: string;
  art: ProductArtSpec;
}

const CATEGORY_TILES: CategoryTile[] = [
  { slug: 'home', title: 'Home', blurb: 'Stoneware, linen and light', art: { tint: 'lilac', motif: 'vessel' } },
  { slug: 'apparel', title: 'Apparel', blurb: 'Natural fibres, easy shapes', art: { tint: 'sage', motif: 'garment' } },
  { slug: 'beauty', title: 'Beauty', blurb: 'Small-batch rituals', art: { tint: 'blush', motif: 'bottle' } },
  { slug: 'sale', title: 'Sale', blurb: 'Up to 30% off', art: { tint: 'sand', motif: 'fold' } },
];

const PROMISES = [
  { icon: Truck, title: 'Free shipping over $75', text: 'Carbon-neutral delivery in 2 to 4 days.' },
  { icon: RotateCcw, title: '30-day returns', text: 'Changed your mind? Send it back for free.' },
  { icon: Leaf, title: 'Made by small studios', text: 'Every maker paid fairly and named on the label.' },
];

export function HomePage() {
  usePageTitle();
  const arrivals = useAsync((signal) => listProducts({ collection: 'new', limit: RAIL_SIZE }, { signal }), []);
  const bestsellers = useAsync((signal) => listBestsellers(RAIL_SIZE, { signal }), []);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Autumn edit 2026</p>
          <h1 id="hero-title" className={styles.heroTitle}>
            Objects for <em>slower</em> living
          </h1>
          <p className={styles.heroText}>
            Considered pieces for home, wardrobe and self-care, from small makers we know by name.
          </p>
          <div className={styles.heroActions}>
            <Link to="/shop/new" className={styles.primaryCta}>
              Shop new arrivals
            </Link>
            <Link to="/shop" className={styles.secondaryCta}>
              Browse everything
            </Link>
          </div>
        </div>
        <div className={styles.collage} aria-hidden="true">
          <ProductArt art={{ tint: 'lilac', motif: 'cup' }} className={styles.collageA} />
          <ProductArt art={{ tint: 'sage', motif: 'fold' }} className={styles.collageB} />
          <ProductArt art={{ tint: 'blush', motif: 'jar' }} className={styles.collageC} />
        </div>
      </section>

      <section aria-labelledby="departments-title">
        <h2 id="departments-title" className="visually-hidden">
          Shop by department
        </h2>
        <ul className={styles.bento}>
          {CATEGORY_TILES.map((tile) => (
            <li key={tile.slug} className={styles.tile} data-slug={tile.slug}>
              <Link to={`/shop/${tile.slug}`} className={styles.tileLink}>
                <span className={styles.tileText}>
                  <span className={styles.tileTitle}>{tile.title}</span>
                  <span className={styles.tileBlurb}>{tile.blurb}</span>
                </span>
                <ProductArt art={tile.art} bare className={styles.tileArt} />
                <ArrowRight className={styles.tileArrow} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ProductRail id="arrivals" title="Just arrived" icon={Sparkles} more={{ to: '/shop/new', label: 'All new arrivals' }} result={arrivals} />

      <ul className={styles.promises}>
        {PROMISES.map(({ icon: Icon, title, text }) => (
          <li key={title} className={styles.promise}>
            <Icon className={styles.promiseIcon} aria-hidden="true" />
            <span>
              <strong>{title}</strong>
              <span className={styles.promiseText}>{text}</span>
            </span>
          </li>
        ))}
      </ul>

      <ProductRail id="bestsellers" title="Most loved" icon={Heart} more={{ to: '/shop', label: 'Shop everything' }} result={bestsellers} />

      <RecentlyViewed />
    </div>
  );
}
