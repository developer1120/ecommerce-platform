import type { CollectionSlug } from '@/domain/product';

/** Top-level departments shown in the header and footer. */
export interface NavCategory {
  slug: CollectionSlug;
  label: string;
  /** Shown in the sale color. */
  highlight?: boolean;
}

export const NAV_CATEGORIES: NavCategory[] = [
  { slug: 'new', label: 'New in' },
  { slug: 'home', label: 'Home' },
  { slug: 'apparel', label: 'Apparel' },
  { slug: 'beauty', label: 'Beauty' },
  { slug: 'sale', label: 'Sale', highlight: true },
];

export const ANNOUNCEMENTS: string[] = [
  'Free shipping on orders over $75',
  '30-day returns, no questions asked',
  'New autumn edit: linen, stoneware and slow rituals',
];

export interface FooterLinkGroup {
  title: string;
  links: { label: string; to: string }[];
}

export const FOOTER_LINKS: FooterLinkGroup[] = [
  {
    title: 'Shop',
    links: NAV_CATEGORIES.map((category) => ({ label: category.label, to: `/shop/${category.slug}` })),
  },
  {
    title: 'Help',
    links: [
      { label: 'Shipping', to: '/help/shipping' },
      { label: 'Returns', to: '/help/returns' },
      { label: 'Track an order', to: '/account/orders' },
      { label: 'Contact us', to: '/help/contact' },
    ],
  },
  {
    title: 'Tanelt',
    links: [
      { label: 'Our story', to: '/about' },
      { label: 'Makers', to: '/about/makers' },
      { label: 'Journal', to: '/journal' },
      { label: 'Workshops', to: '/workshops' },
    ],
  },
];
