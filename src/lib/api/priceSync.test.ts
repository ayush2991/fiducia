import { ensureFreshHistory, __resetPriceSyncStateForTests } from './priceSync';
import * as marketData from './marketData';
import * as prices from '@/lib/storage/prices';
import type { PricePoint } from './providers/types';

jest.mock('./marketData', () => ({ fetchDailySeries: jest.fn() }));
jest.mock('@/lib/storage/prices', () => ({ getLatestDate: jest.fn(), upsertPrices: jest.fn() }));

const mockFetchDailySeries = marketData.fetchDailySeries as jest.MockedFunction<
  typeof marketData.fetchDailySeries
>;
const mockGetLatestDate = prices.getLatestDate as jest.MockedFunction<typeof prices.getLatestDate>;
const mockUpsertPrices = prices.upsertPrices as jest.MockedFunction<typeof prices.upsertPrices>;

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetPriceSyncStateForTests();
  mockUpsertPrices.mockResolvedValue(undefined);
});

describe('ensureFreshHistory', () => {
  it('skips the fetch entirely when already fresh for today', async () => {
    mockGetLatestDate.mockResolvedValue(todayISODate());
    const ok = await ensureFreshHistory('SPY');
    expect(ok).toBe(true);
    expect(mockFetchDailySeries).not.toHaveBeenCalled();
  });

  it('fetches and upserts when stale, returning true on success', async () => {
    mockGetLatestDate.mockResolvedValue('2020-01-01');
    mockFetchDailySeries.mockResolvedValue([{ date: '2020-01-02', close: 1 }]);
    const ok = await ensureFreshHistory('SPY');
    expect(ok).toBe(true);
    expect(mockFetchDailySeries).toHaveBeenCalledTimes(1);
    expect(mockUpsertPrices).toHaveBeenCalledWith('SPY', [{ date: '2020-01-02', close: 1 }]);
  });

  it('returns false and leaves the cache untouched when the fetch fails but a cache exists', async () => {
    mockGetLatestDate.mockResolvedValue('2020-01-01');
    mockFetchDailySeries.mockRejectedValue(new Error('rate limited'));
    const ok = await ensureFreshHistory('SPY');
    expect(ok).toBe(false);
    expect(mockUpsertPrices).not.toHaveBeenCalled();
  });

  it('coalesces concurrent calls for the same ticker into a single underlying fetch', async () => {
    mockGetLatestDate.mockResolvedValue(null);
    const { promise, resolve } = deferred<PricePoint[]>();
    mockFetchDailySeries.mockReturnValue(promise);

    const call1 = ensureFreshHistory('SPY');
    const call2 = ensureFreshHistory('SPY');

    resolve([{ date: '2020-01-02', close: 1 }]);
    const [ok1, ok2] = await Promise.all([call1, call2]);

    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(mockFetchDailySeries).toHaveBeenCalledTimes(1);
    expect(mockUpsertPrices).toHaveBeenCalledTimes(1);
  });

  it('does not coalesce distinct tickers', async () => {
    mockGetLatestDate.mockResolvedValue(null);
    mockFetchDailySeries.mockResolvedValue([{ date: '2020-01-02', close: 1 }]);

    await Promise.all([ensureFreshHistory('SPY'), ensureFreshHistory('QQQ')]);

    expect(mockFetchDailySeries).toHaveBeenCalledTimes(2);
    expect(mockFetchDailySeries).toHaveBeenCalledWith('SPY');
    expect(mockFetchDailySeries).toHaveBeenCalledWith('QQQ');
  });

  it('caps the number of concurrent underlying fetches', async () => {
    mockGetLatestDate.mockResolvedValue(null);
    let inFlight = 0;
    let maxInFlight = 0;
    const deferreds: ReturnType<typeof deferred<PricePoint[]>>[] = [];
    mockFetchDailySeries.mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const d = deferred<PricePoint[]>();
      deferreds.push(d);
      return d.promise.finally(() => {
        inFlight -= 1;
      });
    });

    const tickers = Array.from({ length: 8 }, (_, i) => `T${i}`);
    const all = Promise.all(tickers.map((t) => ensureFreshHistory(t)));

    // Drain in waves: flush microtasks so the next batch has a chance to
    // start, then resolve whichever fetches are pending so the freed
    // concurrency slot lets the next batch begin.
    let resolvedCount = 0;
    for (let i = 0; i < 20 && resolvedCount < tickers.length; i++) {
      await Promise.resolve();
      while (resolvedCount < deferreds.length) {
        deferreds[resolvedCount].resolve([{ date: '2020-01-02', close: 1 }]);
        resolvedCount++;
      }
    }
    await all;
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(mockFetchDailySeries).toHaveBeenCalledTimes(8);
  });
});
