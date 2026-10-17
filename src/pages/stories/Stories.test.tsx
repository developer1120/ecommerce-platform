import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CATALOG } from '@/data/catalog';
import { axeViolations } from '@/test/axe';
import { renderRoute } from '@/test/renderRoute';

const main = () => within(screen.getByRole('main'));
const cardTitles = (container: HTMLElement) => within(container).getAllByRole('article').map((card) => within(card).getByRole('heading').textContent);

describe('the journal', () => {
  it('leads with the newest story and filters by topic', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/journal');
    expect(await main().findByRole('heading', { level: 1, name: 'Stories from the studio' })).toBeInTheDocument();
    const stories = main().getByRole('region', { name: 'All stories' });
    expect(cardTitles(stories)[0]).toBe('Setting an autumn table');
    expect(cardTitles(stories)).toHaveLength(6);

    await user.click(main().getByRole('button', { name: 'Makers, 2 stories' }));
    expect(router.state.location.search).toBe('?tag=makers');
    expect(cardTitles(main().getByRole('region', { name: 'Stories about makers' }))).toEqual(['A weekend at the kiln', 'A repair for life']);
    await user.click(main().getByRole('button', { name: 'All' }));
    expect(router.state.location.search).toBe('');
  });

  it('shows a story with its products, maker and what to read next', async () => {
    const user = userEvent.setup();
    renderRoute('/journal/a-weekend-at-the-kiln');
    expect(await main().findByRole('heading', { level: 1, name: 'A weekend at the kiln' })).toBeInTheDocument();
    expect(main().getByText('By Noor Haddad · ', { exact: false })).toHaveTextContent('September 28, 2026 · 1 min read');
    expect(main().getByRole('blockquote')).toHaveTextContent('After that, the kiln decides what it looks like.');

    const shop = await main().findByRole('region', { name: 'From this firing' });
    expect(within(shop).getAllByRole('article')).toHaveLength(3);
    expect(within(shop).getByRole('link', { name: /Stoneware mug set/ })).toHaveAttribute('href', '/product/stoneware-mug-set');

    const pager = main().getByRole('navigation', { name: 'More stories' });
    expect(within(pager).getByRole('link', { name: /Newer.*Setting an autumn table/ })).toBeInTheDocument();
    expect(within(pager).getByRole('link', { name: /Older.*How to wash linen/ })).toBeInTheDocument();
    expect(cardTitles(main().getByRole('region', { name: 'Read next' }))).toHaveLength(3);

    await user.click(main().getByRole('link', { name: 'Meet Hollow Kiln' }));
    expect(await main().findByRole('heading', { level: 1, name: 'Hollow Kiln' })).toBeInTheDocument();
  });

  it('leaves out products that are no longer on sale', async () => {
    const mug = CATALOG.find((product) => product.id === 'hk-mug')!;
    mug.status = 'archived';
    try {
      renderRoute('/journal/a-weekend-at-the-kiln');
      const shop = await main().findByRole('region', { name: 'From this firing' });
      await waitFor(() => expect(within(shop).getAllByRole('article')).toHaveLength(2));
      expect(within(shop).queryByRole('link', { name: /Stoneware mug set/ })).not.toBeInTheDocument();
    } finally {
      delete mug.status;
    }
  });

  it('shows the missing page for an unknown story', async () => {
    renderRoute('/journal/nothing-here');
    expect(await main().findByRole('heading', { level: 1, name: 'This page has wandered off' })).toBeInTheDocument();
  });
});

describe('our story and makers', () => {
  it('tells the story with live figures and links onwards', async () => {
    renderRoute('/about');
    expect(await main().findByRole('heading', { level: 1, name: 'Fewer, better things' })).toBeInTheDocument();
    const figures = main().getByText('Pieces in the shop').closest('div')!;
    await waitFor(() => expect(figures).toHaveTextContent(String(CATALOG.length)));
    expect(main().getByText('Independent makers').closest('div')).toHaveTextContent('10');
    expect(main().getByRole('link', { name: /All 10 makers/ })).toHaveAttribute('href', '/about/makers');
    expect(cardTitles(main().getByRole('region', { name: 'From the journal' }))).toEqual([
      'Setting an autumn table',
      'A weekend at the kiln',
    ]);
  });

  it('lists the makers, filtered by department', async () => {
    const user = userEvent.setup();
    renderRoute('/about/makers');
    const grid = await main().findByRole('region', { name: 'Makers' });
    expect(within(grid).getAllByRole('article')).toHaveLength(10);
    await waitFor(() => expect(within(grid).getByRole('article', { name: 'Hollow Kiln' })).toHaveTextContent('3 pieces in the shop'));

    await user.click(main().getByRole('button', { name: 'Beauty' }));
    expect(cardTitles(main().getByRole('region', { name: 'Makers' }))).toEqual(['Rosa Apothecary', 'Oat and Ash']);
  });

  it('shows a maker’s story, pieces and journal stories', async () => {
    renderRoute('/about/makers/north-wool');
    expect(await main().findByRole('heading', { level: 1, name: 'North Wool' })).toBeInTheDocument();
    expect(main().getByText('Making since 2012')).toBeInTheDocument();
    expect(await main().findByRole('heading', { name: '3 pieces by North Wool' })).toBeInTheDocument();
    expect(cardTitles(main().getByRole('region', { name: 'In the journal' }))).toEqual(['A repair for life']);
  });

  it('is reached from the footer', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await user.click(within(await screen.findByRole('contentinfo')).getByRole('link', { name: 'Makers' }));
    expect(await main().findByRole('heading', { level: 1, name: 'Our makers' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Journal' }));
    expect(await main().findByRole('heading', { level: 1, name: 'Stories from the studio' })).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it.each([
    ['/journal', 'Stories from the studio'],
    ['/journal/how-to-wash-linen', 'How to wash linen (and why it gets better)'],
    ['/about', 'Fewer, better things'],
    ['/about/makers', 'Our makers'],
    ['/about/makers/field-and-flax', 'Field and Flax'],
  ])('%s', async (path, title) => {
    renderRoute(path);
    await main().findByRole('heading', { level: 1, name: title });
    await waitFor(() => expect(main().queryByText('…')).not.toBeInTheDocument());
    expect(await axeViolations()).toEqual([]);
  });
});
