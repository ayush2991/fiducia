# Portfolio Comparison & Charting — Design

## Context

Fiducia lets users track investment portfolios and compare their performance against benchmarks or against each other, over selectable time periods (1D, 7D, 30D, 3M, YTD, 1Y, 5Y, MAX).

A prior plan (`docs/plans/backend-foundation.md`) sketched a local-only CRUD data layer, but it only computed *current* portfolio value — it has no concept of historical performance, which the comparison/charting feature requires. This design supersedes that plan's data layer while keeping its core ideas (local-only v1, `Portfolio` with `type: 'user' | 'benchmark'`, clean abstraction for a future v2 backend migration).

Visual design is driven by an existing mockup set ("Nocturne" dark theme) covering: a Detail screen, a Compare screen, a 4-tab shell (Overview/Compare/Watchlist/Account), and an Add Portfolio flow. This spec translates those mockups into a concrete architecture and scope for v1.

## Product shape

- Users manually define portfolios (tickers + weights).
- The app fetches and caches historical daily prices to compute performance over time, not just current value.
- Users can view a single portfolio's performance vs. a benchmark (Detail screen), or overlay multiple portfolios/benchmarks (Compare screen).
- Users can also track individual tickers on a Watchlist, independent of any portfolio, and view each one's own historical performance over a selectable period — same computation machinery as a portfolio, applied to a single 100%-weighted holding, compared against a fixed S&P 500 (`SPY`) benchmark exactly like a portfolio's Detail screen (Sharpe, Volatility, Max Drawdown, Alpha, Beta, Correlation).
- No auth, no backend server. Portfolio and price data live entirely on-device and are lost on reinstall (same limitation as the original v1 plan; v2 addresses this).

## 1. Data & storage layer

