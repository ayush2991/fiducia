// Capped to what Alpha Vantage's free-tier TIME_SERIES_DAILY (compact = last ~100
// trading days) can actually back — outputsize=full is a premium-only feature, so
// longer periods (YTD/1Y/5Y/MAX) would silently be mislabeled with partial data.
export type PeriodKey = '1D' | '7D' | '30D' | '3M';

export const PERIODS: PeriodKey[] = ['1D', '7D', '30D', '3M'];

export const DEFAULT_PERIOD: PeriodKey = '3M';

export interface Holding {
  ticker: string;
  weight: number; // 0–100, normalized
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
  sharpe: number;
  alpha: number;
  beta: number;
  correlation: number;
}

export interface WatchlistTickerPerformance {
  ticker: string;
  name: string;
  price: number; // latest cached close, for display — series.points are indexed to 100, not dollars
  series: PerformanceSeries;
  stats: PerformanceStats;
}
