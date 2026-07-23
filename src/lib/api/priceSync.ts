import { fetchDailySeries } from './marketData';
import { getLatestDate, upsertPrices } from '@/lib/storage/prices';

const MAX_CONCURRENT_FETCHES = 3;

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Caps how many fetchDailySeries calls are in flight at once, application-wide,
// so a portfolio/watchlist with many tickers doesn't burst past a provider's
// per-minute rate limit.
let activeFetches = 0;
const waiters: (() => void)[] = [];

async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeFetches >= MAX_CONCURRENT_FETCHES) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  activeFetches += 1;
  try {
    return await fn();
  } finally {
    activeFetches -= 1;
    waiters.shift()?.();
  }
}

// Coalesces concurrent callers asking to refresh the same ticker on the same
// day into a single underlying fetch, keyed by ticker+date so a later day's
// call isn't blocked by a stale entry.
const inFlight = new Map<string, Promise<boolean>>();

// Refreshes a ticker's price history at most once per calendar day, serving
// whatever's cached in between (and on fetch failure) rather than erroring.
// Returns whether the ticker is fresh as of today.
export async function ensureFreshHistory(ticker: string): Promise<boolean> {
  const today = todayISODate();
  const latest = await getLatestDate(ticker);
  if (latest === today) return true;

  const key = `${ticker}:${today}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = withConcurrencyLimit(async () => {
    try {
      const series = await fetchDailySeries(ticker);
      const tail = latest === null ? series : series.filter((p) => p.date > latest);
      await upsertPrices(ticker, tail);
      return true;
    } catch (error) {
      // Fetch failed (offline / rate limit) — serve whatever is already cached.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`ensureFreshHistory: refresh failed for ${ticker}`, error);
      }
      return false;
    }
  }).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

export function __resetPriceSyncStateForTests(): void {
  inFlight.clear();
  activeFetches = 0;
  waiters.length = 0;
}
