import { annualizedReturn, maxDrawdown, sharpeRatio, volatility } from './risk';

describe('annualizedReturn', () => {
  it('returns 0 when days is 0', () => {
    expect(annualizedReturn(10, 0, false)).toBe(0);
  });

  it('annualizes a one-year return unchanged', () => {
    expect(annualizedReturn(10, 365, false)).toBeCloseTo(10, 5);
  });

  it('scales up a short-period return when annualized', () => {
    // 5% over 30 days compounds to well over 5% annualized
    expect(annualizedReturn(5, 30, false)).toBeGreaterThan(5);
  });

  it('returns null when history is truncated and the actual span is below the minimum', () => {
    // e.g. a brand-new ticker with only 5 real days of history behind a 3M view
    expect(annualizedReturn(5, 5, true)).toBeNull();
  });

  it('still annualizes when truncated but the actual span meets the minimum', () => {
    expect(annualizedReturn(5, 30, true)).toBeGreaterThan(5);
  });

  it('is unaffected by truncation for an untruncated short period like 7D', () => {
    // isTruncated=false means the ticker itself has plenty of history —
    // the user just picked a short period, which should behave as before
    expect(annualizedReturn(2, 7, false)).toBeGreaterThan(2);
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

  it('returns null when annualized return is unavailable', () => {
    expect(sharpeRatio(null, 10)).toBeNull();
  });
});
