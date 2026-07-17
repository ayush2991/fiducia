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
  it('subtracts calendar days for fixed-length periods', () => {
    expect(periodStartDate('7D', '2026-07-17')).toBe('2026-07-10');
    expect(periodStartDate('30D', '2026-07-17')).toBe('2026-06-17');
  });

  it('subtracts calendar days for 3M', () => {
    expect(periodStartDate('3M', '2026-07-17')).toBe('2026-04-18');
  });
});

describe('sliceToPeriod', () => {
  const prices: PricePoint[] = [
    { date: '2026-01-01', close: 100 },
    { date: '2026-01-05', close: 105 },
    { date: '2026-01-10', close: 110 },
  ];

  it('returns an empty slice with no truncation note for empty input', () => {
    expect(sliceToPeriod([], '7D')).toEqual({ points: [] });
  });

  it('includes only points on/after the period start, using the last point as "today"', () => {
    const result = sliceToPeriod(prices, '7D');
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
