# Watchlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Watchlist tab fully functional as a per-ticker performance chart, matching the updated "Nocturne" mock: a list of tracked tickers with a global period selector, each row showing its period return, and tapping a row expanding it in place to show a performance chart (with a dashed S&P 500 benchmark line) plus a Sharpe/Volatility/Max Drawdown/Alpha/Beta/Correlation stats table.

**Architecture:** A local SQLite cache (`expo-sqlite`) stores watchlist tickers and daily close prices (shared with a fixed `SPY` benchmark series). A thin Alpha Vantage client fetches `TIME_SERIES_DAILY` (compact for routine refresh, full only when a selected period needs more history than is cached) and upserts into the cache. Each watchlist ticker is treated as a single 100%-weighted synthetic portfolio: pure compute functions (period slicing, indexed series, return, volatility, max drawdown, Sharpe, alpha/beta/correlation vs. `SPY`) turn cached daily closes into the same `PerformanceSeries`/`PerformanceStats` shape a future portfolio Detail screen will use. Screens never touch SQLite or the network directly — they call `src/lib/api/watchlist.ts`, wrapped by TanStack Query.

**Tech Stack:** Expo SDK 57, expo-sqlite, @tanstack/react-query, react-native-svg (already installed), Alpha Vantage free-tier REST API, Jest + ts-jest for pure-function unit tests.

## Global Constraints

- UI code never touches SQLite or the market-data API directly — only `src/lib/api/*` (per `docs/superpowers/specs/2026-07-16-portfolio-comparison-design.md` §7 and `CLAUDE.md`).
- Visual styling (colors, sizes, spacing) must match `Portfolio Tracker.html`'s decoded Watchlist markup exactly — concrete values are embedded in each task below (already extracted from the updated mock, no need to re-decode it).
- Market data provider is Alpha Vantage `TIME_SERIES_DAILY` (spec §2). Routine refresh is capped at once per calendar day per ticker (checked via cached max date), regardless of whether the market is open, since it's end-of-day data. `outputsize=full` is only requested when a selected period's lookback exceeds what's cached, and at most once per ticker per day.
- Watchlist tickers are compared against a fixed `SPY` benchmark (not user-selectable) for Alpha/Beta/Correlation and the chart's dashed line — same stats shape a portfolio's Detail screen will use later.
- On fetch failure, serve cached data if any exists rather than erroring (spec §5).
- Expo SDK 57 — consult https://docs.expo.dev/versions/v57.0.0/ before assuming API shape for any Expo package.
- After any UI-affecting task, verify by running the app in the simulator and taking a screenshot (`xcrun simctl io booted screenshot`) — `npx tsc --noEmit` alone does not prove a screen renders correctly (see `CLAUDE.md` "Verifying UI changes").

---

## Task 1: Dependencies, environment config, and gitignore

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `expo-sqlite`, `@tanstack/react-query`, `jest`/`ts-jest`/`@types/jest` available as imports; `process.env.EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY` readable at runtime by later tasks.

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npx expo install expo-sqlite
npm install @tanstack/react-query
```

- [ ] **Step 2: Install test dependencies**

Run:
```bash
npm install --save-dev jest@^30 ts-jest@^29 @types/jest
```

- [ ] **Step 3: Add the Jest config and test script**

Create `jest.config.js`:

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
```

Edit `package.json` `scripts` block to add a `test` entry:

```json
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test": "jest"
  },
```

- [ ] **Step 4: Add the Alpha Vantage API key env var scaffold**

Create `.env.example`:

```
EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY=your_key_here
```

Edit `.gitignore` — add a line for `.env` next to the existing `.env*.local` entry:

```
# local env files
.env
.env*.local
```

