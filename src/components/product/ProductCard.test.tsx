import { render, screen, within } from '@testing-library/react';
import { defineProduct, type ProductSeed } from '@/data/defineProduct';
import { renderWithProviders } from '@/test/renderRoute';
import { Price } from './Price';
import { ProductArt } from './ProductArt';
import { ProductCard } from './ProductCard';
import { Rating } from './Rating';

function product(overrides: Partial<ProductSeed> = {}) {
  return defineProduct({
    code: 'T-CARD',
    slug: 'test-mug',
    name: 'Test mug',
    maker: 'Test Kiln',
    department: 'home',
    type: 'Tableware',
    summary: '',
    description: '',
    details: [],
    price: 3840,
    tags: [],
    rating: { average: 4.66, count: 1280 },
    addedAt: '2026-01-01',
    art: { tint: 'lilac', motif: 'cup' },
    stock: 20,
    ...overrides,
  });
}

function renderCard(overrides: Partial<ProductSeed> = {}) {
  return renderWithProviders(<ProductCard product={product(overrides)} />);
}

describe('ProductCard', () => {
  it('links the whole card to the product page', () => {
    renderCard();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/product/test-mug');
    expect(within(link).getByRole('heading', { level: 3, name: 'Test mug' })).toBeInTheDocument();
    expect(link).toHaveTextContent('Test Kiln');
  });

  it('shows the sale badge, sale price and struck-through old price', () => {
    renderCard({ compareAtPrice: 4800 });
    expect(screen.getByText('−20%')).toHaveAttribute('data-tone', 'sale');
    expect(screen.getByText('$38.40', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('$48', { exact: false }).closest('s')).not.toBeNull();
  });

  it('marks new arrivals', () => {
    renderCard({ addedAt: '2026-10-01' });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('prefers the sale badge over the new badge', () => {
    renderCard({ addedAt: '2026-10-01', compareAtPrice: 4800 });
    expect(screen.getByText('−20%')).toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('marks sold-out products above everything else and mutes the art', () => {
    const { container } = renderCard({ stock: 0, compareAtPrice: 4800, addedAt: '2026-10-01' });
    expect(screen.getByText('Sold out')).toBeInTheDocument();
    expect(screen.queryByText('−20%')).not.toBeInTheDocument();
    expect(container.querySelector('[data-muted]')).not.toBeNull();
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
  });

  it('warns when only a few are left', () => {
    renderCard({ stock: 3 });
    expect(screen.getByText('Only 3 left')).toBeInTheDocument();
  });

  it('does not warn with plenty of stock', () => {
    renderCard({ stock: 6 });
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
  });

  it('lists up to four color swatches and counts the rest', () => {
    const colors = ['Oat', 'Ink', 'Sage', 'Plum', 'Lime', 'Rose'];
    renderCard({
      options: [{ name: 'Color', values: colors.map((value) => ({ value, swatch: '#cccccc' })) }],
      stock: 4,
    });
    const swatches = screen.getByRole('list', { name: '6 colors' });
    expect(within(swatches).getAllByRole('listitem')).toHaveLength(5);
    expect(swatches).toHaveTextContent('+2');
    expect(within(swatches).getByText('Oat')).toBeInTheDocument();
  });

  it('shows no swatches for options without colors', () => {
    renderCard({ options: [{ name: 'Size', values: [{ value: 'S' }, { value: 'M' }] }], stock: 9 });
    expect(within(screen.getByRole('article')).queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('Price', () => {
  it('shows a single price', () => {
    render(<Price product={product()} />);
    expect(screen.getByRole('paragraph')).toHaveTextContent(/^\$38\.40$/);
  });

  it('says "From" when variants cost different amounts', () => {
    render(
      <Price
        product={product({
          options: [{ name: 'Size', values: [{ value: 'Small' }, { value: 'Large' }] }],
          pricesByValue: { Large: 6800 },
          stock: 1,
        })}
      />,
    );
    expect(screen.getByRole('paragraph')).toHaveTextContent('From $38.40');
  });

  it('reads a sale out in words for screen readers', () => {
    render(<Price product={product({ compareAtPrice: 4800 })} />);
    expect(screen.getByRole('paragraph')).toHaveTextContent('Sale price $38.40 was $48');
  });
});

describe('Rating', () => {
  it('reads as a sentence and shows a compact form', () => {
    render(<Rating average={4.66} count={1280} />);
    expect(screen.getByText('Rated 4.7 out of 5 from 1,280 reviews')).toBeInTheDocument();
    expect(screen.getByText('(1,280)')).toBeInTheDocument();
  });

  it('uses the singular for one review', () => {
    render(<Rating average={5} count={1} />);
    expect(screen.getByText('Rated 5.0 out of 5 from 1 review')).toBeInTheDocument();
  });

  it('says when there are no reviews', () => {
    render(<Rating average={0} count={0} />);
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
  });
});

describe('ProductArt', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<ProductArt art={{ tint: 'sage', motif: 'garment' }} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).toHaveAttribute('data-tint', 'sage');
  });

  it('paints the object in the chosen color', () => {
    const { container } = render(<ProductArt art={{ tint: 'sand', motif: 'bar' }} color="#123456" />);
    expect(container.querySelector('[fill="#123456"]')).not.toBeNull();
  });

  it.each(['vessel', 'cup', 'fold', 'stack', 'jar', 'bottle', 'bar', 'garment', 'round', 'flame'] as const)(
    'draws the %s motif',
    (motif) => {
      const { container } = render(<ProductArt art={{ tint: 'lilac', motif }} />);
      // The shadow plus at least one shape.
      expect(container.querySelector('svg')!.children.length).toBeGreaterThan(1);
    },
  );
});
