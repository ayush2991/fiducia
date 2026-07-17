export type PeriodKey = '1D' | '7D' | '30D' | '3M' | 'YTD' | '1Y' | '5Y' | 'MAX';

export const PERIODS: PeriodKey[] = ['1D', '7D', '30D', '3M', 'YTD', '1Y', '5Y', 'MAX'];

export const DEFAULT_PERIOD: PeriodKey = '1Y';

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
