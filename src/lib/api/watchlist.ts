import { fetchDailySeries, lookupCompanyName } from './marketData';
import type { PeriodKey, PerformanceSeries, PerformanceStats, WatchlistTickerPerformance } from './types';
import { alignByDate, alphaBetaCorrelation } from '@/lib/compute/regression';
import { annualizedReturn, maxDrawdown, sharpeRatio, volatility } from '@/lib/compute/risk';
import {
  dailyReturns,
  periodReturn,
  periodStartDate,
  sliceToPeriod,
  toIndexedSeries,
  tradingDaySpan,
  type PricePoint,
} from '@/lib/compute/returns';
import * as priceMetaStorage from '@/lib/storage/priceMeta';
import { getAllPrices, getEarliestDate, getLatestDate, upsertPrices } from '@/lib/storage/prices';
import * as watchlistStorage from '@/lib/storage/watchlist';

const BENCHMARK_TICKER = 'SPY';

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ensureFreshHistory(ticker: string, period: PeriodKey): Promise<void> {
  const today = todayISODate();

  const latest = await getLatestDate(ticker);
  if (latest !== today) {
    try {
      const series = await fetchDailySeries(ticker, 'compact');
      const tail = latest === null ? series : series.filter((p) => p.date > latest);
      await upsertPrices(ticker, tail);
    } catch {
      // Fetch failed (offline / rate limit) — serve whatever is already cached, per spec §2/§5.
    }
  }

  const requiredStart = periodStartDate(period, today);
  const earliest = await getEarliestDate(ticker);
  const fullFetchedOn = await priceMetaStorage.getFullFetchedOn(ticker);
  const needsFullHistory = (earliest === null || earliest > requiredStart) && fullFetchedOn !== today;
  if (needsFullHistory) {
    try {
      const full = await fetchDailySeries(ticker, 'full');
      await upsertPrices(ticker, full);
      await priceMetaStorage.setFullFetchedOn(ticker, today);
    } catch {
      // Fetch failed (offline / rate limit) — serve whatever is already cached, per spec §2/§5.
    }
  }
}

function buildPerformance(
  ticker: string,
  name: string,
  prices: PricePoint[],
  benchmarkPrices: PricePoint[],
  period: PeriodKey
): WatchlistTickerPerformance {
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

export async function listWatchlist(period: PeriodKey): Promise<WatchlistTickerPerformance[]> {
  await ensureFreshHistory(BENCHMARK_TICKER, period);
  const benchmarkPrices = await getAllPrices(BENCHMARK_TICKER);

  const tickers = await watchlistStorage.listTickers();
  return Promise.all(
    tickers.map(async ({ ticker, name }) => {
      await ensureFreshHistory(ticker, period);
      const prices = await getAllPrices(ticker);
      return buildPerformance(ticker, name, prices, benchmarkPrices, period);
    })
  );
}

export async function addWatchlistTicker(rawTicker: string): Promise<void> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) {
    throw new Error('Enter a ticker symbol');
  }
  let series: PricePoint[];
  try {
    series = await fetchDailySeries(ticker, 'compact');
  } catch {
    throw new Error(`Unknown ticker: ${ticker}`);
  }
  await upsertPrices(ticker, series);
  const name = await lookupCompanyName(ticker);
  await watchlistStorage.insertTicker(ticker, name);
}

export async function removeWatchlistTicker(ticker: string): Promise<void> {
  await watchlistStorage.deleteTicker(ticker);
}
