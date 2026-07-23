# Expanded Period Pills (1D–5Y) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current four period pills (`1D`/`7D`/`30D`/`3M`) with nine
(`1D`/`1W`/`1M`/`3M`/`6M`/`YTD`/`1Y`/`3Y`/`5Y`), default to `1Y`, and make sure the
once-a-day-per-ticker price fetch already pulls enough history to serve the longest
new period (`5Y`) without a second network round trip.

**Architecture:** `PeriodKey` (in `src/lib/api/types.ts`) is the single source of truth
for which periods exist; `periodStartDate` (in `src/lib/compute/returns.ts`) converts a
period + reference date into a start date using calendar arithmetic; `sliceToPeriod`
windows a ticker's full cached price history down to that start date entirely in memory.
None of that requires new I/O — the only thing that needs to grow is how far back the
Tiingo provider's once-a-day fetch reaches, since Tiingo requires an explicit `startDate`
query param (Financial Modeling Prep does not bound its response, so it needs no change).

**Tech Stack:** TypeScript, Jest + ts-jest (existing `jest.config.js`/`tsconfig.jest.json`).

## Global Constraints

- `PeriodKey` values, in order: `1D`, `1W`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `5Y`.
- `DEFAULT_PERIOD` is `1Y`.
- `1D`/`1W` use fixed day-count subtraction; `1M`/`3M`/`6M`/`1Y`/`3Y`/`5Y` use calendar
  month/year arithmetic (`setUTCMonth`/`setUTCFullYear`), not day multiplication — avoids
  leap-year drift and matches "N months/years ago" semantics.
- `YTD` starts at `January 1` of the reference date's year.
- Tiingo's once-a-day fetch window (`HISTORY_LOOKBACK_DAYS` in
  `src/lib/api/providers/tiingo.ts`) must cover at least 5 calendar years back from today,
  so selecting `5Y` never triggers a second fetch on top of the daily refresh.
- No changes to `src/lib/api/providers/financialModelingPrep.ts`, `src/lib/api/priceSync.ts`,
  `src/lib/storage/prices.ts`, `src/components/period-pills.tsx`, or any screen — they are
  already generic over `PeriodKey`/`PERIODS`.

---

### Task 1: Widen `PeriodKey` and switch `periodStartDate` to calendar arithmetic

**Files:**
- Modify: `src/lib/api/types.ts:1-7`
- Modify: `src/lib/compute/returns.ts:1-18`
- Test: `src/lib/compute/returns.test.ts:11-19`

**Interfaces:**
- Consumes: nothing new — `PeriodKey` and `periodStartDate` are the base types/functions
  everything else in this plan and the rest of the app already imports.
- Produces: `PeriodKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y'`,
  `PERIODS: PeriodKey[]`, `DEFAULT_PERIOD: PeriodKey = '1Y'` (from `types.ts`); and
  `periodStartDate(period: PeriodKey, referenceDate: string): string` (from `returns.ts`,
  unchanged signature, new internals) — `sliceToPeriod`, `compare.ts`, `watchlist.ts` all call
  this and need no changes since the signature is identical.

- [ ] **Step 1: Update the failing test expectations in `returns.test.ts`**

Replace the `periodStartDate` describe block (currently lines 11–19) with:

```ts
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
```

Also update the two other `describe` blocks in this file that use the now-renamed periods
(`'7D'` → `'1W'`, `'30D'` → `'1M'`) so the whole file compiles under the new `PeriodKey`:

```ts
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
```