Tell the user (if not already done) to get a free key at https://www.alphavantage.co/support/#api-key and create a `.env` file at the repo root with `EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY=<their key>`. Expo's Metro bundler loads `.env` automatically and inlines `EXPO_PUBLIC_*` vars — no babel/app.json change needed on SDK 57.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json jest.config.js .env.example .gitignore
git commit -m "chore: add sqlite, react-query, and jest dependencies for watchlist"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/lib/api/types.ts`

**Interfaces:**
- Produces: `PeriodKey`, `PerformanceSeries`, `PerformanceStats`, `WatchlistTickerPerformance` — consumed by every later task.

- [ ] **Step 1: Write the types**

```typescript
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/types.ts
git commit -m "feat: add period, performance, and watchlist types"
```

---

## Task 3: Period slicing and return compute functions

**Files:**
- Create: `src/lib/compute/returns.ts`
- Test: `src/lib/compute/returns.test.ts`

**Interfaces:**
- Consumes: `PeriodKey` from `src/lib/api/types.ts` (Task 2).
- Produces:
  - `type PricePoint = { date: string; close: number }`
  - `periodStartDate(period: PeriodKey, referenceDate: string): string`
  - `sliceToPeriod(prices: PricePoint[], period: PeriodKey, referenceDate?: string): { points: PricePoint[]; truncatedFrom?: string }`
  - `toIndexedSeries(points: PricePoint[]): { date: string; value: number }[]`
  - `periodReturn(points: PricePoint[]): number`
  - `dailyReturns(points: PricePoint[]): number[]`
  - `tradingDaySpan(points: { date: string }[]): number`

  All consumed by Task 6 (risk) indirectly via Task 8 (api composition), and directly by Task 8.

- [ ] **Step 1: Write the failing tests**

```typescript
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

  it('returns Jan 1 of the reference year for YTD', () => {
    expect(periodStartDate('YTD', '2026-07-17')).toBe('2026-01-01');
  });

  it('returns a date far in the past for MAX', () => {
    expect(periodStartDate('MAX', '2026-07-17')).toBe('0000-01-01');
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
    const result = sliceToPeriod(prices, 'MAX');
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
    expect(toIndexedSeries(points)).toEqual([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-02', value: 110 },
    ]);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/compute/returns.test.ts`
Expected: FAIL with "Cannot find module './returns'"

- [ ] **Step 3: Write the implementation**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/compute/returns.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/compute/returns.ts src/lib/compute/returns.test.ts
git commit -m "feat: add period slicing and return compute functions"
```

---

## Task 4: Risk compute functions

**Files:**
- Create: `src/lib/compute/risk.ts`
- Test: `src/lib/compute/risk.test.ts`

**Interfaces:**
- Produces:
  - `annualizedReturn(periodReturnPct: number, days: number): number`
  - `volatility(dailyReturnsList: number[]): number`
  - `maxDrawdown(closes: number[]): number`
  - `sharpeRatio(annualizedReturnPct: number, annualizedVolatilityPct: number): number`

  All consumed by Task 8 (api composition).

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/compute/risk.test.ts`
Expected: FAIL with "Cannot find module './risk'"

- [ ] **Step 3: Write the implementation**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/compute/risk.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/compute/risk.ts src/lib/compute/risk.test.ts
git commit -m "feat: add volatility, max drawdown, sharpe, and annualized return compute functions"
```

---

## Task 5: Regression compute functions (alpha, beta, correlation)

**Files:**
- Create: `src/lib/compute/regression.ts`
- Test: `src/lib/compute/regression.test.ts`

**Interfaces:**
- Consumes: `PricePoint` (structurally — re-declared locally to keep this module dependency-free of `returns.ts`).
- Produces:
  - `alignByDate(assetPrices: PricePoint[], benchmarkPrices: PricePoint[]): { assetReturns: number[]; benchmarkReturns: number[] }`
  - `alphaBetaCorrelation(assetReturns: number[], benchmarkReturns: number[]): { alpha: number; beta: number; correlation: number }`

  Both consumed by Task 8 (api composition).

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/compute/regression.test.ts`
Expected: FAIL with "Cannot find module './regression'"

- [ ] **Step 3: Write the implementation**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/compute/regression.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/compute/regression.ts src/lib/compute/regression.test.ts
git commit -m "feat: add alpha/beta/correlation regression compute functions"
```

---

## Task 6: Chart geometry compute functions

**Files:**
- Create: `src/lib/compute/chartGeometry.ts`
- Test: `src/lib/compute/chartGeometry.test.ts`

**Interfaces:**
- Produces:
  - `linePath(values: number[], width: number, height: number, padY?: number): string`
  - `areaPath(values: number[], width: number, height: number, padY?: number): string`
  - `lastPointPosition(values: number[], width: number, height: number, padY?: number): { x: number; y: number }`
  - `seriesRange(values: number[]): { min: number; max: number }`

  All consumed by Task 14 (PerformanceChart component) and Task 13 (collapsed row mini-chart).

- [ ] **Step 1: Write the failing tests**

```typescript
import { areaPath, lastPointPosition, linePath, seriesRange } from './chartGeometry';

describe('linePath', () => {
  it('returns an empty string for no values', () => {
    expect(linePath([], 56, 24)).toBe('');
  });

  it('maps a flat series to a straight horizontal line at mid-height', () => {
    expect(linePath([100, 100], 56, 24, 3)).toBe('M0.0,21.0 L56.0,21.0');
  });

  it('places the lowest value at the bottom and highest at the top', () => {
    expect(linePath([10, 20], 56, 24, 3)).toBe('M0.0,21.0 L56.0,3.0');
  });
});

describe('areaPath', () => {
  it('closes the line path down to the bottom corners', () => {
    expect(areaPath([10, 20], 56, 24, 3)).toBe('M0.0,21.0 L56.0,3.0 L56,24 L0,24 Z');
  });
});

describe('lastPointPosition', () => {
  it('returns the x/y of the final value', () => {
    expect(lastPointPosition([10, 20], 56, 24, 3)).toEqual({ x: 56, y: 3 });
  });
});

describe('seriesRange', () => {
  it('returns min and max of the series', () => {
    expect(seriesRange([10, 30, 20])).toEqual({ min: 10, max: 30 });
  });

  it('returns 0/0 for empty input', () => {
    expect(seriesRange([])).toEqual({ min: 0, max: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/compute/chartGeometry.test.ts`
Expected: FAIL with "Cannot find module './chartGeometry'"

- [ ] **Step 3: Write the implementation**

```typescript
export function linePath(values: number[], width: number, height: number, padY = 8): string {
  if (values.length === 0) return '';
  const { min, max } = seriesRange(values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = padY + (height - padY * 2) * (1 - (v - min) / range);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function areaPath(values: number[], width: number, height: number, padY = 8): string {
  const line = linePath(values, width, height, padY);
  if (!line) return '';
  return `${line} L${width},${height} L0,${height} Z`;
}

export function lastPointPosition(
  values: number[],
  width: number,
  height: number,
  padY = 8
): { x: number; y: number } {
  const { min, max } = seriesRange(values);
  const range = max - min || 1;
  const last = values[values.length - 1];
  return { x: width, y: padY + (height - padY * 2) * (1 - (last - min) / range) };
}

export function seriesRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/compute/chartGeometry.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/compute/chartGeometry.ts src/lib/compute/chartGeometry.test.ts
git commit -m "feat: add chart geometry compute functions"
```

---

## Task 7: SQLite schema

**Files:**
- Create: `src/lib/storage/db.ts`

**Interfaces:**
- Produces: `getDb(): Promise<SQLite.SQLiteDatabase>` — a singleton, migrated connection, consumed by Task 8.

- [ ] **Step 1: Write the db module**

`price_meta` tracks, per ticker, the last date a `full`-history fetch was attempted — independent of watchlist membership, since the shared `SPY` benchmark needs this too even though it's never itself a row in `watchlist`.

```typescript
import * as SQLite from 'expo-sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS watchlist (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  close REAL NOT NULL,
  PRIMARY KEY (ticker, date)
);
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date);

CREATE TABLE IF NOT EXISTS price_meta (
  ticker TEXT PRIMARY KEY,
  full_fetched_on TEXT
);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('fiducia.db').then(async (db) => {
      await db.execAsync(SCHEMA);
      return db;
    });
  }
  return dbPromise;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. (Runtime behavior is exercised end-to-end once the Watchlist screen calls into this in Task 13 — `expo-sqlite` is a native module and can't run under plain Jest/Node.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/db.ts
git commit -m "feat: add sqlite connection and watchlist/prices/price_meta schema"
```

---

## Task 8: Storage queries

**Files:**
- Create: `src/lib/storage/watchlist.ts`
- Create: `src/lib/storage/prices.ts`
- Create: `src/lib/storage/priceMeta.ts`

**Interfaces:**
- Consumes: `getDb()` from Task 7.
- Produces:
  - `listTickers(): Promise<{ ticker: string; name: string }[]>`
  - `insertTicker(ticker: string, name: string): Promise<void>`
  - `deleteTicker(ticker: string): Promise<void>`
  - `type PricePoint = { date: string; close: number }`
  - `getLatestDate(ticker: string): Promise<string | null>`
  - `getEarliestDate(ticker: string): Promise<string | null>`
  - `upsertPrices(ticker: string, points: PricePoint[]): Promise<void>`
  - `getAllPrices(ticker: string): Promise<PricePoint[]>` — full cached history, ascending by date
  - `getFullFetchedOn(ticker: string): Promise<string | null>`
  - `setFullFetchedOn(ticker: string, date: string): Promise<void>`

  All consumed by Task 10 (api composition).

- [ ] **Step 1: Write watchlist storage queries**

```typescript
import { getDb } from './db';

export async function listTickers(): Promise<{ ticker: string; name: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ ticker: string; name: string }>(
    'SELECT ticker, name FROM watchlist ORDER BY ticker ASC'
  );
}

export async function insertTicker(ticker: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR IGNORE INTO watchlist (ticker, name) VALUES (?, ?)', ticker, name);
}

export async function deleteTicker(ticker: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM watchlist WHERE ticker = ?', ticker);
}
```

- [ ] **Step 2: Write prices storage queries**

```typescript
import { getDb } from './db';

export type PricePoint = { date: string; close: number };

export async function getLatestDate(ticker: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ maxDate: string | null }>(
    'SELECT MAX(date) as maxDate FROM prices WHERE ticker = ?',
    ticker
  );
  return row?.maxDate ?? null;
}

export async function getEarliestDate(ticker: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ minDate: string | null }>(
    'SELECT MIN(date) as minDate FROM prices WHERE ticker = ?',
    ticker
  );
  return row?.minDate ?? null;
}

export async function upsertPrices(ticker: string, points: PricePoint[]): Promise<void> {
  if (points.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const point of points) {
      await db.runAsync(
        'INSERT OR REPLACE INTO prices (ticker, date, close) VALUES (?, ?, ?)',
        ticker,
        point.date,
        point.close
      );
    }
  });
}

export async function getAllPrices(ticker: string): Promise<PricePoint[]> {
  const db = await getDb();
  return db.getAllAsync<PricePoint>(
    'SELECT date, close FROM prices WHERE ticker = ? ORDER BY date ASC',
    ticker
  );
}
```

- [ ] **Step 3: Write price_meta storage queries**

```typescript
import { getDb } from './db';

export async function getFullFetchedOn(ticker: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ full_fetched_on: string | null }>(
    'SELECT full_fetched_on FROM price_meta WHERE ticker = ?',
    ticker
  );
  return row?.full_fetched_on ?? null;
}

export async function setFullFetchedOn(ticker: string, date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO price_meta (ticker, full_fetched_on) VALUES (?, ?) ' +
      'ON CONFLICT(ticker) DO UPDATE SET full_fetched_on = excluded.full_fetched_on',
    ticker,
    date
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/watchlist.ts src/lib/storage/prices.ts src/lib/storage/priceMeta.ts
git commit -m "feat: add watchlist, prices, and price_meta storage queries"
```

---

## Task 9: Alpha Vantage market data client

**Files:**
- Create: `src/lib/api/marketData.ts`

**Interfaces:**
- Produces:
  - `type PricePoint = { date: string; close: number }`
  - `fetchDailySeries(ticker: string, outputSize?: 'compact' | 'full'): Promise<PricePoint[]>` — throws if the ticker is unknown or the request fails.
  - `lookupCompanyName(ticker: string): Promise<string>` — falls back to the ticker itself if no match.

  Both consumed by Task 10 (api composition).

- [ ] **Step 1: Write the market data client**

```typescript
const API_KEY = process.env.EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

export type PricePoint = { date: string; close: number };

type DailySeriesResponse = {
  'Time Series (Daily)'?: Record<string, { '4. close': string }>;
  'Error Message'?: string;
  Note?: string;
};

type SymbolSearchResponse = {
  bestMatches?: { '1. symbol': string; '2. name': string }[];
};

function requireApiKey(): string {
  if (!API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY. Add it to your .env file.');
  }
  return API_KEY;
}

export async function fetchDailySeries(
  ticker: string,
  outputSize: 'compact' | 'full' = 'compact'
): Promise<PricePoint[]> {
  const apiKey = requireApiKey();
  const url = `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=${outputSize}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Alpha Vantage request failed with status ${res.status}`);
  }
  const data = (await res.json()) as DailySeriesResponse;
  if (data['Error Message']) {
    throw new Error(`Unknown ticker: ${ticker}`);
  }
  if (data.Note) {
    throw new Error('Alpha Vantage rate limit hit, try again later');
  }
  const series = data['Time Series (Daily)'];
  if (!series) {
    throw new Error(`No price data returned for ${ticker}`);
  }
  return Object.entries(series)
    .map(([date, values]) => ({ date, close: parseFloat(values['4. close']) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function lookupCompanyName(ticker: string): Promise<string> {
  const apiKey = requireApiKey();
  const url = `${BASE_URL}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return ticker;
  const data = (await res.json()) as SymbolSearchResponse;
  const match = data.bestMatches?.find((m) => m['1. symbol'].toUpperCase() === ticker.toUpperCase());
  return match ? match['2. name'] : ticker;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. (Runtime network behavior is exercised in Task 13's manual verification.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/marketData.ts
git commit -m "feat: add Alpha Vantage market data client with compact/full outputsize"
```

---

## Task 10: Watchlist API composition

**Files:**
- Create: `src/lib/api/watchlist.ts`

**Interfaces:**
- Consumes:
  - `listTickers`, `insertTicker`, `deleteTicker` from `src/lib/storage/watchlist.ts` (Task 8)
  - `getLatestDate`, `getEarliestDate`, `upsertPrices`, `getAllPrices`, `type PricePoint` from `src/lib/storage/prices.ts` (Task 8)
  - `getFullFetchedOn`, `setFullFetchedOn` from `src/lib/storage/priceMeta.ts` (Task 8)
  - `fetchDailySeries`, `lookupCompanyName` from `src/lib/api/marketData.ts` (Task 9)
  - `periodStartDate`, `sliceToPeriod`, `toIndexedSeries`, `periodReturn`, `dailyReturns`, `tradingDaySpan` from `src/lib/compute/returns.ts` (Task 3)
  - `annualizedReturn`, `volatility`, `maxDrawdown`, `sharpeRatio` from `src/lib/compute/risk.ts` (Task 4)
  - `alignByDate`, `alphaBetaCorrelation` from `src/lib/compute/regression.ts` (Task 5)
  - `PeriodKey`, `PerformanceSeries`, `PerformanceStats`, `WatchlistTickerPerformance` from `src/lib/api/types.ts` (Task 2)
- Produces:
  - `listWatchlist(period: PeriodKey): Promise<WatchlistTickerPerformance[]>`
  - `addWatchlistTicker(rawTicker: string): Promise<void>` — throws a user-facing `Error` on invalid/duplicate ticker
  - `removeWatchlistTicker(ticker: string): Promise<void>`

  All consumed by Tasks 13, 15, 16 (the only layer the UI is allowed to call, per Global Constraints).

- [ ] **Step 1: Write the composed API**

```typescript
import { fetchDailySeries, lookupCompanyName } from './marketData';
import type { PeriodKey, PerformanceSeries, PerformanceStats, WatchlistTickerPerformance } from './types';
import { alignByDate, alphaBetaCorrelation } from '@/lib/compute/regression';
import { annualizedReturn, maxDrawdown, sharpeRatio, volatility } from '@/lib/compute/risk';
import {
  dailyReturns,
  periodReturn,
  periodStartDate,
  sliceToPeriod,
  toIndexedSeries,
  tradingDaySpan,
  type PricePoint,
} from '@/lib/compute/returns';
import * as priceMetaStorage from '@/lib/storage/priceMeta';
import { getAllPrices, getEarliestDate, getLatestDate, upsertPrices } from '@/lib/storage/prices';
import * as watchlistStorage from '@/lib/storage/watchlist';

const BENCHMARK_TICKER = 'SPY';
const BENCHMARK_NAME = 'S&P 500 ETF';

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ensureFreshHistory(ticker: string, period: PeriodKey): Promise<void> {
  const today = todayISODate();

  const latest = await getLatestDate(ticker);
  if (latest !== today) {
    try {
      const series = await fetchDailySeries(ticker, 'compact');
      const tail = latest === null ? series : series.filter((p) => p.date > latest);
      await upsertPrices(ticker, tail);
    } catch {
      // Fetch failed (offline / rate limit) — serve whatever is already cached, per spec §2/§5.
    }
  }

  const requiredStart = periodStartDate(period, today);
  const earliest = await getEarliestDate(ticker);
  const fullFetchedOn = await priceMetaStorage.getFullFetchedOn(ticker);
  const needsFullHistory = (earliest === null || earliest > requiredStart) && fullFetchedOn !== today;
  if (needsFullHistory) {
    try {
      const full = await fetchDailySeries(ticker, 'full');
      await upsertPrices(ticker, full);
      await priceMetaStorage.setFullFetchedOn(ticker, today);
    } catch {
      // Fetch failed (offline / rate limit) — serve whatever is already cached, per spec §2/§5.
    }
  }
}

function buildPerformance(
  ticker: string,
  name: string,
  prices: PricePoint[],
  benchmarkPrices: PricePoint[],
  period: PeriodKey
): WatchlistTickerPerformance {
  const { points: sliced, truncatedFrom } = sliceToPeriod(prices, period);
  const series: PerformanceSeries = { period, points: toIndexedSeries(sliced), truncatedFrom };

  const days = tradingDaySpan(sliced);
  const returnPct = periodReturn(sliced);
  const annReturn = annualizedReturn(returnPct, days);
  const vol = volatility(dailyReturns(sliced));
  const mdd = maxDrawdown(sliced.map((p) => p.close));
  const sharpe = sharpeRatio(annReturn, vol);

  const { points: benchSliced } = sliceToPeriod(benchmarkPrices, period);
  const { assetReturns, benchmarkReturns } = alignByDate(sliced, benchSliced);
  const { alpha, beta, correlation } = alphaBetaCorrelation(assetReturns, benchmarkReturns);

  const stats: PerformanceStats = { return: returnPct, volatility: vol, maxDrawdown: mdd, sharpe, alpha, beta, correlation };
  const last = sliced[sliced.length - 1];

  return { ticker, name, price: last ? last.close : 0, series, stats };
}

export async function listWatchlist(period: PeriodKey): Promise<WatchlistTickerPerformance[]> {
  await ensureFreshHistory(BENCHMARK_TICKER, period);
  const benchmarkPrices = await getAllPrices(BENCHMARK_TICKER);

  const tickers = await watchlistStorage.listTickers();
  return Promise.all(
    tickers.map(async ({ ticker, name }) => {
      await ensureFreshHistory(ticker, period);
      const prices = await getAllPrices(ticker);
      return buildPerformance(ticker, name, prices, benchmarkPrices, period);
    })
  );
}

export async function addWatchlistTicker(rawTicker: string): Promise<void> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) {
    throw new Error('Enter a ticker symbol');
  }
  let series: PricePoint[];
  try {
    series = await fetchDailySeries(ticker, 'compact');
  } catch {
    throw new Error(`Unknown ticker: ${ticker}`);
  }
  await upsertPrices(ticker, series);
  const name = await lookupCompanyName(ticker);
  await watchlistStorage.insertTicker(ticker, name);
}

export async function removeWatchlistTicker(ticker: string): Promise<void> {
  await watchlistStorage.deleteTicker(ticker);
}
```

(`BENCHMARK_NAME` is defined for potential future use — e.g. if `SPY` is ever also shown as a benchmark row — but isn't referenced yet; if `tsc`/lint flags it as unused, remove the line rather than leaving it dead.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. If `BENCHMARK_NAME` is flagged as an unused variable, delete that line.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/watchlist.ts
git commit -m "feat: add watchlist api composing storage, market data, and compute layers"
```

---

## Task 11: Wire up TanStack Query provider

**Files:**
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Produces: a `QueryClientProvider` ancestor for every screen, required by `useQuery`/`useMutation` calls in Tasks 13–16.

- [ ] **Step 1: Wrap the root stack in a QueryClientProvider**

Replace the contents of `src/app/_layout.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 60 * 1000, // 1 hour — daily-close data doesn't change intraday, don't refetch on every tab switch
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-portfolio" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-ticker" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="light" />
    </QueryClientProvider>
  );
}
```

(The `add-ticker` route doesn't exist until Task 15 — declaring it here now is harmless since expo-router only warns about missing routes it actually navigates to.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm start` then press `i` for the iOS simulator.
Expected: app boots to the Overview tab exactly as before (empty state) — the provider wrapper is invisible.

- [ ] **Step 3: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: wrap app in QueryClientProvider with a 1-hour staleTime"
```

---

## Task 12: Period pills component

**Files:**
- Create: `src/components/period-pills.tsx`

**Interfaces:**
- Consumes: `PeriodKey`, `PERIODS` from `src/lib/api/types.ts` (Task 2).
- Produces: `PeriodPills` component, consumed by Task 13.

Matches the mock's pill styling exactly: `padding:6px 12px`, `border-radius:8px`, `font:500 12px`, active pill has `border-color`/`color` = accent, inactive uses the divider token `rgba(233,233,237,.16)`.

- [ ] **Step 1: Write the component**

```tsx
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { PERIODS, type PeriodKey } from '@/lib/api/types';
import { colors } from '@/theme/colors';

type PeriodPillsProps = {
  active: PeriodKey;
  onSelect: (period: PeriodKey) => void;
};

const DIVIDER = 'rgba(233,233,237,.16)';

export function PeriodPills({ active, onSelect }: PeriodPillsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {PERIODS.map((period) => {
        const isActive = period === active;
        return (
          <TouchableOpacity
            key={period}
            onPress={() => onSelect(period)}
            style={[styles.pill, { borderColor: isActive ? colors.accent : DIVIDER }]}
          >
            <Text style={[styles.label, { color: isActive ? colors.accent : colors.textPrimary }]}>
              {period}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 6,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/period-pills.tsx
git commit -m "feat: add reusable period pills component"
```

---

## Task 13: Watchlist screen — collapsed list wired to real data

**Files:**
- Modify: `src/theme/colors.ts`
- Modify: `src/components/icons.tsx`
- Create: `src/components/watchlist-row.tsx`
- Modify: `src/screens/watchlist/index.tsx`

**Interfaces:**
- Consumes: `listWatchlist` from `src/lib/api/watchlist.ts` (Task 10), `WatchlistTickerPerformance` from `src/lib/api/types.ts` (Task 2), `PeriodPills` from Task 12, `linePath` from `src/lib/compute/chartGeometry.ts` (Task 6).
- Produces: `WatchlistRow` component (extended in Task 14 to render its expanded detail), `PlusIcon`.

This task covers only the collapsed-row list (badge, name, ticker, mini sparkline, price, period return) plus the period pills and add button — no expand/collapse yet (that's Task 14).

- [ ] **Step 1: Add the missing positive color token**

Edit `src/theme/colors.ts`, adding one line after `negative`:

```typescript
  negative: '#e08787',
  positive: '#7fbf98',
};
```

- [ ] **Step 2: Add a plus icon matching the mock's "+" button (14×14, two crossed lines)**

Edit `src/components/icons.tsx`, add after `BackIcon`:

```typescript
export function PlusIcon({ color }: IconProps) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Path d="M7 1v12M1 7h12" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
```

- [ ] **Step 3: Write the watchlist row component (collapsed state only)**

The mini sparkline reuses `linePath` on the same `series.points` values that drive the expanded chart — no separate sparkline concept.

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

import { linePath } from '@/lib/compute/chartGeometry';
import type { WatchlistTickerPerformance } from '@/lib/api/types';
import { colors } from '@/theme/colors';

type WatchlistRowProps = {
  item: WatchlistTickerPerformance;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function WatchlistRow({ item, onPress, onLongPress }: WatchlistRowProps) {
  const changeColor = item.stats.return >= 0 ? colors.positive : colors.negative;
  const changeLabel = `${item.stats.return >= 0 ? '+' : ''}${item.stats.return.toFixed(1)}%`;
  const sparkPath = linePath(
    item.series.points.map((p) => p.value),
    56,
    24,
    3
  );

  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.row} onPress={onPress} onLongPress={onLongPress}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{item.ticker}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.ticker}>{item.ticker}</Text>
        </View>
        <Svg width={56} height={24} viewBox="0 0 56 24" preserveAspectRatio="none">
          <Path d={sparkPath} fill="none" stroke={changeColor} strokeWidth={1.5} />
        </Svg>
        <View style={styles.priceCol}>
          <Text style={styles.price}>${item.price.toFixed(2)}</Text>
          <Text style={[styles.change, { color: changeColor }]}>{changeLabel}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#1e2030',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.accentSoft,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  ticker: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  priceCol: {
    alignItems: 'flex-end',
    width: 66,
  },
  price: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  change: {
    fontSize: 11,
    marginTop: 2,
  },
});
```

- [ ] **Step 4: Replace the watchlist screen with the real, data-driven collapsed list**

```tsx
import { useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { PlusIcon } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { PeriodPills } from '@/components/period-pills';
import { WatchlistRow } from '@/components/watchlist-row';
import { listWatchlist } from '@/lib/api/watchlist';
import { DEFAULT_PERIOD, type PeriodKey } from '@/lib/api/types';
import { colors } from '@/theme/colors';

export function Watchlist() {
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const { data, isPending } = useQuery({
    queryKey: ['watchlist', period],
    queryFn: () => listWatchlist(period),
  });
  const items = data ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Markets</Text>
          <Text style={styles.title}>Watchlist</Text>
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/add-ticker')} hitSlop={8}>
          <PlusIcon color={colors.textPrimary} />
        </Pressable>
      </View>
      {!isPending && items.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          message="Track tickers here without adding them to a portfolio."
        />
      ) : (
        <>
          <PeriodPills active={period} onSelect={setPeriod} />
          <FlatList
            data={items}
            keyExtractor={(item) => item.ticker}
            renderItem={({ item }) => <WatchlistRow item={item} />}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.accent,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 3,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    marginTop: 8,
    paddingBottom: 24,
  },
});
```

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: the `router.push('/add-ticker')` call will show a type error until Task 15 creates that route — this is expected and resolved in Task 15, which lands immediately after this one before the app is run end-to-end.

- [ ] **Step 6: Commit**

```bash
git add src/theme/colors.ts src/components/icons.tsx src/components/watchlist-row.tsx src/screens/watchlist/index.tsx
git commit -m "feat: render watchlist collapsed rows with period-based return and mini chart"
```

---

## Task 14: Performance chart component and expand-in-place detail

**Files:**
- Create: `src/components/performance-chart.tsx`
- Modify: `src/components/watchlist-row.tsx`

**Interfaces:**
- Consumes: `linePath`, `areaPath`, `lastPointPosition`, `seriesRange` from `src/lib/compute/chartGeometry.ts` (Task 6), `PerformanceSeries`, `PerformanceStats` from `src/lib/api/types.ts` (Task 2).
- Produces: `PerformanceChart` component, consumed here by `WatchlistRow`'s expanded state (and reusable later by the Overview/Compare screens).

Matches the mock's expanded-row chart exactly: 330×130 viewBox scaled to `100%` width, gradient area fill, 3 gridlines at y=18/65/112 (scaled proportionally for height 130), dashed benchmark line, solid asset line, dashed vertical crosshair + pulsing-style dot (static circle — no animation library is installed, so the mock's `animation:pulse` is dropped as a deliberate simplification) at the latest point, floating value pill, high/low grid labels.

- [ ] **Step 1: Write the PerformanceChart component**

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { Circle, Defs, Line, LinearGradient, Path, Stop, Svg, Text as SvgText } from 'react-native-svg';

import { areaPath, lastPointPosition, linePath, seriesRange } from '@/lib/compute/chartGeometry';
import type { PerformanceSeries } from '@/lib/api/types';
import { colors } from '@/theme/colors';

type PerformanceChartProps = {
  series: PerformanceSeries;
  benchmarkSeries?: PerformanceSeries;
  lineColor: string;
  width?: number;
  height?: number;
};

export function PerformanceChart({
  series,
  benchmarkSeries,
  lineColor,
  width = 330,
  height = 130,
}: PerformanceChartProps) {
  const values = series.points.map((p) => p.value);
  const benchmarkValues = benchmarkSeries?.points.map((p) => p.value) ?? [];
  const { min, max } = seriesRange(values);
  const last = lastPointPosition(values, width, height);
  const pillLeft = Math.max(24, Math.min(width - 24, last.x));
  const gradientId = 'watchlist-chart-gradient';

  return (
    <View style={styles.wrapper}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Line x1={0} y1={height * 0.14} x2={width - 30} y2={height * 0.14} stroke="#2a2d3d" strokeWidth={1} />
        <Line x1={0} y1={height * 0.5} x2={width - 30} y2={height * 0.5} stroke="#2a2d3d" strokeWidth={1} />
        <Line x1={0} y1={height * 0.86} x2={width - 30} y2={height * 0.86} stroke="#2a2d3d" strokeWidth={1} />
        <Path d={areaPath(values, width, height)} fill={`url(#${gradientId})`} />
        {benchmarkValues.length > 0 ? (
          <Path
            d={linePath(benchmarkValues, width, height)}
            fill="none"
            stroke="#595d6c"
            strokeWidth={1.3}
            strokeDasharray="3,3"
          />
        ) : null}
        <Path d={linePath(values, width, height)} fill="none" stroke={lineColor} strokeWidth={2} />
        <Line x1={last.x} y1={0} x2={last.x} y2={height} stroke="#4c5397" strokeWidth={1} strokeDasharray="2,2" />
        <Circle cx={last.x} cy={last.y} r={4} fill={lineColor} />
        <SvgText x={width - 28} y={height * 0.14 + 4} fill="#75798c" fontSize={9}>
          {max.toFixed(0)}
        </SvgText>
        <SvgText x={width - 28} y={height * 0.86 + 4} fill="#75798c" fontSize={9}>
          {min.toFixed(0)}
        </SvgText>
      </Svg>
      <View style={[styles.pill, { left: pillLeft - 20, backgroundColor: lineColor }]}>
        <Text style={styles.pillLabel}>
          {series.points.length > 0
            ? `${values[values.length - 1] >= values[0] ? '+' : ''}${(
                ((values[values.length - 1] - values[0]) / values[0]) *
                100
              ).toFixed(1)}%`
            : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingTop: 14,
    paddingHorizontal: 10,
    paddingBottom: 4,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 12,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.background,
  },
});
```

- [ ] **Step 2: Wire expand-in-place into WatchlistRow**

Edit `src/components/watchlist-row.tsx` — add expanded state, a stats table, and the "Dashed line" caption below the chart. Replace the whole file:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

import { PerformanceChart } from '@/components/performance-chart';
import { linePath } from '@/lib/compute/chartGeometry';
import type { WatchlistTickerPerformance } from '@/lib/api/types';
import { colors } from '@/theme/colors';
import { Pressable } from 'react-native';

type WatchlistRowProps = {
  item: WatchlistTickerPerformance;
  benchmarkSeries?: WatchlistTickerPerformance['series'];
  isOpen: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
};

const STATS_ROWS: { key: keyof WatchlistTickerPerformance['stats']; label: string; suffix: string }[] = [
  { key: 'sharpe', label: 'Sharpe Ratio', suffix: '' },
  { key: 'volatility', label: 'Volatility', suffix: '%' },
  { key: 'maxDrawdown', label: 'Max Drawdown', suffix: '%' },
  { key: 'alpha', label: 'Alpha (vs S&P 500)', suffix: '%' },
  { key: 'beta', label: 'Beta (vs S&P 500)', suffix: '' },
  { key: 'correlation', label: 'Correlation (vs S&P 500)', suffix: '' },
];

export function WatchlistRow({ item, benchmarkSeries, isOpen, onToggle, onLongPress }: WatchlistRowProps) {
  const changeColor = item.stats.return >= 0 ? colors.positive : colors.negative;
  const changeLabel = `${item.stats.return >= 0 ? '+' : ''}${item.stats.return.toFixed(1)}%`;
  const sparkPath = linePath(
    item.series.points.map((p) => p.value),
    56,
    24,
    3
  );

  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.row} onPress={onToggle} onLongPress={onLongPress}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{item.ticker}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.ticker}>{item.ticker}</Text>
        </View>
        <Svg width={56} height={24} viewBox="0 0 56 24" preserveAspectRatio="none">
          <Path d={sparkPath} fill="none" stroke={changeColor} strokeWidth={1.5} />
        </Svg>
        <View style={styles.priceCol}>
          <Text style={styles.price}>${item.price.toFixed(2)}</Text>
          <Text style={[styles.change, { color: changeColor }]}>{changeLabel}</Text>
        </View>
      </Pressable>
      {isOpen ? (
        <View style={styles.detail}>
          <PerformanceChart series={item.series} benchmarkSeries={benchmarkSeries} lineColor={changeColor} />
          <Text style={styles.caption}>Dashed line: S&P 500 · same period</Text>
          {item.series.truncatedFrom ? (
            <Text style={styles.caption}>Data from {item.series.truncatedFrom}</Text>
          ) : null}
          <View style={styles.statsTable}>
            {STATS_ROWS.map((row) => (
              <View key={row.key} style={styles.statRow}>
                <Text style={styles.statLabel}>{row.label}</Text>
                <Text style={styles.statValue}>
                  {item.stats[row.key].toFixed(2)}
                  {row.suffix}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#1e2030',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.accentSoft,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  ticker: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  priceCol: {
    alignItems: 'flex-end',
    width: 66,
  },
  price: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  change: {
    fontSize: 11,
    marginTop: 2,
  },
  detail: {
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  caption: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
  },
  statsTable: {
    marginTop: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#21232f',
  },
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
```

- [ ] **Step 3: Update the Watchlist screen to track and pass expand state**

Edit `src/screens/watchlist/index.tsx` — add `expandedTicker` state and pass the new `WatchlistRow` props (also fetch the benchmark series once for all rows to share):

```tsx
import { useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { PlusIcon } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { PeriodPills } from '@/components/period-pills';
import { WatchlistRow } from '@/components/watchlist-row';
import { listWatchlist } from '@/lib/api/watchlist';
import { DEFAULT_PERIOD, type PeriodKey } from '@/lib/api/types';
import { colors } from '@/theme/colors';

export function Watchlist() {
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const { data, isPending } = useQuery({
    queryKey: ['watchlist', period],
    queryFn: () => listWatchlist(period),
  });
  const items = data ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Markets</Text>
          <Text style={styles.title}>Watchlist</Text>
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/add-ticker')} hitSlop={8}>
          <PlusIcon color={colors.textPrimary} />
        </Pressable>
      </View>
      {!isPending && items.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          message="Track tickers here without adding them to a portfolio."
        />
      ) : (
        <>
          <PeriodPills active={period} onSelect={setPeriod} />
          <FlatList
            data={items}
            keyExtractor={(item) => item.ticker}
            renderItem={({ item }) => (
              <WatchlistRow
                item={item}
                isOpen={expandedTicker === item.ticker}
                onToggle={() => setExpandedTicker((cur) => (cur === item.ticker ? null : item.ticker))}
              />
            )}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.accent,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 3,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    marginTop: 8,
    paddingBottom: 24,
  },
});
```

Note: `benchmarkSeries` isn't passed from the screen yet — `listWatchlist` (Task 10) computes alpha/beta/correlation against `SPY` internally but doesn't return `SPY`'s own `PerformanceSeries` for chart overlay. That's addressed in Step 4 below.

- [ ] **Step 4: Expose the benchmark series from the API so the chart can draw it**

Edit `src/lib/api/watchlist.ts` (from Task 10) to also return the benchmark's own indexed series alongside the list, so the UI can draw the dashed line without a second query. Change the return type and `listWatchlist` function:

```typescript
export interface WatchlistResult {
  items: WatchlistTickerPerformance[];
  benchmarkSeries: PerformanceSeries;
}

export async function listWatchlist(period: PeriodKey): Promise<WatchlistResult> {
  await ensureFreshHistory(BENCHMARK_TICKER, period);
  const benchmarkPrices = await getAllPrices(BENCHMARK_TICKER);
  const { points: benchmarkSliced, truncatedFrom: benchmarkTruncatedFrom } = sliceToPeriod(
    benchmarkPrices,
    period
  );
  const benchmarkSeries: PerformanceSeries = {
    period,
    points: toIndexedSeries(benchmarkSliced),
    truncatedFrom: benchmarkTruncatedFrom,
  };

  const tickers = await watchlistStorage.listTickers();
  const items = await Promise.all(
    tickers.map(async ({ ticker, name }) => {
      await ensureFreshHistory(ticker, period);
      const prices = await getAllPrices(ticker);
      return buildPerformance(ticker, name, prices, benchmarkPrices, period);
    })
  );
  return { items, benchmarkSeries };
}
```

Then update `src/screens/watchlist/index.tsx`'s query and render to use `data?.items` and pass `data?.benchmarkSeries` into each row:

```tsx
  const { data, isPending } = useQuery({
    queryKey: ['watchlist', period],
    queryFn: () => listWatchlist(period),
  });
  const items = data?.items ?? [];
```

```tsx
            renderItem={({ item }) => (
              <WatchlistRow
                item={item}
                benchmarkSeries={data?.benchmarkSeries}
                isOpen={expandedTicker === item.ticker}
                onToggle={() => setExpandedTicker((cur) => (cur === item.ticker ? null : item.ticker))}
              />
            )}
```

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: the `router.push('/add-ticker')` call will still show a type error until Task 15 — expected, resolved next.

- [ ] **Step 6: Commit**

```bash
git add src/components/performance-chart.tsx src/components/watchlist-row.tsx src/screens/watchlist/index.tsx src/lib/api/watchlist.ts
git commit -m "feat: expand watchlist rows in place with performance chart and stats table"
```

---

## Task 15: Add Ticker flow

**Files:**
- Create: `src/app/add-ticker.tsx`
- Create: `src/screens/add-ticker/index.tsx`

**Interfaces:**
- Consumes: `addWatchlistTicker` from `src/lib/api/watchlist.ts` (Task 10).
- Produces: the `/add-ticker` route pushed from Task 13's "+" button.

- [ ] **Step 1: Write the Add Ticker screen**

The mock doesn't design this screen explicitly (its "+" button has no wired handler) — this reuses the existing `add-portfolio.tsx` header/back-button convention and the app's dark theme tokens.

```tsx
import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackIcon } from '@/components/icons';
import { addWatchlistTicker } from '@/lib/api/watchlist';
import { colors } from '@/theme/colors';

export function AddTicker() {
  const [ticker, setTicker] = useState('');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => addWatchlistTicker(ticker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      router.back();
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <BackIcon color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.title}>Add to Watchlist</Text>
        <View style={styles.spacer} />
      </View>
      <View style={styles.body}>
        <TextInput
          style={styles.input}
          placeholder="Ticker symbol (e.g. AAPL)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          value={ticker}
          onChangeText={setTicker}
        />
        {mutation.isError ? <Text style={styles.error}>{(mutation.error as Error).message}</Text> : null}
        <Pressable
          style={[styles.submit, !ticker.trim() && styles.submitDisabled]}
          disabled={!ticker.trim() || mutation.isPending}
          onPress={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.submitLabel}>Add</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  title: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  spacer: { width: 14 },
  body: { padding: 18, gap: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
    backgroundColor: colors.surface,
  },
  error: { color: colors.negative, fontSize: 12 },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.5 },
  submitLabel: { color: colors.background, fontSize: 14, fontWeight: '600' },
});
```

- [ ] **Step 2: Wire the route**

```tsx
import { AddTicker } from '@/screens/add-ticker';

export default function AddTickerRoute() {
  return <AddTicker />;
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors — the `router.push('/add-ticker')` calls in Task 13/14 now resolve to a real route.

- [ ] **Step 4: Manual verification**

Ensure `.env` exists at the repo root with a real `EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY` (see Task 1 Step 4) — without it, `addWatchlistTicker` and `listWatchlist` throw immediately.

Run: `npm start`, press `i` for the iOS simulator.
- Navigate to the Watchlist tab. Expected: empty state ("Your watchlist is empty") since no tickers exist yet.
- Tap the "+" button. Expected: modal opens with a ticker input.
- Type `AAPL`, tap "Add". Expected: modal closes, Watchlist tab now shows the period pills and one row — AAPL badge, "Apple Inc" (or similar from Alpha Vantage's SYMBOL_SEARCH), a mini chart, current price, and a colored period return.
- Tap the AAPL row. Expected: it expands to show a chart with a dashed S&P 500 line and a stats table (Sharpe Ratio, Volatility, Max Drawdown, Alpha, Beta, Correlation).
- Change the period pill from 1Y to 5Y. Expected: the row's return, chart, and stats all update; if this is the first time 5Y has been viewed for AAPL, the request may take a moment longer (full-history fetch).
- Take a screenshot: `xcrun simctl io booted screenshot /tmp/watchlist-expanded.png` and view it to confirm layout matches the mock.
- Tap "+" again, type an invalid symbol like `ZZZZZZ`, tap "Add". Expected: inline error "Unknown ticker: ZZZZZZ", modal stays open.

- [ ] **Step 5: Commit**

```bash
git add src/app/add-ticker.tsx src/screens/add-ticker/index.tsx
git commit -m "feat: add ticker entry flow for the watchlist"
```

---

## Task 16: Remove ticker via long-press row action

**Files:**
- Modify: `src/components/watchlist-row.tsx`
- Modify: `src/screens/watchlist/index.tsx`

**Interfaces:**
- Consumes: `removeWatchlistTicker` from `src/lib/api/watchlist.ts` (Task 10).

No new gesture library is added (no `react-native-gesture-handler`/`reanimated` in the project) — a long-press with a native confirm `Alert` satisfies the spec's "remove via long-press row action" without adding a dependency. `WatchlistRow` already accepts an `onLongPress` prop from Task 14 — this task wires it up in the screen.

- [ ] **Step 1: Wire remove into the screen**

Edit `src/screens/watchlist/index.tsx` — add the mutation and pass `onLongPress`:

```tsx
import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { PlusIcon } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { PeriodPills } from '@/components/period-pills';
import { WatchlistRow } from '@/components/watchlist-row';
import { listWatchlist, removeWatchlistTicker } from '@/lib/api/watchlist';
import { DEFAULT_PERIOD, type PeriodKey } from '@/lib/api/types';
import { colors } from '@/theme/colors';

export function Watchlist() {
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ['watchlist', period],
    queryFn: () => listWatchlist(period),
  });
  const removeMutation = useMutation({
    mutationFn: (ticker: string) => removeWatchlistTicker(ticker),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  });
  const items = data?.items ?? [];

  function confirmRemove(ticker: string) {
    Alert.alert(`Remove ${ticker}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(ticker) },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Markets</Text>
          <Text style={styles.title}>Watchlist</Text>
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/add-ticker')} hitSlop={8}>
          <PlusIcon color={colors.textPrimary} />
        </Pressable>
      </View>
      {!isPending && items.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          message="Track tickers here without adding them to a portfolio."
        />
      ) : (
        <>
          <PeriodPills active={period} onSelect={setPeriod} />
          <FlatList
            data={items}
            keyExtractor={(item) => item.ticker}
            renderItem={({ item }) => (
              <WatchlistRow
                item={item}
                benchmarkSeries={data?.benchmarkSeries}
                isOpen={expandedTicker === item.ticker}
                onToggle={() => setExpandedTicker((cur) => (cur === item.ticker ? null : item.ticker))}
                onLongPress={() => confirmRemove(item.ticker)}
              />
            )}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.accent,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 3,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    marginTop: 8,
    paddingBottom: 24,
  },
});
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, press `i` for the iOS simulator.
- With at least one ticker in the watchlist (add `AAPL` again if needed via Task 15's flow), long-press its row.
- Expected: a native confirm alert "Remove AAPL?" with Cancel/Remove.
- Tap Remove. Expected: row disappears from the list; if it was the last row, the empty state reappears.
- Take a screenshot after removal: `xcrun simctl io booted screenshot /tmp/watchlist-empty-after-remove.png` and confirm it matches the empty state.

- [ ] **Step 4: Commit**

```bash
git add src/components/watchlist-row.tsx src/screens/watchlist/index.tsx
git commit -m "feat: remove watchlist tickers via long-press confirm"
```

---

## Self-Review Notes

- **Spec coverage**: `prices`/`watchlist`/`price_meta` tables (§1) — Task 7. Compact/full fetch strategy and once-per-day cap (§2) — Task 9 + `ensureFreshHistory` in Task 10. Watchlist tickers as synthetic single-holding portfolios computed against a fixed `SPY` benchmark, full stats parity with a portfolio Detail screen (§3) — Tasks 3–6, 10. `src/lib/api/*` boundary and `watchlist.ts` signatures (§7) — Task 10 matches `listWatchlist(period)`/`addWatchlistTicker`/`removeWatchlistTicker` (the `WatchlistResult` wrapper added in Task 14 Step 4 is a small, justified extension to also carry the benchmark series for chart rendering — not a departure from the spec's intent). Watchlist screen requirements (§4: header, global period pills, collapsed row with badge/name/ticker/return, expand-in-place chart with dashed benchmark + caption, stats table minus a repeated Return row, truncation note, "+" action, long-press remove) — Tasks 12–16. Deferred Markets snapshot strip explicitly out of scope per §4's "Deferred" note. Overview/Compare/Account intentionally untouched per the user's explicit scope cut.
- **Placeholder scan**: no "TBD"/"add error handling later" steps remain; every step has complete, runnable code.
- **Type consistency**: `PerformanceStats` (Task 2) — `return`, `volatility`, `maxDrawdown`, `sharpe`, `alpha`, `beta`, `correlation` — is populated with all seven fields in `buildPerformance` (Task 10) and consumed identically by `WatchlistRow`'s `STATS_ROWS` (Task 14, which reads five of the seven — `return` shown separately on the collapsed row, per §4). `PricePoint` is structurally `{ date: string; close: number }` everywhere it's used (`returns.ts`, `regression.ts`, `marketData.ts`, `storage/prices.ts`) even though `regression.ts` re-declares it locally rather than importing, to keep that module dependency-free — confirmed this doesn't cause a mismatch since it's structural, not nominal, typing.
- **Known simplification carried from the mock**: the mock's pulsing dot animation is dropped (static circle) since no animation library is installed — noted inline in Task 14.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-17-watchlist.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
