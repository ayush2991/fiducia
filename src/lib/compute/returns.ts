import type { PeriodKey } from '@/lib/api/types';

export type PricePoint = { date: string; close: number };

const PERIOD_DAYS: Partial<Record<PeriodKey, number>> = {
  '1D': 1,
  '7D': 7,
  '30D': 30,
  '3M': 90,
  '1Y': 365,
  '5Y': 365 * 5,
};

export function periodStartDate(period: PeriodKey, referenceDate: string): string {
  if (period === 'MAX') return '0000-01-01';
  const ref = new Date(`${referenceDate}T00:00:00Z`);
  if (period === 'YTD') return `${ref.getUTCFullYear()}-01-01`;
  const days = PERIOD_DAYS[period]!;
  const start = new Date(ref);
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString().slice(0, 10);
}

export function sliceToPeriod(
  prices: PricePoint[],
  period: PeriodKey,
  referenceDate?: string
): { points: PricePoint[]; truncatedFrom?: string } {
  if (prices.length === 0) return { points: [] };
  const today = referenceDate ?? prices[prices.length - 1].date;
  const start = periodStartDate(period, today);
  const points = prices.filter((p) => p.date >= start);
  const truncatedFrom = points.length > 0 && points[0].date > start ? points[0].date : undefined;
  return { points, truncatedFrom };
}

export function toIndexedSeries(points: PricePoint[]): { date: string; value: number }[] {
  if (points.length === 0) return [];
  const base = points[0].close;
  return points.map((p) => ({ date: p.date, value: base === 0 ? 100 : (p.close / base) * 100 }));
}

export function periodReturn(points: PricePoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0].close;
  const last = points[points.length - 1].close;
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

export function dailyReturns(points: PricePoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].close;
    if (prev !== 0) out.push((points[i].close - prev) / prev);
  }
  return out;
}

export function tradingDaySpan(points: { date: string }[]): number {
  if (points.length < 2) return 0;
  const start = new Date(`${points[0].date}T00:00:00Z`).getTime();
  const end = new Date(`${points[points.length - 1].date}T00:00:00Z`).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}
