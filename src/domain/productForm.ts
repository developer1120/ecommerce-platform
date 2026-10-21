import { combinations } from '@/data/defineProduct';
import { formatMoney, parseMoney, type Cents } from './money';
import type { ArtMotif, ArtTint, Department, Product, ProductOption, ProductStatus, Variant } from './product';

/*
 * The admin product form works on strings, as typed; this turns a draft
 * into a product, checking everything a shopper would trip over.
 */

export interface VariantDraft {
  /** Empty for a variant that doesn't exist yet. */
  id: string;
  options: Record<string, string>;
  stock: string;
  /** Optional price for this variant only, as typed. */
  price: string;
}

export interface ProductDraft {
  name: string;
  slug: string;
  maker: string;
  department: Department;
  type: string;
  summary: string;
  description: string;
  /** One detail per line. */
  details: string;
  price: string;
  compareAtPrice: string;
  /** Comma separated. */
  tags: string;
  status: ProductStatus;
  tint: ArtTint;
  motif: ArtMotif;
  /** For new products: "Color: Oat, Ink" per line. Locked once the product exists. */
  optionsText: string;
  variants: VariantDraft[];
}

export type DraftErrors = Partial<Record<keyof ProductDraft | 'variants', string>>;

export const TINTS: ArtTint[] = ['lilac', 'sage', 'blush', 'sand'];
export const MOTIFS: ArtMotif[] = ['vessel', 'cup', 'fold', 'stack', 'jar', 'bottle', 'bar', 'garment', 'round', 'flame'];

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Color: Oat, Ink\nSize: S, M" → options. Blank lines are ignored. */
export function parseOptions(text: string): ProductOption[] | string {
  const options: ProductOption[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [name, values] = line.split(':').map((part) => part.trim());
    if (!name || !values) return `Write each option as "Name: value, value". "${line}" is missing a colon or values.`;
    const list = [...new Set(values.split(',').map((value) => value.trim()).filter(Boolean))];
    if (list.length === 0) return `Give ${name} at least one value.`;
    if (options.some((option) => option.name.toLowerCase() === name.toLowerCase())) return `${name} is listed twice.`;
    options.push({ name, values: list.map((value) => ({ value })) });
  }
  if (options.length > 2) return 'Use at most two options, such as color and size.';
  return options;
}

export function draftFromProduct(product: Product): ProductDraft {
  return {
    name: product.name,
    slug: product.slug,
    maker: product.maker,
    department: product.department,
    type: product.type,
    summary: product.summary,
    description: product.description,
    details: product.details.join('\n'),
    price: formatMoney(product.price).replace('$', '').replace(/,/g, ''),
    compareAtPrice: product.compareAtPrice ? formatMoney(product.compareAtPrice).replace('$', '').replace(/,/g, '') : '',
    tags: product.tags.join(', '),
    status: product.status ?? 'active',
    tint: product.art.tint,
    motif: product.art.motif,
    optionsText: product.options.map((option) => `${option.name}: ${option.values.map((v) => v.value).join(', ')}`).join('\n'),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      options: variant.options,
      stock: String(variant.stock),
      price: variant.price ? (variant.price / 100).toFixed(2) : '',
    })),
  };
}

export const EMPTY_DRAFT: ProductDraft = {
  name: '',
  slug: '',
  maker: '',
  department: 'home',
  type: '',
  summary: '',
  description: '',
  details: '',
  price: '',
  compareAtPrice: '',
  tags: '',
  status: 'draft',
  tint: 'lilac',
