export type PricePoint = { date: string; close: number };

export function alignByDate(
  assetPrices: PricePoint[],
  benchmarkPrices: PricePoint[]
): { assetReturns: number[]; benchmarkReturns: number[] } {
  const assetByDate = new Map(assetPrices.map((p) => [p.date, p.close]));
  const benchByDate = new Map(benchmarkPrices.map((p) => [p.date, p.close]));
  const sharedDates = assetPrices.map((p) => p.date).filter((d) => benchByDate.has(d));

  const assetReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  for (let i = 1; i < sharedDates.length; i++) {
    const prevDate = sharedDates[i - 1];
    const date = sharedDates[i];
    const prevAsset = assetByDate.get(prevDate)!;
    const asset = assetByDate.get(date)!;
    const prevBench = benchByDate.get(prevDate)!;
    const bench = benchByDate.get(date)!;
    if (prevAsset !== 0 && prevBench !== 0) {
      assetReturns.push((asset - prevAsset) / prevAsset);
      benchmarkReturns.push((bench - prevBench) / prevBench);
    }
  }
  return { assetReturns, benchmarkReturns };
}

const TRADING_DAYS_PER_YEAR = 252;

export function alphaBetaCorrelation(
  assetReturns: number[],
  benchmarkReturns: number[]
): { alpha: number; beta: number; correlation: number } {
  const n = Math.min(assetReturns.length, benchmarkReturns.length);
  if (n < 2) return { alpha: 0, beta: 0, correlation: 0 };
  const asset = assetReturns.slice(0, n);
  const bench = benchmarkReturns.slice(0, n);
  const meanAsset = asset.reduce((a, b) => a + b, 0) / n;
  const meanBench = bench.reduce((a, b) => a + b, 0) / n;

  let covariance = 0;
  let benchVariance = 0;
  let assetVariance = 0;
  for (let i = 0; i < n; i++) {
    const da = asset[i] - meanAsset;
    const db = bench[i] - meanBench;
    covariance += da * db;
    benchVariance += db * db;
    assetVariance += da * da;
  }
  covariance /= n;
  benchVariance /= n;
  assetVariance /= n;

  const beta = benchVariance === 0 ? 0 : covariance / benchVariance;
  const alpha = (meanAsset - beta * meanBench) * TRADING_DAYS_PER_YEAR * 100;
  const denom = Math.sqrt(assetVariance) * Math.sqrt(benchVariance);
  const correlation = denom === 0 ? 0 : covariance / denom;

  return { alpha, beta, correlation };
}
