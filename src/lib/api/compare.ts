import { fetchDailySeries } from './marketData';
import type { PeriodKey, PerformanceSeries, PerformanceStats, Portfolio, PortfolioPerformance } from './types';
import { combineWeightedSeries } from '@/lib/compute/backtest';
import { alignByDate, alphaBetaCorrelation } from '@/lib/compute/regression';
import { annualizedReturn, maxDrawdown, sharpeRatio, volatility } from '@/lib/compute/risk';
import { dailyReturns, periodReturn, sliceToPeriod, tradingDaySpan, type PricePoint } from '@/lib/compute/returns';
import * as portfolioStorage from '@/lib/storage/portfolios';
import { getAllPrices, getLatestDate, upsertPrices } from '@/lib/storage/prices';

const BENCHMARK_TICKER = 'SPY';

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

// PeriodKey is capped to what a single 'compact' fetch (~100 trading days) can back,
// so a once-a-day refresh is always enough — no separate full-history fetch needed.
async function ensureFreshHistory(ticker: string): Promise<void> {
  const today = todayISODate();
  const latest = await getLatestDate(ticker);
  if (latest === today) return;
  try {
    const series = await fetchDailySeries(ticker);
    const tail = latest === null ? series : series.filter((p) => p.date > latest);
    await upsertPrices(ticker, tail);
  } catch {
    // Fetch failed (offline / rate limit) — serve whatever is already cached, per spec §2/§5.
  }
}

function toApiPortfolio(row: portfolioStorage.PortfolioRow): Portfolio {
  return { id: row.id, name: row.name, type: row.type, holdings: row.holdings };
}

function buildPerformance(
  portfolio: Portfolio,
  pricesByTicker: Record<string, PricePoint[]>,
  benchmarkPrices: PricePoint[],
  period: PeriodKey
): PortfolioPerformance {
  const slicedByTicker: Record<string, PricePoint[]> = {};
  let truncatedFrom: string | undefined;
  for (const h of portfolio.holdings) {
    const { points, truncatedFrom: t } = sliceToPeriod(pricesByTicker[h.ticker] ?? [], period);
    slicedByTicker[h.ticker] = points;
    if (t && (!truncatedFrom || t > truncatedFrom)) truncatedFrom = t;
  }
  const combined = combineWeightedSeries(portfolio.holdings, slicedByTicker);
  const series: PerformanceSeries = { period, points: combined, truncatedFrom };

  const asClosePoints: PricePoint[] = combined.map((p) => ({ date: p.date, close: p.value }));
  const days = tradingDaySpan(asClosePoints);
  const returnPct = periodReturn(asClosePoints);
  const annReturn = annualizedReturn(returnPct, days);
  const vol = volatility(dailyReturns(asClosePoints));
  const mdd = maxDrawdown(asClosePoints.map((p) => p.close));
  const sharpe = sharpeRatio(annReturn, vol);

  const { points: benchSliced } = sliceToPeriod(benchmarkPrices, period);
  const { assetReturns, benchmarkReturns } = alignByDate(asClosePoints, benchSliced);
  const { alpha, beta, correlation } = alphaBetaCorrelation(assetReturns, benchmarkReturns);

  const stats: PerformanceStats = { return: returnPct, volatility: vol, maxDrawdown: mdd, sharpe, alpha, beta, correlation };
  return { portfolio, series, stats };
}

// All portfolios and benchmarks, overlaid — per spec §4 the Compare tab shows every
// entity by default and toggles visibility client-side rather than refetching.
export async function compareEntities(period: PeriodKey): Promise<PortfolioPerformance[]> {
  const rows = await portfolioStorage.getAllPortfolios();
  const portfolios = rows.map(toApiPortfolio);

  const tickers = new Set<string>([BENCHMARK_TICKER]);
  for (const p of portfolios) {
    for (const h of p.holdings) tickers.add(h.ticker);
  }
  await Promise.all([...tickers].map(ensureFreshHistory));

  const pricesByTicker: Record<string, PricePoint[]> = {};
  await Promise.all(
    [...tickers].map(async (ticker) => {
      pricesByTicker[ticker] = await getAllPrices(ticker);
    })
  );

  const benchmarkPrices = pricesByTicker[BENCHMARK_TICKER] ?? [];
  return portfolios.map((portfolio) => buildPerformance(portfolio, pricesByTicker, benchmarkPrices, period));
}
