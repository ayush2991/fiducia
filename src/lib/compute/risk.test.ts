import { annualizedReturn, maxDrawdown, sharpeRatio, volatility } from './risk';

describe('annualizedReturn', () => {
  it('returns 0 when days is 0', () => {
    expect(annualizedReturn(10, 0)).toBe(0);
  });

  it('annualizes a one-year return unchanged', () => {
    expect(annualizedReturn(10, 365)).toBeCloseTo(10, 5);
  });

  it('scales up a short-period return when annualized', () => {
    // 5% over 30 days compounds to well over 5% annualized
    expect(annualizedReturn(5, 30)).toBeGreaterThan(5);
  });
});

describe('volatility', () => {
  it('returns 0 for fewer than two returns', () => {
    expect(volatility([])).toBe(0);
    expect(volatility([0.01])).toBe(0);
  });

  it('returns 0 for a constant return series', () => {
    expect(volatility([0.01, 0.01, 0.01, 0.01])).toBeCloseTo(0, 10);
  });

  it('is positive for a varying return series', () => {
    expect(volatility([0.02, -0.01, 0.015, -0.02, 0.01])).toBeGreaterThan(0);
  });
});

describe('maxDrawdown', () => {
  it('returns 0 for a monotonically increasing series', () => {
    expect(maxDrawdown([100, 105, 110, 120])).toBe(0);
  });

  it('returns the largest peak-to-trough decline as a negative percent', () => {
    // peak 120 -> trough 90 is a 25% drawdown
    expect(maxDrawdown([100, 120, 90, 95, 110])).toBeCloseTo(-25, 5);
  });

  it('returns 0 for empty input', () => {
    expect(maxDrawdown([])).toBe(0);
  });
});

describe('sharpeRatio', () => {
  it('returns 0 when volatility is 0', () => {
    expect(sharpeRatio(10, 0)).toBe(0);
  });

  it('computes excess return over the hardcoded 4% risk-free rate, divided by volatility', () => {
    expect(sharpeRatio(14, 10)).toBeCloseTo(1, 5);
  });

  it('is negative when return is below the risk-free rate', () => {
    expect(sharpeRatio(0, 10)).toBeLessThan(0);
  });
});
