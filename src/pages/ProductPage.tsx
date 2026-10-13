import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AlignLeft, ListChecks, PackageX, Store, ThumbsUp, Truck } from 'lucide-react';
import { getProduct, listRecommendations } from '@/api/catalogApi';
import { isApiError } from '@/api/client';
import { CompareToggle } from '@/components/compare/CompareToggle';
import { LoadError } from '@/components/feedback/LoadError';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { AddToBag } from '@/components/product/AddToBag';
import { BackInStockBanner, NotifyMe } from '@/components/product/BackInStock';
import { ProductGallery } from '@/components/product/ProductGallery';
import { ProductRail } from '@/components/product/ProductRail';
import { RecentlyViewed } from '@/components/product/RecentlyViewed';
import { ProductQuestions } from '@/components/questions/ProductQuestions';
import { ProductReviews } from '@/components/reviews/ProductReviews';
import { Rating } from '@/components/product/Rating';
import { StockNotice } from '@/components/product/StockNotice';
import { SizeGuide } from '@/components/product/SizeGuide';
import { VariantPicker } from '@/components/product/VariantPicker';
import { Badge, HeadingIcon } from '@/components/ui';
import { COLLECTIONS } from '@/config/collections';
import { discountPercent, formatMoney } from '@/domain/money';
import {
  defaultVariant,
  findVariant,
  isNewArrival,
  selectedSwatch,
  totalStock,
  variantPrice,
  type Product,
  type Variant,
} from '@/domain/product';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { recordView } from '@/domain/recentlyViewed';
import styles from './ProductPage.module.css';

export const VARIANT_PARAM = 'variant';

export function ProductPage() {
  const { slug = '' } = useParams();
  const result = useAsync((signal) => getProduct(slug, { signal }), [slug]);

  if (result.status === 'error') {
    if (isApiError(result.error) && result.error.code === 'NOT_FOUND') return <ProductNotFound />;
    return <LoadError error={result.error} onRetry={result.reload} subject="this product" />;
  }
  // Don't show the previous product while the next one loads.
  if (!result.data || result.data.slug !== slug) return <ProductSkeleton />;
  return <ProductDetail key={result.data.id} product={result.data} />;
}

/** The variant named in the URL, or the first one in stock. */
function useSelectedVariant(product: Product) {
  const [params, setParams] = useSearchParams();
  const fromUrl = product.variants.find((variant) => variant.id === params.get(VARIANT_PARAM));
  const variant = fromUrl ?? defaultVariant(product);

  function choose(optionName: string, value: string) {
    const next = findVariant(product, { ...variant.options, [optionName]: value });
    if (!next) return;
    // Replace rather than push: picking a color should not fill the back button's history.
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        updated.set(VARIANT_PARAM, next.id);
        return updated;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  return { variant, choose };
}

function ProductDetail({ product }: { product: Product }) {
  usePageTitle(product.name);
  const recommendations = useAsync((signal) => listRecommendations([product.id], 4, { signal }), [product.id]);

  useEffect(() => {
    recordView(product.id);
  }, [product.id]);
  const { variant, choose } = useSelectedVariant(product);
  const department = COLLECTIONS[product.department];
  const soldOut = totalStock(product) === 0;

  return (
    <article className={styles.page}>
      {/* Starts at Shop: a Home link next to the Home department would read "Home › Home". */}
      <Breadcrumbs
        trail={[
          { label: 'Shop', to: '/shop' },
          { label: department.title, to: `/shop/${product.department}` },
          { label: product.name },
        ]}
      />

      <div className={styles.layout}>
        <div className={styles.media}>
          <ProductGallery product={product} color={selectedSwatch(product, variant)} muted={soldOut} />
        </div>

        <div className={styles.info}>
          <div className={styles.heading}>
            <p className={styles.maker}>{product.maker}</p>
            <h1 className={styles.name}>{product.name}</h1>
            <div className={styles.badges}>
              {isNewArrival(product, new Date()) && <Badge tone="accent">New</Badge>}
              <Badge>{product.type}</Badge>
            </div>
            <a href="#reviews" className={styles.ratingLink}>
              <Rating average={product.rating.average} count={product.rating.count} />
            </a>
          </div>

          <VariantPrice product={product} variant={variant} />
          <p className={styles.summary}>{product.summary}</p>

          <VariantPicker product={product} selection={variant.options} onChange={choose} />
          <SizeGuide product={product} selection={variant.options} onPick={(size) => choose('Size', size)} />
          <BackInStockBanner variant={variant} />
          <StockNotice stock={variant.stock} hasOptions={product.options.length > 0} />
          {variant.stock <= 0 && <NotifyMe product={product} variant={variant} />}
