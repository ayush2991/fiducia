import { alignByDate, alphaBetaCorrelation, type PricePoint } from './regression';

describe('alignByDate', () => {
  it('only pairs dates present in both series, in order', () => {
    const asset: PricePoint[] = [
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 110 },
      { date: '2026-01-03', close: 121 },
    ];
    const benchmark: PricePoint[] = [
      { date: '2026-01-01', close: 200 },
      { date: '2026-01-03', close: 210 }, // 2026-01-02 missing from benchmark
    ];
    const result = alignByDate(asset, benchmark);
    // only one return pair possible: 2026-01-01 -> 2026-01-03
    expect(result.assetReturns).toHaveLength(1);
    expect(result.benchmarkReturns).toHaveLength(1);
    expect(result.assetReturns[0]).toBeCloseTo(0.21, 10); // 121/100 - 1
    expect(result.benchmarkReturns[0]).toBeCloseTo(0.05, 10); // 210/200 - 1
  });
});

describe('alphaBetaCorrelation', () => {
  it('returns beta=1, alpha=0, correlation=1 when asset returns exactly track the benchmark', () => {
    const benchmarkReturns = [0.01, -0.02, 0.015, -0.01, 0.02];
    const assetReturns = benchmarkReturns;
    const result = alphaBetaCorrelation(assetReturns, benchmarkReturns);
    expect(result.beta).toBeCloseTo(1, 5);
    expect(result.alpha).toBeCloseTo(0, 5);
    expect(result.correlation).toBeCloseTo(1, 5);
  });

  it('returns beta=2 when the asset moves exactly twice the benchmark', () => {
    const benchmarkReturns = [0.01, -0.02, 0.015, -0.01, 0.02];
    const assetReturns = benchmarkReturns.map((r) => r * 2);
    const result = alphaBetaCorrelation(assetReturns, benchmarkReturns);
    expect(result.beta).toBeCloseTo(2, 5);
    expect(result.correlation).toBeCloseTo(1, 5);
  });

  it('returns all zeros for fewer than two paired returns', () => {
    expect(alphaBetaCorrelation([0.01], [0.01])).toEqual({ alpha: 0, beta: 0, correlation: 0 });
  });
});
