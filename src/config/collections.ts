import type { ArtTint, CollectionSlug } from '@/domain/product';

export interface CollectionInfo {
  title: string;
  /** One line under the title. */
  intro: string;
  /** Backdrop of the collection header. "sale" uses the sale color. */
  tint: ArtTint | 'sale';
}

export const ALL_PRODUCTS: CollectionInfo = {
  title: 'All products',
  intro: 'Everything in the shop, from stoneware to skincare.',
  tint: 'sand',
};

export const COLLECTIONS: Record<CollectionSlug, CollectionInfo> = {
  new: {
    title: 'New in',
    intro: 'Fresh from the studios this month. Small batches, so they go quickly.',
    tint: 'sage',
  },
  home: {
    title: 'Home',
    intro: 'Stoneware, linen and light for the rooms you spend the most time in.',
    tint: 'lilac',
  },
  apparel: {
    title: 'Apparel',
    intro: 'Natural fibres in easy shapes, made to be worn for years.',
    tint: 'sage',
  },
  beauty: {
    title: 'Beauty',
    intro: 'Small-batch skincare and bath rituals with short ingredient lists.',
    tint: 'blush',
  },
  sale: {
    title: 'Sale',
    intro: 'A few favourites at a gentler price, while they last.',
    tint: 'sale',
  },
};

export function collectionInfo(slug: CollectionSlug | undefined): CollectionInfo {
  return slug ? COLLECTIONS[slug] : ALL_PRODUCTS;
}
