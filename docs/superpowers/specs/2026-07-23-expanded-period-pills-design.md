# Expanded period pills (1D–5Y)

## Goal

Replace the current four-period set (`1D`/`7D`/`30D`/`3M`) with nine periods matching the
original mock's range: `1D`, `1W`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `5Y`. The default
selected period changes from `3M` to `1Y`, matching the mock's `DEFAULT_PERIOD`.

Selecting any of the new, longer periods must not trigger an additional network fetch beyond
the existing once-a-day-per-ticker refresh — the longest period (`5Y`) must already be covered
by that single fetch.

## Background: why this is safe without touching the fetch cadence

`ensureFreshHistory` (`src/lib/api/priceSync.ts`) already fetches one fixed history window per
ticker per calendar day, independent of which period is currently selected on screen.
`getAllPrices` (`src/lib/storage/prices.ts`) returns the *entire* cached history for a ticker,
uncapped. `sliceToPeriod` (`src/lib/compute/returns.ts`) then windows that full cached history
down to the selected period, entirely in memory, with no I/O. So the "fetch once" cap is
unaffected by adding more period options — the only thing that needs to change is **how much**
history that once-a-day fetch pulls, so a `5Y` slice request always has 5 years of cache to draw
from.

## Changes

### 1. `src/lib/api/types.ts`

```ts
export type PeriodKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y';
export const PERIODS: PeriodKey[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'];
export const DEFAULT_PERIOD: PeriodKey = '1Y';
```

`PeriodKey` is never persisted (only ever lives in a screen's `useState`), so renaming
`7D`→`1W` and `30D`→`1M` is a clean rename, not a data migration. Update the header comment
above `PeriodKey` — it currently says periods are "capped to what every supported provider's
free tier can actually back with full history"; this change is exactly that plan being carried
out (see §2 below), so the comment should describe the new lookback instead of warning against
extending it further.

### 2. `src/lib/compute/returns.ts` — `periodStartDate`

The current implementation multiplies a fixed day-count (`PERIOD_DAYS[period]`) against the
reference date. That works for `1D`/`1W` (a day/a week is unambiguously N calendar days), but
multiplying days out to `1M`/`3M`/`6M`/`1Y`/`3Y`/`5Y` doesn't actually mean "N months/years ago"
— e.g. `5 * 365 = 1825` days drifts against the actual calendar date once leap years are crossed
(a real "5 years ago" is 1826 or 1827 days back, depending how many Feb 29ths fall in the
window), and doesn't match what a user means by "1 month ago" (28–31 days depending on the
month). The mock's own period labels confirm calendar-relative semantics (`'3mo ago'`, `'1yr ago'`,
`'5yr ago'`), so switch to calendar-date arithmetic (`setUTCMonth`/`setUTCFullYear`) for anything
month-or-longer, keeping day arithmetic only for `1D`/`1W`:

```ts
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

This drops the `PERIOD_DAYS` record entirely — every branch is a direct calendar-arithmetic
statement instead of a day-count lookup multiplied out. `sliceToPeriod` and everything downstream
(`compare.ts`, `watchlist.ts`, `buildPerformance`) call `periodStartDate` already and need no
changes — they're generic over `PeriodKey`.

### 3. `src/lib/api/providers/tiingo.ts` — extend the lookback window

Tiingo's `/prices` endpoint requires an explicit `startDate` or it returns only the latest day.
Bump `HISTORY_LOOKBACK_DAYS` from `130` to `1900` (5 years of calendar days + weekends/holidays
+ one lookback day for return calculations), and update the comment explaining the constant to
reference `5Y` instead of `3M` as the longest supported period.

### 4. `src/lib/api/providers/financialModelingPrep.ts` — no change

The `historical-price-full` call already has no date bound (that's why 130 days of Tiingo
history was previously sufficient without any FMP-specific range logic) — it should already
return enough history for 5Y. If a given ticker's FMP-side history is shorter than 5Y, the
existing `truncatedFrom` mechanism (already exercised for shorter periods when a ticker IPO'd
recently) surfaces that gracefully rather than silently mislabeling the data — no new handling
needed.

### 5. UI — no logic changes

`period-pills.tsx`, `compare/index.tsx`, `watchlist/index.tsx`, `overview/index.tsx` are already
generic over `PERIODS`/`PeriodKey`; they'll automatically render all 9 pills. The pill row is
already a horizontal `ScrollView`, so it scrolls through 9 pills the same way it scrolled
through 4.

### 6. Tests

- `src/lib/compute/returns.test.ts`: update the `periodStartDate`/`sliceToPeriod` cases to use
  the renamed periods (`7D`→`1W`, `30D`→`1M`), add a case for `YTD` (e.g.
  `periodStartDate('YTD', '2026-07-17')` → `'2026-01-01'`), and add cases exercising the new
  calendar-arithmetic branches — e.g. `periodStartDate('1Y', '2026-07-17')` → `'2025-07-17'` and
  `periodStartDate('5Y', '2026-07-17')` → `'2021-07-17'` — plus one case that crosses a leap day
  (e.g. a `1Y` or `3Y` request from a late-Feb reference date) to confirm the calendar arithmetic
  doesn't drift the way fixed day-multiplication would have.
- Provider tests (`tiingo.test.ts`, `financialModelingPrep.test.ts`) test response parsing, not
  the lookback constant — no changes expected, but re-run them to confirm.

## Verification

- `npx tsc --noEmit` and `npm test` after the change.
- In the simulator: cycle through all 9 pills on Overview, a portfolio detail screen, Compare,
  and Watchlist, and confirm each renders a plausible chart/stats without a visible re-fetch
  delay when switching between them (only the very first load per ticker per day should show
  loading state).
