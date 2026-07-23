import { fetchDailySeries, lookupCompanyName, NoProviderConfiguredError } from './marketData';
import { ensureFreshHistory } from './priceSync';
import type {
  DataFreshness,
  PeriodKey,
  PerformanceSeries,
  PerformanceStats,
  WatchlistTickerPerformance,
} from './types';
import { alignByDate, alphaBetaCorrelation } from '@/lib/compute/regression';
import { annualizedReturn, maxDrawdown, sharpeRatio, volatility } from '@/lib/compute/risk';
import {
  dailyReturns,
  periodReturn,
  sliceToPeriod,
  toIndexedSeries,
  tradingDaySpan,
  type PricePoint,
} from '@/lib/compute/returns';
import { getAllPrices, upsertPrices } from '@/lib/storage/prices';
import * as watchlistStorage from '@/lib/storage/watchlist';

const BENCHMARK_TICKER = 'SPY';

// Derives freshness from the refresh outcome + cache state of a ticker's relevant
// tickers (itself, plus the fixed SPY benchmark it's always compared against).
function freshnessFor(
  tickers: string[],
  refreshOk: Record<string, boolean>,
  pricesByTicker: Record<string, PricePoint[]>
): DataFreshness {
  const unavailableTickers = tickers.filter((t) => (pricesByTicker[t]?.length ?? 0) === 0);
  const stale = tickers.some((t) => !refreshOk[t] && (pricesByTicker[t]?.length ?? 0) > 0);
  return { stale, unavailableTickers };
}

// A stored name equal to the ticker means the lookup at add-time failed (rate
// limit / offline / no match) and silently fell back — insertTicker uses INSERT
// OR IGNORE so that fallback would otherwise be stuck forever. Retry it here so
// a transient failure self-heals on a later load instead of showing the ticker
// as the name permanently.
async function resolveDisplayName(ticker: string, storedName: string): Promise<string> {
  if (storedName !== ticker) return storedName;
  try {
    const resolved = await lookupCompanyName(ticker);
    if (resolved !== ticker) {
      await watchlistStorage.updateName(ticker, resolved);
    }
    return resolved;
  } catch {
    return storedName;
  }
}

function buildPerformance(
  ticker: string,
  name: string,
  prices: PricePoint[],
  benchmarkPrices: PricePoint[],
  period: PeriodKey
): Omit<WatchlistTickerPerformance, 'dataFreshness'> {
  const { points: sliced, truncatedFrom } = sliceToPeriod(prices, period);
  const series: PerformanceSeries = { period, points: toIndexedSeries(sliced), truncatedFrom };

  const days = tradingDaySpan(sliced);
  const returnPct = periodReturn(sliced);
  const annReturn = annualizedReturn(returnPct, days);
  const vol = volatility(dailyReturns(sliced));
  const mdd = maxDrawdown(sliced.map((p) => p.close));
  const sharpe = sharpeRatio(annReturn, vol);

  const { points: benchSliced } = sliceToPeriod(benchmarkPrices, period);
  const { assetReturns, benchmarkReturns } = alignByDate(sliced, benchSliced);
  const { alpha, beta, correlation } = alphaBetaCorrelation(assetReturns, benchmarkReturns);

  const stats: PerformanceStats = { return: returnPct, volatility: vol, maxDrawdown: mdd, sharpe, alpha, beta, correlation };
  const last = sliced[sliced.length - 1];

  return { ticker, name, price: last ? last.close : 0, series, stats };
}

export interface WatchlistResult {
  items: WatchlistTickerPerformance[];
  benchmarkSeries: PerformanceSeries;
}

export async function listWatchlist(period: PeriodKey): Promise<WatchlistResult> {
  const refreshOk: Record<string, boolean> = {};
  refreshOk[BENCHMARK_TICKER] = await ensureFreshHistory(BENCHMARK_TICKER);
  const benchmarkPrices = await getAllPrices(BENCHMARK_TICKER);
  const { points: benchmarkSliced, truncatedFrom: benchmarkTruncatedFrom } = sliceToPeriod(
    benchmarkPrices,
    period
  );
  const benchmarkSeries: PerformanceSeries = {
    period,
    points: toIndexedSeries(benchmarkSliced),
    truncatedFrom: benchmarkTruncatedFrom,
  };

  const tickers = await watchlistStorage.listTickers();
  const items = await Promise.all(
    tickers.map(async ({ ticker, name }) => {
      refreshOk[ticker] = await ensureFreshHistory(ticker);
      const prices = await getAllPrices(ticker);
      const resolvedName = await resolveDisplayName(ticker, name);
      return {
        ...buildPerformance(ticker, resolvedName, prices, benchmarkPrices, period),
        dataFreshness: freshnessFor([ticker, BENCHMARK_TICKER], refreshOk, {
          [ticker]: prices,
          [BENCHMARK_TICKER]: benchmarkPrices,
        }),
      };
    })
  );
  return { items, benchmarkSeries };
}

export async function addWatchlistTicker(rawTicker: string): Promise<void> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) {
    throw new Error('Enter a ticker symbol');
  }
  let series: PricePoint[];
  try {
    series = await fetchDailySeries(ticker);
  } catch (err) {
    if (err instanceof NoProviderConfiguredError) throw err;
    throw new Error(`Unknown ticker: ${ticker}`);
  }
  await upsertPrices(ticker, series);
  const name = await lookupCompanyName(ticker);
  await watchlistStorage.insertTicker(ticker, name);
}

export async function removeWatchlistTicker(ticker: string): Promise<void> {
  await watchlistStorage.deleteTicker(ticker);
}
