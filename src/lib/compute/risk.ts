const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE_PCT = 4;

export function annualizedReturn(periodReturnPct: number, days: number): number {
  if (days <= 0) return 0;
  const growth = 1 + periodReturnPct / 100;
  if (growth <= 0) return -100;
  return (Math.pow(growth, 365 / days) - 1) * 100;
}

export function volatility(dailyReturnsList: number[]): number {
  if (dailyReturnsList.length < 2) return 0;
  const mean = dailyReturnsList.reduce((a, b) => a + b, 0) / dailyReturnsList.length;
  const variance =
    dailyReturnsList.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (dailyReturnsList.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

export function maxDrawdown(closes: number[]): number {
  if (closes.length === 0) return 0;
  let peak = closes[0];
  let worst = 0;
  for (const close of closes) {
    if (close > peak) peak = close;
    const drawdown = peak === 0 ? 0 : (close - peak) / peak;
    if (drawdown < worst) worst = drawdown;
  }
  return worst * 100;
}

export function sharpeRatio(annualizedReturnPct: number, annualizedVolatilityPct: number): number {
  if (annualizedVolatilityPct === 0) return 0;
  return (annualizedReturnPct - RISK_FREE_RATE_PCT) / annualizedVolatilityPct;
}
