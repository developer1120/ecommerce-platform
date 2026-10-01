import { useRef, type CSSProperties, type ReactNode } from 'react';
import type { ArtMotif, ArtTint, ProductArt as ProductArtSpec } from '@/domain/product';
import { useNearViewport } from '@/hooks/useNearViewport';
import { cx } from '@/lib/cx';
import styles from './ProductArt.module.css';

/** The object color used when no variant color is chosen. */
const DEFAULT_FILL: Record<ArtTint, string> = {
  lilac: '#9b7fc7',
  sage: '#7f9a62',
  blush: '#d07b9a',
  sand: '#c49a6c',
};

/** Each motif is a simple flat drawing on a 200 × 200 canvas, resting on a shadow at y≈160. */
const MOTIFS: Record<ArtMotif, (fill: string) => ReactNode> = {
  cup: (fill) => (
    <>
      <path d="M118 92c22 0 26 30 2 34" fill="none" stroke={fill} strokeWidth="9" strokeLinecap="round" />
      <rect x="58" y="78" width="66" height="80" rx="14" fill={fill} />
      <rect x="58" y="78" width="66" height="12" rx="6" fill="#000" opacity="0.12" />
    </>
  ),
  vessel: (fill) => (
    <>
      <path d="M88 52h24v18c18 10 28 30 26 52-2 22-16 36-38 36s-36-14-38-36c-2-22 8-42 26-52z" fill={fill} />
      <rect x="86" y="48" width="28" height="8" rx="4" fill="#000" opacity="0.14" />
    </>
  ),
  fold: (fill) => (
    <>
      <rect x="44" y="124" width="112" height="34" rx="10" fill={fill} />
      <rect x="50" y="100" width="104" height="30" rx="10" fill={fill} />
      <rect x="50" y="100" width="104" height="30" rx="10" fill="#fff" opacity="0.14" />
      <rect x="56" y="78" width="96" height="28" rx="10" fill={fill} />
      <path d="M60 158v8M72 158v8M84 158v8M96 158v8M108 158v8M120 158v8M132 158v8M144 158v8" stroke={fill} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  stack: (fill) => (
    <>
      <path d="M78 84c0-26 44-26 44 0" fill="none" stroke={fill} strokeWidth="7" strokeLinecap="round" />
      <path d="M56 84h88l-8 74H64z" fill={fill} />
      <rect x="74" y="104" width="52" height="30" rx="6" fill="#000" opacity="0.1" />
    </>
  ),
  jar: (fill) => (
    <>
      <rect x="56" y="100" width="88" height="58" rx="16" fill={fill} />
      <rect x="60" y="84" width="80" height="22" rx="8" fill="#2b1a3a" opacity="0.8" />
      <rect x="74" y="118" width="52" height="22" rx="4" fill="#fff" opacity="0.55" />
    </>
  ),
  bottle: (fill) => (
    <>
      <rect x="88" y="38" width="24" height="22" rx="5" fill="#2b1a3a" opacity="0.8" />
      <path d="M90 58h20v16c14 6 20 16 20 28v48a8 8 0 0 1-8 8H78a8 8 0 0 1-8-8v-48c0-12 6-22 20-28z" fill={fill} />
      <rect x="80" y="110" width="40" height="30" rx="4" fill="#fff" opacity="0.55" />
    </>
  ),
  bar: (fill) => (
    <>
      <rect x="46" y="112" width="108" height="46" rx="18" fill={fill} />
      <rect x="46" y="112" width="108" height="14" rx="7" fill="#fff" opacity="0.18" />
      <ellipse cx="100" cy="136" rx="22" ry="6" fill="#000" opacity="0.1" />
    </>
  ),
  garment: (fill) => (
    <>
      <path
        d="M78 52l-32 16 10 30 14-6v66h60V92l14 6 10-30-32-16c-4 10-12 16-22 16s-18-6-22-16z"
        fill={fill}
      />
      <path d="M78 52c4 10 12 16 22 16s18-6 22-16" fill="none" stroke="#000" strokeOpacity="0.15" strokeWidth="4" />
    </>
  ),
  round: (fill) => (
    <>
      <ellipse cx="100" cy="118" rx="54" ry="42" fill={fill} />
      <ellipse cx="100" cy="118" rx="28" ry="20" fill="#fff" opacity="0.18" />
      <path d="M58 104c20 10 64 10 84 0" fill="none" stroke="#000" strokeOpacity="0.1" strokeWidth="4" />
    </>
  ),
  flame: (fill) => (
    <>
      <rect x="76" y="70" width="14" height="88" rx="5" fill={fill} />
      <rect x="110" y="62" width="14" height="96" rx="5" fill={fill} />
      <path d="M83 48c6 8 6 14 0 18-6-4-6-10 0-18z" fill="#f2b84b" />
      <path d="M117 40c6 8 6 14 0 18-6-4-6-10 0-18z" fill="#f2b84b" />
    </>
  ),
};

interface ProductArtProps {
  art: ProductArtSpec;
  /** Overrides the object color, e.g. with the selected color swatch. */
  color?: string;
  /** Desaturate, for sold-out products. */
  muted?: boolean;
  /** Draw the object only, without the tinted backdrop. */
  bare?: boolean;
  /** Scales the drawing, e.g. 1.7 for a close-up. */
  zoom?: number;
  /** Shows a different backdrop than the product's own tint. */
  tint?: ProductArtSpec['tint'];
  /**
   * Draws the object only once the art nears the screen, like a lazy-loaded
   * image. Until then its tinted backdrop holds the space as a placeholder.
   */
  lazy?: boolean;
  className?: string;
}

/** A flat illustration standing in for product photography. Decorative: the product name labels it. */
export function ProductArt({ art, color, muted = false, bare = false, zoom, tint, lazy = false, className }: ProductArtProps) {
  const fill = color ?? DEFAULT_FILL[art.tint];
  const frameRef = useRef<HTMLDivElement>(null);
  const drawn = useNearViewport(frameRef, lazy);
  return (
    <div
      ref={frameRef}
      className={cx(styles.art, className)}
      data-tint={tint ?? art.tint}
      data-muted={muted || undefined}
      data-bare={bare || undefined}
      data-lazy={lazy || undefined}
      data-placeholder={drawn ? undefined : true}
      aria-hidden="true"
    >
      {drawn && (
        <svg
          viewBox="0 0 200 200"
          className={styles.svg}
          style={zoom ? ({ '--art-zoom': zoom } as CSSProperties) : undefined}
        >
          <ellipse cx="100" cy="162" rx="62" ry="8" fill="#2b1a3a" opacity="0.1" />
          {MOTIFS[art.motif](fill)}
        </svg>
      )}
    </div>
  );
}
