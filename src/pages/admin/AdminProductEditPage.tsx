import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, BadgeDollarSign, Eye, FileText, Layers, Palette, PencilLine } from 'lucide-react';
import { getAdminProduct, ProductValidationError, saveProduct } from '@/api/adminApi';
import { isApiError } from '@/api/client';
import { ErrorSummary } from '@/components/checkout/ErrorSummary';
import { LoadError } from '@/components/feedback/LoadError';
import { ProductArt } from '@/components/product/ProductArt';
import { Button, HeadingIcon, Spinner, TextField } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import { DEPARTMENTS, type Department, type Product, type ProductStatus } from '@/domain/product';
import {
  draftFromProduct,
  EMPTY_DRAFT,
  MOTIFS,
  parseOptions,
  slugify,
  TINTS,
  variantsForOptions,
  type DraftErrors,
  type ProductDraft,
} from '@/domain/productForm';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './Admin.module.css';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const STATUSES: { value: ProductStatus; label: string }[] = [
  { value: 'draft', label: 'Draft · hidden from the shop' },
  { value: 'active', label: 'Active · on sale' },
  { value: 'archived', label: 'Archived · retired' },
];
/** Form order, so the error summary reads top to bottom. */
const FIELD_ORDER: (keyof DraftErrors)[] = ['name', 'slug', 'maker', 'type', 'summary', 'price', 'compareAtPrice', 'optionsText', 'variants'];
const fieldId = (field: keyof DraftErrors) => `product-${field}`;

export function AdminProductEditPage() {
  const { productId } = useParams();
  const { token } = useAuth();
  const existing = useAsync(
    (signal) => (productId ? getAdminProduct(token!, productId, { signal }) : Promise.resolve(null)),
    [token, productId],
  );

  if (existing.status === 'error') return <LoadError error={existing.error} onRetry={existing.reload} subject="this product" />;
  if (existing.status !== 'success') return <Spinner label="Loading product" />;
  return <ProductForm key={productId ?? 'new'} product={existing.data} />;
}

