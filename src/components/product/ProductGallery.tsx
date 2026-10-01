import { useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ArtTint, Product } from '@/domain/product';
import { cx } from '@/lib/cx';
import { ProductArt } from './ProductArt';
import styles from './ProductGallery.module.css';

interface GalleryView {
  label: string;
  zoom: number;
  /** A different backdrop for the "styled" shot. */
  tint?: ArtTint;
}

const STYLED_TINT: Record<ArtTint, ArtTint> = { lilac: 'sand', sage: 'lilac', blush: 'sage', sand: 'blush' };

export function galleryViews(product: Product): GalleryView[] {
  return [
    { label: 'Front', zoom: 1 },
    { label: 'Close-up', zoom: 1.7 },
    { label: 'Styled', zoom: 0.75, tint: STYLED_TINT[product.art.tint] },
  ];
}

interface ProductGalleryProps {
  product: Product;
  /** Paints the drawing in the selected variant's color. */
  color?: string;
  muted?: boolean;
}

/** One large view with thumbnails beneath. Arrow keys on the thumbnails move between views. */
export function ProductGallery({ product, color, muted }: ProductGalleryProps) {
  const views = galleryViews(product);
  const [index, setIndex] = useState(0);
  const current = views[index]!;
  const step = (delta: number) => setIndex((value) => (value + delta + views.length) % views.length);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      step(event.key === 'ArrowRight' ? 1 : -1);
    }
  }

  return (
    <section className={styles.gallery} aria-label={`${product.name} images`} aria-roledescription="gallery">
      <figure className={styles.stage}>
        <ProductArt art={product.art} color={color} muted={muted} zoom={current.zoom} tint={current.tint} className={styles.main} />
        <figcaption className={styles.caption}>
          {current.label}
          <span className="visually-hidden">
            , view {index + 1} of {views.length}
          </span>
        </figcaption>
        <button type="button" className={cx(styles.arrow, styles.prev)} aria-label="Previous view" onClick={() => step(-1)}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" className={cx(styles.arrow, styles.next)} aria-label="Next view" onClick={() => step(1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </figure>
      <ul className={styles.thumbs} onKeyDown={handleKeyDown}>
        {views.map((view, viewIndex) => (
          <li key={view.label}>
            <button
              type="button"
              className={styles.thumb}
              aria-label={`Show ${view.label.toLowerCase()} view`}
              aria-current={viewIndex === index || undefined}
              onClick={() => setIndex(viewIndex)}
            >
              <ProductArt art={product.art} color={color} muted={muted} zoom={view.zoom} tint={view.tint} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
