// Capped to what every supported provider's free tier can actually back with full
// history — longer periods (YTD/1Y/5Y/MAX) would silently be mislabeled with partial data.
export type PeriodKey = '1D' | '7D' | '30D' | '3M';

export const PERIODS: PeriodKey[] = ['1D', '7D', '30D', '3M'];

export const DEFAULT_PERIOD: PeriodKey = '3M';

export interface Holding {
  ticker: string;
  weight: number; // 0–100, normalized
  name: string;
}

export interface Portfolio {
  id: string;
  name: string;
  type: 'user' | 'benchmark';
  holdings: Holding[];
}

export interface PortfolioPerformance {
  portfolio: Portfolio;
  series: PerformanceSeries;
  stats: PerformanceStats;
  dataFreshness: DataFreshness;
}

export interface PerformanceSeries {
  period: PeriodKey;
  points: { date: string; value: number }[]; // indexed to 100 at window start
  truncatedFrom?: string; // set when the window was clipped to available history
}

export interface PerformanceStats {
  return: number;
  volatility: number;
  maxDrawdown: number;
  sharpe: number | null;
  alpha: number;
  beta: number;
  correlation: number;
}

// Reflects whether a fetch attempt for one of this entity's relevant tickers
// (its holdings, plus whichever benchmark it's computed against) failed today.
export interface DataFreshness {
  stale: boolean; // a relevant ticker's refresh failed, but cached data exists — served that instead
  unavailableTickers: string[]; // relevant tickers with zero cached data after a failed fetch
}

export interface WatchlistTickerPerformance {
  ticker: string;
  name: string;
  price: number; // latest cached close, for display — series.points are indexed to 100, not dollars
  series: PerformanceSeries;
  stats: PerformanceStats;
  dataFreshness: DataFreshness;
}

export interface PortfolioDetailPerformance {
  portfolio: PortfolioPerformance;
  benchmark: PortfolioPerformance; // fixed to SPY for now — see docs/superpowers/plans/2026-07-22-overview-detail-screen.md
}