function ProductForm({ product }: { product: Product | null }) {
  usePageTitle(product ? `Edit ${product.name} · Admin` : 'New product · Admin');
  const { token } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProductDraft>(() => (product ? draftFromProduct(product) : EMPTY_DRAFT));
  // A new product's address follows its name until someone edits the address itself.
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [failedSaves, setFailedSaves] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (failedSaves > 0) summaryRef.current?.focus();
  }, [failedSaves]);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === 'name' && !slugEdited) next.slug = slugify(value as string);
      if (key === 'optionsText') {
        const options = parseOptions(value as string);
        if (typeof options !== 'string') next.variants = variantsForOptions(options, current.variants);
      }
      return next;
    });
  };

  const setVariant = (index: number, key: 'stock' | 'price', value: string) => {
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { product: saved, notified } = await saveProduct(token!, product?.id ?? null, draft);
      toast({
        title: product ? `${saved.name} saved` : `${saved.name} created`,
        description:
          notified > 0 ? `${notified} ${notified === 1 ? 'shopper was' : 'shoppers were'} emailed that it's back in stock.` : undefined,
      });
      navigate('/admin/products');
    } catch (error) {
      setSaving(false);
      if (error instanceof ProductValidationError) {
        setErrors(error.fields);
        setFailedSaves((count) => count + 1);
      } else {
        toast({ tone: 'error', title: "Couldn't save the product", description: isApiError(error) ? error.message : undefined });
      }
    }
  };

  const summary = FIELD_ORDER.flatMap((field) => {
    const message = errors[field];
    return message ? [{ fieldId: fieldId(field), message }] : [];
  });
  const field = (key: keyof DraftErrors) => ({ id: fieldId(key), error: errors[key] ?? null });

  return (
    <section className={styles.section} aria-labelledby="product-form-title">
      <Link to="/admin/products" className={styles.back}>
        <ArrowLeft aria-hidden="true" /> All products
      </Link>
      <h2 id="product-form-title" className={styles.sectionTitle}>
        <HeadingIcon icon={PencilLine} />
        {product ? `Edit ${product.name}` : 'New product'}
      </h2>
      <ErrorSummary ref={summaryRef} errors={summary} />

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.formMain}>
          <fieldset className={styles.panel}>
            <legend className={styles.legend}>
              <HeadingIcon icon={FileText} />
              Basics
            </legend>
            <TextField label="Name" required value={draft.name} onChange={(e) => set('name', e.target.value)} {...field('name')} />
            <TextField
              label="Web address"
              hint={`/product/${slugify(draft.slug) || '…'}`}
              value={draft.slug}
              onChange={(e) => {
                setSlugEdited(true);
                set('slug', e.target.value);
              }}
              {...field('slug')}
            />
            <div className={styles.pair}>
              <TextField label="Maker" required value={draft.maker} onChange={(e) => set('maker', e.target.value)} {...field('maker')} />
              <TextField label="Type" required value={draft.type} onChange={(e) => set('type', e.target.value)} {...field('type')} />
            </div>
            <SelectField
              label="Department"
              value={draft.department}
              options={DEPARTMENTS.map((value) => ({ value, label: capitalize(value) }))}
              onChange={(e) => set('department', e.target.value as Department)}
            />
            <TextField label="Summary" required value={draft.summary} onChange={(e) => set('summary', e.target.value)} {...field('summary')} />
            <TextArea label="Description" id="product-description" value={draft.description} onChange={(value) => set('description', value)} />
            <TextArea
              label="Details"
              id="product-details"
              hint="One per line, such as materials or care."
              value={draft.details}
              onChange={(value) => set('details', value)}
            />
            <TextField label="Tags" hint="Comma separated, used by search." value={draft.tags} onChange={(e) => set('tags', e.target.value)} />
          </fieldset>

          <fieldset className={styles.panel}>
            <legend className={styles.legend}>
              <HeadingIcon icon={BadgeDollarSign} />
              Pricing
            </legend>
            <div className={styles.pair}>
              <TextField
                label="Price"
                required
                inputMode="decimal"
                leading="$"
                value={draft.price}
                onChange={(e) => set('price', e.target.value)}
                {...field('price')}
              />
              <TextField
                label="Previous price"
                hint="Shows the product as on sale."
                inputMode="decimal"
                leading="$"
                value={draft.compareAtPrice}
                onChange={(e) => set('compareAtPrice', e.target.value)}
                {...field('compareAtPrice')}
              />
            </div>
          </fieldset>

          <fieldset className={styles.panel}>
            <legend className={styles.legend}>
              <HeadingIcon icon={Layers} />
              Options and stock
            </legend>
            {product ? (
              <p className={styles.muted}>
                Options can't change once a product exists, so bags and past orders keep pointing at real items.
              </p>
            ) : (
              <TextArea
                label="Options"
                id={fieldId('optionsText')}
                hint='One per line, such as "Color: Oat, Ink". Up to two; leave empty for a single item.'
                value={draft.optionsText}
                error={errors.optionsText}
                onChange={(value) => set('optionsText', value)}
              />
            )}
            <div className={styles.tableWrap}>
              <table className={styles.table} id={fieldId('variants')} tabIndex={-1} aria-describedby={errors.variants ? 'variants-error' : undefined}>
                <caption className="visually-hidden">Stock and price for each option</caption>
                <thead>
                  <tr>
                    <th scope="col">Option</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Own price</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.variants.map((row, index) => {
                    const label = Object.values(row.options).join(' / ') || 'Single item';
                    return (
                      <tr key={JSON.stringify(row.options)}>
                        <th scope="row">{label}</th>
                        <td>
                          <input
                            className={styles.cellInput}
                            inputMode="numeric"
                            aria-label={`Stock for ${label}`}
                            value={row.stock}
                            onChange={(e) => setVariant(index, 'stock', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.cellInput}
                            inputMode="decimal"
                            placeholder="Same as product"
                            aria-label={`Price for ${label}`}
                            value={row.price}
                            onChange={(e) => setVariant(index, 'price', e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {errors.variants && (
              <p id="variants-error" className={styles.error}>
                {errors.variants}
              </p>
            )}
          </fieldset>
        </div>

        <aside className={styles.formSide}>
          <fieldset className={styles.panel}>
            <legend className={styles.legend}>
              <HeadingIcon icon={Eye} />
              Visibility
            </legend>
            <SelectField
              label="Status"
              value={draft.status}
              options={STATUSES}
              onChange={(e) => set('status', e.target.value as ProductStatus)}
            />
          </fieldset>
          <fieldset className={styles.panel}>
            <legend className={styles.legend}>
              <HeadingIcon icon={Palette} />
              Artwork
            </legend>
            <ProductArt art={{ tint: draft.tint, motif: draft.motif }} className={styles.preview} />
            <div className={styles.pair}>
              <SelectField
                label="Backdrop"
                value={draft.tint}
                options={TINTS.map((value) => ({ value, label: capitalize(value) }))}
                onChange={(e) => set('tint', e.target.value as ProductDraft['tint'])}
              />
              <SelectField
                label="Object"
                value={draft.motif}
                options={MOTIFS.map((value) => ({ value, label: capitalize(value) }))}
                onChange={(e) => set('motif', e.target.value as ProductDraft['motif'])}
              />
            </div>
          </fieldset>
          <Button type="submit" loading={saving} className={styles.save}>
            {product ? 'Save changes' : 'Create product'}
          </Button>
        </aside>
      </form>
    </section>
  );
}

interface TextAreaProps {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
}

function TextArea({ label, id, value, onChange, hint, error }: TextAreaProps) {
  const helpId = hint || error ? `${id}-help` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        rows={4}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.value)}
      />
      {helpId && (
        <p id={helpId} className={error ? styles.error : styles.hint}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