**Storage: expo-sqlite** (not AsyncStorage — chosen because we're now caching years of daily price history per ticker, and SQLite gives indexed range queries instead of re-parsing full JSON blobs on every read).

Schema:

```sql
-- Portfolios and benchmarks (structurally identical; type distinguishes them)
CREATE TABLE portfolios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('user', 'benchmark'))
);

CREATE TABLE holdings (
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  weight REAL NOT NULL, -- 0-100, normalized at save time
  PRIMARY KEY (portfolio_id, ticker)
);

-- Raw daily price history, shared across all portfolios that reference a ticker
CREATE TABLE prices (
  ticker TEXT NOT NULL,
  date TEXT NOT NULL, -- ISO date
  close REAL NOT NULL,
  PRIMARY KEY (ticker, date)
);
CREATE INDEX idx_prices_ticker_date ON prices(ticker, date);

-- Tickers the user is tracking independently of any portfolio
CREATE TABLE watchlist (
  ticker TEXT PRIMARY KEY
);
```

Default benchmarks (`90/10`, `60/40 Classic`, etc., per the mockup's `ENTITIES`) are seeded as `type = 'benchmark'` rows on first launch.

## 2. Market data

**Provider: Alpha Vantage** free tier, `TIME_SERIES_DAILY` endpoint.

- On app open, for each ticker referenced by any portfolio, benchmark, or watchlist entry: check the latest cached date in `prices` for that ticker (`MAX(date) WHERE ticker = ?`). If it's not today's date, fetch (`TIME_SERIES_DAILY`, default `outputsize=compact` — the latest ~100 trading days) and upsert only the rows newer than the cached max into `prices`.
- **Once-per-day-per-ticker cap**: since `TIME_SERIES_DAILY` is end-of-day data, there is no benefit to fetching more than once per calendar day per ticker regardless of whether the market is open — refreshing intraday just re-returns the same close prices at the cost of quota. The "latest cached date is today" check above is both the staleness check and the request-budget cap, and query-layer caching (TanStack Query `staleTime`, generous enough that switching tabs doesn't re-trigger `listWatchlist`/`getPortfolioPerformance`) prevents redundant in-app refetching on top of that.
- **Compact vs. full history**: `compact` (~100 days) is enough for periods up to 3M and is what every routine refresh requests. If the user selects a period whose lookback exceeds what's currently cached for a ticker (e.g. 1Y/5Y/MAX, or a portfolio holding with under a year of cached history), fetch that one ticker again same-day with `outputsize=full` (20+ years) and upsert the additional older rows — this is a deliberate second request for that ticker on that day, traded off against not paying the larger `full` payload cost on every routine refresh.
- **Offline / rate-limited fallback**: if a fetch fails (no network, quota exceeded, API error), serve whatever is already cached and show a subtle "prices as of [date], couldn't refresh" indicator. Only show a hard error/retry state when there is no cached data at all for a ticker that's needed right now (e.g. a portfolio's first-ever fetch failed).
- Watchlist entries use the same price cache and the same compute layer as portfolios (§3) — each ticker is treated as a single 100%-weighted holding, not a live quote feed. `SPY` is fetched/cached once as the shared fixed benchmark for every watchlist ticker's Alpha/Beta/Correlation and chart overlay, under the same once-per-day cap as any other ticker.
- Share Count / Dollar-amount entry modes (see §5) need a *current* price at entry time — this is a lightweight "latest cached price, fetch if missing" lookup, not a new data path.

## 3. Computation

All derived values (return, volatility, drawdown, alpha, beta, correlation, Sharpe) are computed **in memory, on demand**, from the single raw `prices` cache — there is no precomputed per-period stats cache. Given the actual data volume (a few thousand floats per ticker), this is simpler than maintaining derived caches and avoids invalidation bugs.

**Portfolio value series (static-weight backtest)**: given a portfolio's *current* holdings/weights and a lookback window, combine each held ticker's price series (normalized to a common start) using those weights, held constant across the whole window. This does **not** track historical allocation changes — if a user edits their holdings, past chart data reflects the new weights applied retroactively, not what was actually held historically. This was chosen for simplicity; tracking real allocation-change history is a possible v2 enhancement.

**Period → lookback window**: `1D, 7D, 30D, 3M, YTD, 1Y, 5Y` map to their literal calendar windows. `MAX` and any period exceeding a holding's available history are **truncated to the shortest available price history among the portfolio's currently-held tickers** (e.g. a portfolio holding GLD, which IPO'd in 2004, can't chart further back than 2004 for that portfolio). The UI shows a small "data from [date]" note when a period has been truncated this way.

**Derived stats** (per period, computed from the sliced daily-return series):
- **Return**: cumulative % change over the window.
- **Volatility**: annualized standard deviation of daily returns.
- **Max Drawdown**: largest peak-to-trough decline in the value series over the window.
- **Alpha, Beta, Correlation**: from an ordinary least-squares regression of the portfolio's daily returns against the selected benchmark's daily returns over the same window.
- **Sharpe Ratio**: `(annualized return − risk-free rate) / annualized volatility`, using a **hardcoded risk-free rate constant** (e.g. 4%) rather than a fetched treasury yield — simplest option, adequate for a comparison tool that isn't providing financial advice.

**Chart rendering**: the raw daily series is downsampled to ~100–150 points for longer periods (1Y/5Y/MAX) for smooth SVG rendering; shorter periods (1D–3M) render at or near full daily resolution.

**Watchlist tickers as synthetic single-holding portfolios**: a watchlist ticker's performance is computed by the same return/volatility/max-drawdown/Sharpe/regression functions as a portfolio, called with one synthetic holding at 100% weight and a **fixed benchmark of `SPY`** (not user-selectable, unlike a portfolio's Detail screen). This reuses `returns.ts`/`risk.ts`/`backtest.ts`/`regression.ts` as-is — a watchlist ticker's `PerformanceStats` is populated exactly like a portfolio's: Return, Sharpe Ratio, Volatility, Max Drawdown, Alpha, Beta, Correlation, all computed against `SPY`'s daily-return series over the same window.

## 4. Navigation & screens

Bottom tab bar, 4 tabs, matching the "Nocturne — 4-Tab Shell" mockup: **Overview | Compare | Watchlist | Account**.

### Overview tab
Shows the **Detail screen** (matches "Nocturne Detail" mockup) for the currently active portfolio:
- Header: portfolio name + chevron (opens portfolio switcher).
- Big return headline, "vs Benchmark X +Y% · period" subtitle.
- Horizontal period pills (1D/7D/30D/3M/YTD/1Y/5Y/MAX).
- Line chart: gradient glow fill under the portfolio line, dashed benchmark line, dashed crosshair + pulsing dot at the latest point, floating value pill, gridlines with high/low labels (this is the finalized "2a" style from the mockup's design exploration — glow area + crosshair combined). **Interactive scrubbing**: dragging a finger across the chart moves the crosshair/dot/pill to track the touch position, updates the pill to that day's return-to-date, and shows the scrubbed date; releasing snaps the crosshair back to the latest point.
- Toggle chips below the chart to show/hide the portfolio or benchmark line independently.
- Statistics table: Sharpe Ratio, Volatility, Max Drawdown, Alpha, Beta, Correlation (last three shown for the portfolio only; benchmark column shows "—" for those three).
- Holdings list: ticker badge, name, weight bar, weight %.

**Portfolio switcher**: tapping the name/chevron opens a bottom sheet listing all user portfolios (radio-style active selection) plus "+ Add Portfolio".

**Empty state**: if the user has zero portfolios, the tab shows a centered "No portfolios yet" message with a "+ Add Portfolio" CTA instead of the chart.

### Compare tab
Matches "Nocturne Compare" mockup:
- Header: "Compare", count of currently-visible entities.
- Same period pills.
- Multi-line overlay chart: all portfolios and benchmarks shown by default, each with a distinct color/dash style (per the mockup's `ENTITY_STYLES`).
- Tappable list below the chart ("Portfolios & Benchmarks"): color dot, name, holdings summary, stat line (Sharpe/Vol/MaxDD), period return %. Tapping a row toggles that entity's line on/off (opacity-fades when hidden).

### Watchlist tab (real, functional)
A list of individually-tracked tickers (independent of any portfolio), showing each ticker's own historical performance — not a live quote feed:
- **Header**: "Watchlist" title, a "+" action to add a ticker (simple ticker entry/validation against the market-data API — no holdings math).
- **Global period pills** (1D/7D/30D/3M/YTD/1Y/5Y/MAX, same set and default as Overview/Compare) — apply to every row's return figure and to whichever ticker is currently expanded. Changing the period recomputes every ticker's stats/series from the cache (in-memory, no new fetch unless the newly-selected period's lookback exceeds what's cached for a given ticker, per §2).
- **Collapsed row**: ticker badge, name, ticker symbol, and the period return (colored green/red), with a chevron indicating expand/collapse.
- **Tapping a row expands it in place**, revealing:
  - A line chart of the ticker's value over the selected period, in the same visual style as the Overview chart's portfolio line — gradient glow fill, gridlines with high/low labels, dashed crosshair + pulsing dot at the latest point, floating value pill, **the same drag-to-scrub crosshair tracking described in the Overview tab** — **plus a dashed `SPY` benchmark line** (fixed, not toggleable) with a caption below the chart: "Dashed line: S&P 500 · same period".
  - A stats block: Sharpe Ratio, Volatility, Max Drawdown, Alpha, Beta, Correlation — all vs. `SPY` — matching the portfolio Detail screen's stats table exactly (Return is already shown on the collapsed row, so it's not repeated here).
  - The same "data from [date]" truncation note as portfolios when the selected period exceeds the ticker's or `SPY`'s available cached history.
- Remove via long-press row action → confirm.

**Deferred (not in the first watchlist implementation)**: a "Markets" snapshot strip above the list (index/commodity/yield mini-cards) appears in the latest mock but needs data sources beyond per-ticker daily-close prices (an index level, a commodity price, a treasury yield) — tracked as a follow-up, not scoped here.

### Account tab (stub)
Static placeholder screen only — no profile data, no auth, no "Log Out." Just enough presence to match the tab bar visually (e.g. "Account features coming soon"). Real auth is deferred to the v2 backend migration.

### Add Portfolio flow
Matches "Nocturne Add Portfolio" mockup:
- Name field.
- Mode selector, all 4 modes built for v1:
  - **Allocation %** — direct entry, must sum close to 100% (UI flags the running total if it drifts, doesn't hard-block).
  - **Raw Weights** — any relative numbers, auto-normalized to 100% on save.
  - **Share Count** — shares owned × current price (via the market-data "latest price" lookup) → allocation.
  - **Dollar ($)** — dollar amount invested ÷ total → allocation.
- Regardless of entry mode, the portfolio is persisted as normalized `{ticker, weight}` pairs — downstream computation (§3) doesn't know or care which mode was used.
- Row-level ticker validation (unknown ticker → inline error, must fix/remove before saving).
- Duplicate ticker rows are merged (weights summed) on save.
- Save disabled until at least one valid ticker with non-zero weight exists.

## 5. Error handling summary

| Situation | Behavior |
|---|---|
| Market data fetch fails, cache exists | Serve cached data, show "prices as of [date], couldn't refresh" |
| Market data fetch fails, no cache | Show retry state for that ticker/screen |
| Offline | Same as fetch failure — serve cache, indicate staleness |
| Period exceeds a holding's available history | Truncate to shortest available history among holdings, show "data from [date]" note |
| Unknown/invalid ticker in Add Portfolio | Inline row error, blocks save until fixed |
| Duplicate ticker rows | Merge weights on save |
| Empty portfolio (no valid holdings) | Save button disabled |
| Allocation % total ≠ 100% | Visual warning on running total, does not hard-block save |

## 6. Testing & verification

- `npx tsc --noEmit` for type safety.
- **Unit tests** (Jest) for the pure computation functions — period return, volatility, max drawdown, alpha/beta/correlation regression, static-weight portfolio value backtest, chart downsampling — using hand-computed fixture data, since correctness here is the core product value.
- **Manual verification** via `npm start`: create a portfolio in each of the 4 entry modes; switch between portfolios via the switcher; toggle period and series visibility on both Detail and Compare; add/remove Watchlist tickers, change the Watchlist's global period and confirm every row's return updates, expand a row and confirm its chart shows a dashed SPY benchmark line and its stats include Alpha/Beta/Correlation; force offline (airplane mode) and confirm cached data still renders with a staleness indicator; confirm the empty state renders with zero portfolios/zero watchlist tickers; confirm the truncated-history note appears for a period exceeding a holding's or watchlist ticker's history.

## 7. Code architecture

Carried forward from `backend-foundation.md`'s core goal: **UI code never touches SQLite or the market-data API directly** — it only calls functions in `src/lib/api/*`. This is the seam that lets v2 swap in Supabase-backed persistence without touching a single screen.

```
src/
  lib/
    api/                 ← the only layer UI code calls into
      types.ts
      portfolios.ts      ← CRUD for portfolios/holdings
      marketData.ts      ← price fetch/cache/refresh, latest-price lookup
      compare.ts         ← performance + comparison queries (composes storage + compute)
      watchlist.ts       ← CRUD for watchlist tickers
    storage/
      db.ts              ← SQLite connection + migrations
      portfolios.ts      ← SQL queries: portfolios, holdings
      prices.ts          ← SQL queries: prices (range slicing by ticker+date)
      watchlist.ts       ← SQL queries: watchlist
    compute/             ← pure functions, no I/O — the unit-tested core from §6
      returns.ts         ← period return, cumulative series
      risk.ts            ← volatility, max drawdown, Sharpe
      regression.ts      ← alpha, beta, correlation
      downsample.ts      ← chart point reduction
      backtest.ts        ← static-weight portfolio value series from ticker price series
  screens/
    OverviewScreen.tsx
    CompareScreen.tsx
    WatchlistScreen.tsx
    AccountScreen.tsx
    AddPortfolioScreen.tsx
  components/
    PortfolioSwitcherSheet.tsx
    PeriodPills.tsx
    PerformanceChart.tsx
    StatsTable.tsx
    HoldingsList.tsx
```

**Type contracts** (`src/lib/api/types.ts`) — supersede backend-foundation.md's current-value-only types, since Compare now shows N entities rather than a single pairwise diff:

```typescript
export interface Holding {
  ticker: string;
  weight: number; // 0-100, normalized
}

export interface Portfolio {
  id: string;
  name: string;
  type: 'user' | 'benchmark';
  holdings: Holding[];
}

export type PeriodKey = '1D' | '7D' | '30D' | '3M' | 'YTD' | '1Y' | '5Y' | 'MAX';

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
  alpha?: number;   // present when computed against a benchmark
  beta?: number;
  correlation?: number;
}

export interface PortfolioPerformance {
  portfolio: Portfolio;
  series: PerformanceSeries;
  stats: PerformanceStats;
}

export interface WatchlistTickerPerformance {
  ticker: string;
  name: string;
  price: number; // latest cached close, for display — series.points are indexed to 100, not dollars
  series: PerformanceSeries;
  stats: PerformanceStats; // alpha/beta/correlation always present — computed against the fixed SPY benchmark
}
```

**API function signatures** (`src/lib/api/*`):

```typescript
// portfolios.ts
listPortfolios(type?: 'user' | 'benchmark'): Promise<Portfolio[]>
createPortfolio(name: string, type: 'user' | 'benchmark', holdings: Holding[]): Promise<Portfolio>
updatePortfolioHoldings(portfolioId: string, holdings: Holding[]): Promise<void>
deletePortfolio(portfolioId: string): Promise<void>

// marketData.ts
refreshMarketData(): Promise<void>              // delta-fetch on app open, per §2
getLatestPrice(ticker: string): Promise<number>  // for Share Count / Dollar entry modes

// compare.ts
getPortfolioPerformance(portfolioId: string, period: PeriodKey, benchmarkId?: string): Promise<PortfolioPerformance>
compareEntities(entityIds: string[], period: PeriodKey): Promise<PortfolioPerformance[]>

// watchlist.ts
listWatchlist(period: PeriodKey): Promise<WatchlistTickerPerformance[]>
addWatchlistTicker(ticker: string): Promise<void>
removeWatchlistTicker(ticker: string): Promise<void>
```

**State management**: TanStack Query (React Query) for all async data flowing through `src/lib/api/*` — portfolio lists, performance/comparison results, watchlist — keyed by portfolio/period so switching periods or portfolios just changes the query key rather than requiring manual cache invalidation. Purely local UI state (active tab, active portfolio selection, which period pill is selected, which compare entities are toggled visible) stays in plain React component state — the app's scope doesn't need a global store like Zustand or Redux on top of that.

## Path to v2 (unchanged from original plan's intent)

When persistence is added later: replace the SQLite-backed storage/query layer with a Supabase-backed equivalent (same function signatures), add real auth (unlocking a real Account tab), add RLS so users see their own portfolios but all benchmarks, and consider moving price-history fetching server-side (e.g. a scheduled Edge Function) so history isn't re-fetched per device. Screens and computation logic (§3) don't change — only where the raw data comes from.