(The `toIndexedSeries`/`periodReturn`/`dailyReturns`/`tradingDaySpan` describe blocks below
that don't reference period keys are unchanged.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/compute/returns.test.ts`
Expected: FAIL — either a TypeScript error (`'7D'`/`'30D'`/`'1M'`/`'YTD'`/etc. not assignable
to `PeriodKey`, since `types.ts` hasn't changed yet) or, once `types.ts` is updated in the next
step, assertion failures against the still-old day-multiplication `periodStartDate`.

- [ ] **Step 3: Widen `PeriodKey` in `types.ts`**

Replace lines 1–7 of `src/lib/api/types.ts`:

```ts
// 1D/1W use fixed day-count subtraction; 1M/3M/6M/1Y/3Y/5Y use calendar month/year
// arithmetic (not day multiplication, which drifts across leap years); YTD starts at
// January 1 of the reference year. See periodStartDate in src/lib/compute/returns.ts.
// The Tiingo provider's once-a-day fetch window is sized to cover the longest period
// (5Y) so switching periods never triggers a second fetch — see HISTORY_LOOKBACK_DAYS
// in src/lib/api/providers/tiingo.ts.
export type PeriodKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y';

export const PERIODS: PeriodKey[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'];

export const DEFAULT_PERIOD: PeriodKey = '1Y';
```

- [ ] **Step 4: Rewrite `periodStartDate` in `returns.ts` with calendar arithmetic**

Replace lines 1–18 of `src/lib/compute/returns.ts`:

```ts
import type { PeriodKey } from '@/lib/api/types';

export type PricePoint = { date: string; close: number };

export function periodStartDate(period: PeriodKey, referenceDate: string): string {
  if (period === 'YTD') {
    return `${referenceDate.slice(0, 4)}-01-01`;
  }
  const start = new Date(`${referenceDate}T00:00:00Z`);
  switch (period) {
    case '1D':
      start.setUTCDate(start.getUTCDate() - 1);
      break;
    case '1W':
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case '1M':
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    case '3M':
      start.setUTCMonth(start.getUTCMonth() - 3);
      break;
    case '6M':
      start.setUTCMonth(start.getUTCMonth() - 6);
      break;
    case '1Y':
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      break;
    case '3Y':
      start.setUTCFullYear(start.getUTCFullYear() - 3);
      break;
    case '5Y':
      start.setUTCFullYear(start.getUTCFullYear() - 5);
      break;
  }
  return start.toISOString().slice(0, 10);
}
```

This drops the old `PERIOD_DAYS` record entirely — leave the rest of the file (`sliceToPeriod`
onward) unchanged; it already just calls `periodStartDate(period, today)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/lib/compute/returns.test.ts`
Expected: PASS (all `describe` blocks in the file).

- [ ] **Step 6: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. This confirms every other caller of `PeriodKey`/`PERIODS`/`DEFAULT_PERIOD`
(`period-pills.tsx`, `compare/index.tsx`, `watchlist/index.tsx`, `overview/index.tsx`,
`compare.ts`, `watchlist.ts`) still compiles unchanged, since none of them reference period
keys as string literals — they're generic over the type.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api/types.ts src/lib/compute/returns.ts src/lib/compute/returns.test.ts
git commit -m "$(cat <<'EOF'
feat: expand period pills to 1D-5Y with calendar-accurate start dates

Widens PeriodKey from 1D/7D/30D/3M to 1D/1W/1M/3M/6M/YTD/1Y/3Y/5Y and
defaults to 1Y. periodStartDate now uses calendar month/year arithmetic
for 1M+ periods instead of fixed day-count multiplication, which drifted
across leap years.
EOF
)"
```

---

### Task 2: Extend Tiingo's fetch window to cover 5 years

**Files:**
- Modify: `src/lib/api/providers/tiingo.ts:9-21`
- Test: `src/lib/api/providers/tiingo.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `tiingoProvider.fetchDailySeries(ticker, apiKey)` (unchanged signature) now
  requests history starting ~1900 days before today instead of ~130.

- [ ] **Step 1: Write the failing test**

Add this new `describe` block to `src/lib/api/providers/tiingo.test.ts` (after the existing
`describe('tiingoProvider.fetchDailySeries', ...)` block, before
`describe('tiingoProvider.lookupCompanyName', ...)`):

```ts
describe('tiingoProvider.fetchDailySeries startDate window', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requests a startDate far enough back to cover the 5Y period', async () => {
    mockFetchOnce(200, [{ date: '2024-01-01T00:00:00.000Z', close: 100 }]);
    await tiingoProvider.fetchDailySeries('SPY', 'key');
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    const startDate = new URL(calledUrl).searchParams.get('startDate');
    expect(startDate).toBe('2021-05-04');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/api/providers/tiingo.test.ts`
Expected: FAIL — `startDate` is computed from the current `HISTORY_LOOKBACK_DAYS = 130`, so
`new URL(calledUrl).searchParams.get('startDate')` won't equal `'2021-05-04'` (it'll be a date
~130 days before `2026-07-17`, i.e. `'2026-03-09'`).

