import { CATALOG } from '@/data/catalog';
import { getProduct, listProducts } from './catalogApi';
import {
  ApiError,
  configureApi,
  configureApiFromSearch,
  getApiConfig,
  isAbortError,
  isApiError,
  simulateRequest,
} from './client';

describe('simulateRequest', () => {
  it('resolves with a deep copy, so callers cannot change the source data', async () => {
    const source = { name: 'Mug', tags: ['ceramic'] };
    const result = await simulateRequest(() => source);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    result.tags.push('changed');
    expect(source.tags).toEqual(['ceramic']);
  });

  it('fails with a network error at the configured rate', async () => {
    configureApi({ failureRate: 0.5, random: () => 0.2 });
    const error = await simulateRequest(() => 1).catch((caught: unknown) => caught);
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'NETWORK', status: 0 });

    configureApi({ random: () => 0.8 });
    await expect(simulateRequest(() => 1)).resolves.toBe(1);
  });

  it('passes errors thrown by the handler through unchanged', async () => {
    const notFound = new ApiError('NOT_FOUND', 'Gone');
    await expect(
      simulateRequest(() => {
        throw notFound;
      }),
    ).rejects.toBe(notFound);
  });

  it('rejects straight away when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const handler = vi.fn(() => 1);
    const error = await simulateRequest(handler, { signal: controller.signal }).catch((caught: unknown) => caught);
    expect(isAbortError(error)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  describe('with latency', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      configureApi({ latency: { min: 200, max: 600 }, random: () => 0.5 });
    });

    it('waits a delay between the configured bounds', async () => {
      const onDone = vi.fn();
      void simulateRequest(() => 'ok').then(onDone);

      await vi.advanceTimersByTimeAsync(399);
      expect(onDone).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(onDone).toHaveBeenCalledWith('ok');
    });

    it('stops waiting when the request is cancelled', async () => {
      const controller = new AbortController();
      const handler = vi.fn(() => 'ok');
      const pending = simulateRequest(handler, { signal: controller.signal }).catch((caught: unknown) => caught);

      await vi.advanceTimersByTimeAsync(100);
      controller.abort();
      expect(isAbortError(await pending)).toBe(true);
      await vi.runAllTimersAsync();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe('configureApiFromSearch', () => {
  it('reads latency and failure rate from the query string', () => {
    configureApiFromSearch('?latency=1500&fail=0.25');
    expect(getApiConfig().latency).toEqual({ min: 1500, max: 1500 });
    expect(getApiConfig().failureRate).toBe(0.25);
  });

  it('ignores values that make no sense', () => {
    configureApiFromSearch('?latency=-4&fail=3');
    expect(getApiConfig().latency).toEqual({ min: 0, max: 0 });
    expect(getApiConfig().failureRate).toBe(0);
  });
});

describe('catalog API', () => {
  it('lists every product without a query', async () => {
    expect(await listProducts()).toHaveLength(CATALOG.length);
  });

  it('lists a department', async () => {
    const products = await listProducts({ collection: 'beauty' });
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((product) => product.department === 'beauty')).toBe(true);
  });

  it('lists computed collections using today’s date', async () => {
    const fresh = await listProducts({ collection: 'new' });
    expect(fresh.map((product) => product.slug)).toContain('hand-thrown-bud-vase');
    expect(fresh.map((product) => product.slug)).not.toContain('organic-cotton-tee');

    const sale = await listProducts({ collection: 'sale' });
    expect(sale.every((product) => product.compareAtPrice! > product.price)).toBe(true);
  });

  it('returns products by id in the order asked, skipping unknown ids', async () => {
    const products = await listProducts({ ids: ['ra-soap', 'nope', 'hk-mug'] });
    expect(products.map((product) => product.id)).toEqual(['ra-soap', 'hk-mug']);
  });

  it('gets a product by slug', async () => {
    const product = await getProduct('rose-clay-mask');
    expect(product.name).toBe('Rose clay mask');
  });

  it('reports a missing product as NOT_FOUND', async () => {
    await expect(getProduct('unicorn-saddle')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
