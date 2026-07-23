import {
  dailyReturns,
  periodReturn,
  periodStartDate,
  sliceToPeriod,
  toIndexedSeries,
  tradingDaySpan,
  type PricePoint,
} from './returns';

describe('periodStartDate', () => {
  it('subtracts calendar days for 1D and 1W', () => {
    expect(periodStartDate('1D', '2026-07-17')).toBe('2026-07-16');
    expect(periodStartDate('1W', '2026-07-17')).toBe('2026-07-10');
  });

  it('subtracts calendar months for 1M/3M/6M', () => {
    expect(periodStartDate('1M', '2026-07-17')).toBe('2026-06-17');
    expect(periodStartDate('3M', '2026-07-17')).toBe('2026-04-17');
    expect(periodStartDate('6M', '2026-07-17')).toBe('2026-01-17');
  });

  it('starts YTD at January 1 of the reference year', () => {
    expect(periodStartDate('YTD', '2026-07-17')).toBe('2026-01-01');
  });

  it('subtracts calendar years for 1Y/3Y/5Y', () => {
    expect(periodStartDate('1Y', '2026-07-17')).toBe('2025-07-17');
    expect(periodStartDate('3Y', '2026-07-17')).toBe('2023-07-17');
    expect(periodStartDate('5Y', '2026-07-17')).toBe('2021-07-17');
  });

  it('does not drift across a leap day for year-based periods', () => {
    // 2024 was a leap year; naive day-multiplication (365*N) would land
    // one day off from the true calendar date for a reference date after Feb 29.
    expect(periodStartDate('1Y', '2025-03-01')).toBe('2024-03-01');
    expect(periodStartDate('3Y', '2025-03-01')).toBe('2022-03-01');
  });
});

describe('sliceToPeriod', () => {
  const prices: PricePoint[] = [
    { date: '2026-01-01', close: 100 },
    { date: '2026-01-05', close: 105 },
    { date: '2026-01-10', close: 110 },
  ];

  it('returns an empty slice with no truncation note for empty input', () => {
    expect(sliceToPeriod([], '1W')).toEqual({ points: [] });
  });

  it('includes only points on/after the period start, using the last point as "today"', () => {
    const result = sliceToPeriod(prices, '1W');
    expect(result.points).toEqual([
      { date: '2026-01-05', close: 105 },
      { date: '2026-01-10', close: 110 },
    ]);
  });

  it('sets truncatedFrom when the earliest available point is after the requested start', () => {
    const result = sliceToPeriod(prices, '3M');
    expect(result.points).toEqual(prices);
    expect(result.truncatedFrom).toBe('2026-01-01');
  });
});

describe('toIndexedSeries', () => {
  it('indexes the first point to 100 and scales the rest proportionally', () => {
    const points: PricePoint[] = [
      { date: '2026-01-01', close: 50 },
      { date: '2026-01-02', close: 55 },
    ];
    const result = toIndexedSeries(points);
    expect(result[0]).toEqual({ date: '2026-01-01', value: 100 });
    expect(result[1].date).toBe('2026-01-02');
    expect(result[1].value).toBeCloseTo(110, 10);
  });

  it('returns an empty array for empty input', () => {
    expect(toIndexedSeries([])).toEqual([]);
  });
});

describe('periodReturn', () => {
  it('computes percent change from first to last close', () => {
    const points: PricePoint[] = [
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 110 },
    ];
    expect(periodReturn(points)).toBe(10);
  });

  it('returns 0 for fewer than two points', () => {
    expect(periodReturn([])).toBe(0);
  });
});

describe('dailyReturns', () => {
  it('computes day-over-day fractional returns', () => {
    const points: PricePoint[] = [
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 110 },
      { date: '2026-01-03', close: 99 },
    ];
    const result = dailyReturns(points);
    expect(result[0]).toBeCloseTo(0.1, 10);
    expect(result[1]).toBeCloseTo(-0.1, 10);
  });
});

describe('tradingDaySpan', () => {
  it('returns the calendar day span between the first and last point', () => {
    const points = [{ date: '2026-01-01' }, { date: '2026-01-11' }];
    expect(tradingDaySpan(points)).toBe(10);
  });

  it('returns 0 for fewer than two points', () => {
    expect(tradingDaySpan([{ date: '2026-01-01' }])).toBe(0);
  });
});
