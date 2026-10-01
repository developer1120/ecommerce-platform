import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIT_PROFILE_KEY } from '@/domain/sizing';
import { renderRoute } from '@/test/renderRoute';

const SHIRT = 'relaxed-linen-shirt';
const TROUSERS = 'wide-leg-cord-trousers';

async function openGuide(slug: string, link: 'Size guide' | 'Find my size') {
  const user = userEvent.setup();
  const view = renderRoute(`/product/${slug}`);
  await user.click(await screen.findByRole('button', { name: link }));
  const dialog = screen.getByRole('dialog', { name: 'Size guide' });
  return { user, dialog, ...view };
}

const sizeRadio = (size: string) => screen.getByRole('radio', { name: new RegExp(`^${size}(,|$)`) });

describe('the size guide', () => {
  it('shows the fit note and the chart for the sizes on offer', async () => {
    const { user, dialog } = await openGuide(SHIRT, 'Size guide');
    expect(screen.getByText(/Relaxed fit with a dropped shoulder/)).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Size chart' })).toHaveAttribute('aria-selected', 'true');

    const table = within(dialog).getByRole('table', { name: /Tops and knitwear: body measurements in centimetres/ });
    expect(within(table).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(within(table).getByRole('row', { name: /^M / })).toHaveTextContent('95–101');

    await user.click(within(dialog).getByRole('radio', { name: 'Inches' }));
    expect(within(dialog).getByRole('table', { name: /in inches/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('row', { name: /^M / })).toHaveTextContent('37.5–40');
    expect(within(dialog).getByText(/fullest part of your chest/)).toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys', async () => {
    const { user, dialog } = await openGuide(SHIRT, 'Size guide');
    within(dialog).getByRole('tab', { name: 'Size chart' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByRole('tab', { name: 'Find my size' })).toHaveFocus();
    expect(within(dialog).getByRole('tabpanel', { name: 'Find my size' })).toBeInTheDocument();
  });

  it('is not offered for products without sizes', async () => {
    renderRoute('/product/stoneware-mug-set');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Size guide' })).not.toBeInTheDocument();
  });
});

describe('the fit finder', () => {
  it('checks the measurement, recommends a size and picks it on the page', async () => {
    const { user, dialog, router } = await openGuide(SHIRT, 'Find my size');
    await user.click(within(dialog).getByRole('button', { name: 'Find my size' }));
    expect(within(dialog).getByText('Enter your chest measurement')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Chest (cm)'), '94.5');
    await user.click(within(dialog).getByRole('button', { name: 'Find my size' }));
    const result = await within(dialog).findByRole('region', { name: 'Your size' });
    expect(result).toHaveTextContent('Your size: M');
    expect(result).toHaveTextContent('Your chest points to M. You are between sizes, so we went up one.');

    await user.click(within(dialog).getByRole('radio', { name: 'Closer' }));
    expect(within(dialog).queryByRole('region', { name: 'Your size' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Find my size' }));
    expect(await within(dialog).findByRole('region', { name: 'Your size' })).toHaveTextContent('We moved to S for the fit you like.');

    await user.click(within(dialog).getByRole('button', { name: 'Choose S' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Size S selected')).toBeInTheDocument();
    await waitFor(() => expect(sizeRadio('S')).toBeChecked());
    expect(router.state.location.search).toMatch(/variant=ff-shirt-[a-z]+-s$/);
  });

  it('uses waist and hip for trousers, in inches, and remembers them', async () => {
    const { user, dialog } = await openGuide(TROUSERS, 'Find my size');
    await user.click(within(dialog).getByRole('radio', { name: 'Inches' }));
    await user.type(within(dialog).getByLabelText('Waist (in)'), '28');
    await user.type(within(dialog).getByLabelText('Hip (in)'), '40');
    await user.click(within(dialog).getByRole('button', { name: 'Find my size' }));
    // A 28 in waist is size 28, but a 40 in (101.6 cm) hip needs 32.
    expect(await within(dialog).findByRole('region', { name: 'Your size' })).toHaveTextContent('Your hip points to 32.');
    expect(JSON.parse(localStorage.getItem(FIT_PROFILE_KEY)!)).toEqual({ unit: 'in', values: { waist: '28', hip: '40' }, preference: 'true' });
  });

  it('fills in saved measurements next time', async () => {
    localStorage.setItem(FIT_PROFILE_KEY, JSON.stringify({ unit: 'cm', values: { chest: '112' }, preference: 'roomier' }));
    const { dialog } = await openGuide(SHIRT, 'Find my size');
    expect(within(dialog).getByLabelText('Chest (cm)')).toHaveValue('112');
    expect(within(dialog).getByRole('radio', { name: 'Roomier' })).toBeChecked();
  });
});
