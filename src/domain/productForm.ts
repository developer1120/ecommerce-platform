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
  motif: 'vessel',
  optionsText: '',
  variants: [{ id: '', options: {}, stock: '0', price: '' }],
};

/** Rebuilds the variant rows for new options, keeping stock typed for combinations that remain. */
export function variantsForOptions(options: ProductOption[], current: VariantDraft[]): VariantDraft[] {
  return combinations(options).map((combo) => {
    const key = JSON.stringify(combo);
    const kept = current.find((variant) => JSON.stringify(variant.options) === key);
    return kept ?? { id: '', options: combo, stock: '0', price: '' };
  });
}

function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

/**
 * Checks a draft and, if it is sound, builds the product to save.
 * `others` are the rest of the catalog, for the slug check.
 */
export function buildProduct(
  draft: ProductDraft,
  existing: Product | null,
  others: Product[],
  now: Date,
): { product: Product; errors?: undefined } | { product?: undefined; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const name = draft.name.trim();
  const slug = slugify(draft.slug || draft.name);
  if (!name) errors.name = 'Enter a product name';
  if (!slug) errors.slug = 'Enter a web address made of letters, numbers and dashes';
  else if (others.some((product) => product.slug === slug && product.id !== existing?.id)) {
    errors.slug = `Another product already uses /product/${slug}`;
  }
  if (!draft.maker.trim()) errors.maker = 'Enter the maker';
  if (!draft.type.trim()) errors.type = 'Enter a product type, such as Tableware';
  if (!draft.summary.trim()) errors.summary = 'Write a one-line summary';

  const price = parseMoney(draft.price);
  if (price === null || price <= 0) errors.price = 'Enter a price, like 38.00';
  let compareAtPrice: Cents | undefined;
  if (draft.compareAtPrice.trim()) {
    const parsed = parseMoney(draft.compareAtPrice);
    if (parsed === null) errors.compareAtPrice = 'Enter the previous price, like 48.00, or leave it empty';
    else if (price !== null && parsed <= price) errors.compareAtPrice = 'The previous price must be higher than the price';
    else compareAtPrice = parsed;
  }

  // Options are fixed once a product exists, so carts and past orders keep pointing at real variants.
  const options = existing ? existing.options : parseOptions(draft.optionsText);
  if (typeof options === 'string') errors.optionsText = options;

  const variants: Variant[] = [];
  draft.variants.forEach((row, index) => {
    const stock = wholeNumber(row.stock);
    const variantPrice = row.price.trim() ? parseMoney(row.price) : undefined;
    if (stock === null) errors.variants = `Row ${index + 1}: stock must be a whole number`;
    else if (variantPrice === null || variantPrice === 0) errors.variants = `Row ${index + 1}: enter a price like 44.00 or leave it empty`;
    // The id uses the whole (unique) address; the SKU is a short label for the stockroom.
    const base = existing?.id ?? slug;
    const code = base.toUpperCase().slice(0, 12).replace(/-+$/, '');
    const suffix = Object.values(row.options)
      .map((value) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 4))
      .join('-');
    const sku = suffix ? `${code}-${suffix}` : code;
    variants.push({
      id: row.id || (suffix ? `${base}-${suffix.toLowerCase()}` : base),
      sku: existing?.variants.find((variant) => variant.id === row.id)?.sku ?? sku,
      options: row.options,
      stock: stock ?? 0,
      ...(variantPrice ? { price: variantPrice } : {}),
    });
  });
  if (variants.length === 0) errors.variants = 'Add at least one variant';
  if (new Set(variants.map((variant) => variant.id)).size !== variants.length) {
    errors.variants = 'Two variants would share a code; make the option values more distinct';
  }
  const elsewhere = new Set(others.filter((other) => other.id !== existing?.id).flatMap((other) => other.variants.map((variant) => variant.id)));
  if (variants.some((variant) => elsewhere.has(variant.id))) {
    errors.variants = 'Another product already uses these variant codes; choose a different web address';
  }

  if (Object.keys(errors).length > 0) return { errors };

  const product: Product = {
    id: existing?.id ?? slug,
    slug,
    name,
    maker: draft.maker.trim(),
    department: draft.department,
    type: draft.type.trim(),
    summary: draft.summary.trim(),
    description: draft.description.trim() || draft.summary.trim(),
    details: draft.details
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    price: price!,
    ...(compareAtPrice !== undefined && { compareAtPrice }),
    tags: [...new Set(draft.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
    rating: existing?.rating ?? { average: 0, count: 0 },
    addedAt: existing?.addedAt ?? now.toISOString().slice(0, 10),
    art: { tint: draft.tint, motif: draft.motif },
    options: options as ProductOption[],
    variants,
    status: draft.status,
    updatedAt: now.toISOString(),
  };
  return { product };
}