- [ ] **Step 3: Bump `HISTORY_LOOKBACK_DAYS` in `tiingo.ts`**

Replace lines 9–21 of `src/lib/api/providers/tiingo.ts`:

```ts
// Without a startDate, Tiingo's /prices endpoint returns only the single most
// recent trading day, not a history — so every fetch must request an explicit
// range. 1900 calendar days comfortably covers the longest supported period
// (5Y = 5 calendar years, i.e. ~1826-1827 days depending on leap years) plus a
// buffer for weekends/holidays and a lookback day for return calculations. This
// window is fetched once per ticker per calendar day (see ensureFreshHistory in
// src/lib/api/priceSync.ts) and cached in full, so every period from 1D to 5Y is
// served by slicing that single cached window — switching periods never triggers
// another fetch.
const HISTORY_LOOKBACK_DAYS = 1900;

function startDateParam(): string {
  const start = new Date();
  start.setDate(start.getDate() - HISTORY_LOOKBACK_DAYS);
  return start.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/api/providers/tiingo.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Run the full test suite and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS / no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/providers/tiingo.ts src/lib/api/providers/tiingo.test.ts
git commit -m "$(cat <<'EOF'
feat: widen Tiingo history lookback to cover 5Y period

HISTORY_LOOKBACK_DAYS was sized for the old 3M-max period set (130
days). Bumped to 1900 days so the existing once-a-day fetch already
covers the new 5Y period without a second fetch.
EOF
)"
```

---

### Task 3: Verify in the simulator

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Launch the app**

Use the `run-emulator` skill (or `npm start` + `npm run ios`) to launch the app with a fresh
Metro server (not `CI=1`, so edits are picked up) and a dev-seeded market data provider (see
CLAUDE.md's `seedDevProviderFromEnv` note — requires `EXPO_PUBLIC_TIINGO_API_KEY` or
`EXPO_PUBLIC_FMP_API_KEY` in `.env`, and a full Metro restart if `.env` just changed).

- [ ] **Step 2: Screenshot Overview with the new pills**

Deep-link or navigate to a portfolio detail screen. Screenshot
(`xcrun simctl io booted screenshot`) and confirm: 9 pills render (`1D 1W 1M 3M 6M YTD 1Y 3Y 5Y`),
`1Y` is selected by default, the pill row scrolls horizontally without clipping, and the chart/stats
render for the default `1Y` selection.

- [ ] **Step 3: Tap through several pills and confirm no repeated loading spinner**

Tap `5Y`, then `YTD`, then `1M`. Screenshot after each. Confirm the chart updates each time
without a loading/spinner state reappearing (proves no re-fetch is happening — Task 1/2 already
guarantee this at the code level, this step confirms it visually) and that `5Y`'s chart shows a
plausible multi-year date range.

- [ ] **Step 4: Repeat on Compare and Watchlist**

Both screens use the same `PERIODS`/`PeriodKey`/`period-pills.tsx`. Screenshot each with the
default `1Y` period selected and after tapping `5Y`, confirming the same 9-pill row and no
regressions (per CLAUDE.md's "Verifying UI changes" — check every screen touched, not just one).

- [ ] **Step 5: Report results**

If any screenshot shows a layout problem (e.g. pill row clipping, overlap) or incorrect data,
note it — it's outside this plan's code changes (pills/screens weren't modified) but should be
flagged before considering the feature done.
