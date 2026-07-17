import { combineWeightedSeries, type PricePoint } from './backtest';

describe('combineWeightedSeries', () => {
  it('indexes the combined value to 100 at the first shared date', () => {
    const pricesByTicker: Record<string, PricePoint[]> = {
      AAA: [
        { date: '2026-01-01', close: 100 },
        { date: '2026-01-02', close: 110 },
      ],
      BBB: [
        { date: '2026-01-01', close: 50 },
        { date: '2026-01-02', close: 55 },
      ],
    };
    const result = combineWeightedSeries(
      [
        { ticker: 'AAA', weight: 50 },
        { ticker: 'BBB', weight: 50 },
      ],
      pricesByTicker
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '2026-01-01', value: 100 });
    // both legs return +10% that day, so a 50/50 blend also returns +10%
    expect(result[1].value).toBeCloseTo(110, 10);
  });

  it('weights each ticker leg by its normalized weight', () => {
    const pricesByTicker: Record<string, PricePoint[]> = {
      AAA: [
        { date: '2026-01-01', close: 100 },
        { date: '2026-01-02', close: 120 }, // +20%
      ],
      BBB: [
        { date: '2026-01-01', close: 100 },
        { date: '2026-01-02', close: 100 }, // 0%
      ],
    };
    const result = combineWeightedSeries(
      [
        { ticker: 'AAA', weight: 25 },
        { ticker: 'BBB', weight: 75 },
      ],
      pricesByTicker
    );
    // weighted return = 0.25 * 0.20 + 0.75 * 0 = 5%
    expect(result[1].value).toBeCloseTo(105, 10);
  });

  it('only combines dates present in every held ticker series', () => {
    const pricesByTicker: Record<string, PricePoint[]> = {
      AAA: [
        { date: '2026-01-01', close: 100 },
        { date: '2026-01-02', close: 110 },
        { date: '2026-01-03', close: 121 },
      ],
      BBB: [
        { date: '2026-01-01', close: 50 },
        { date: '2026-01-03', close: 50 }, // missing 2026-01-02
      ],
    };
    const result = combineWeightedSeries(
      [
        { ticker: 'AAA', weight: 50 },
        { ticker: 'BBB', weight: 50 },
      ],
      pricesByTicker
    );
    expect(result.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-03']);
  });

  it('returns an empty series with no holdings or zero total weight', () => {
    expect(combineWeightedSeries([], {})).toEqual([]);
    expect(
      combineWeightedSeries([{ ticker: 'AAA', weight: 0 }], { AAA: [{ date: '2026-01-01', close: 100 }] })
    ).toEqual([]);
  });
});
