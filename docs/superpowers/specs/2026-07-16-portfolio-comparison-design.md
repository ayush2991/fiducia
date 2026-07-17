# Portfolio Comparison & Charting — Design

## Context

Fiducia lets users track investment portfolios and compare their performance against benchmarks or against each other, over selectable time periods (1D, 7D, 30D, 3M, YTD, 1Y, 5Y, MAX).

A prior plan (`docs/plans/backend-foundation.md`) sketched a local-only CRUD data layer, but it only computed *current* portfolio value — it has no concept of historical performance, which the comparison/charting feature requires. This design supersedes that plan's data layer while keeping its core ideas (local-only v1, `Portfolio` with `type: 'user' | 'benchmark'`, clean abstraction for a future v2 backend migration).

Visual design is driven by an existing mockup set ("Nocturne" dark theme) covering: a Detail screen, a Compare screen, a 4-tab shell (Overview/Compare/Watchlist/Account), and an Add Portfolio flow. This spec translates those mockups into a concrete architecture and scope for v1.

## Product shape

- Users manually define portfolios (tickers + weights).
- The app fetches and caches historical daily prices to compute performance over time, not just current value.
- Users can view a single portfolio's performance vs. a benchmark (Detail screen), or overlay multiple portfolios/benchmarks (Compare screen).
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

- On app open, for each ticker referenced by any portfolio, benchmark, or watchlist entry: check the latest cached date in `prices` for that ticker (`MAX(date) WHERE ticker = ?`). If stale (not today, accounting for market days), fetch only the missing tail rather than the full history, and upsert into `prices`.
- Given the free tier's low daily request quota, this delta-fetch approach is required — refetching full history for every ticker on every open would exhaust the quota immediately with more than a couple of tickers.
- **Offline / rate-limited fallback**: if a fetch fails (no network, quota exceeded, API error), serve whatever is already cached and show a subtle "prices as of [date], couldn't refresh" indicator. Only show a hard error/retry state when there is no cached data at all for a ticker that's needed right now (e.g. a portfolio's first-ever fetch failed).
- Watchlist entries use the same price cache; a sparkline is derived from the last ~24 cached points.
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

## 4. Navigation & screens

Bottom tab bar, 4 tabs, matching the "Nocturne — 4-Tab Shell" mockup: **Overview | Compare | Watchlist | Account**.

### Overview tab
Shows the **Detail screen** (matches "Nocturne Detail" mockup) for the currently active portfolio:
- Header: portfolio name + chevron (opens portfolio switcher).
- Big return headline, "vs Benchmark X +Y% · period" subtitle.
- Horizontal period pills (1D/7D/30D/3M/YTD/1Y/5Y/MAX).
- Line chart: gradient glow fill under the portfolio line, dashed benchmark line, dashed crosshair + pulsing dot at the latest point, floating value pill, gridlines with high/low labels (this is the finalized "2a" style from the mockup's design exploration — glow area + crosshair combined).
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
A list of individually-tracked tickers (independent of any portfolio), reusing the price-cache layer:
- Each row: ticker badge, name, sparkline (from cached price history), current price, % change.
- "+" action to add a ticker (simple ticker entry/validation against the market-data API — no holdings math).
- Remove via swipe or row action.

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
- **Manual verification** via `npm start`: create a portfolio in each of the 4 entry modes; switch between portfolios via the switcher; toggle period and series visibility on both Detail and Compare; add/remove Watchlist tickers; force offline (airplane mode) and confirm cached data still renders with a staleness indicator; confirm the empty state renders with zero portfolios; confirm the truncated-history note appears for a period exceeding a holding's history.

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

export interface WatchlistItem {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  sparkline: { date: string; close: number }[];
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
listWatchlist(): Promise<WatchlistItem[]>
addWatchlistTicker(ticker: string): Promise<void>
removeWatchlistTicker(ticker: string): Promise<void>
```

**State management**: TanStack Query (React Query) for all async data flowing through `src/lib/api/*` — portfolio lists, performance/comparison results, watchlist — keyed by portfolio/period so switching periods or portfolios just changes the query key rather than requiring manual cache invalidation. Purely local UI state (active tab, active portfolio selection, which period pill is selected, which compare entities are toggled visible) stays in plain React component state — the app's scope doesn't need a global store like Zustand or Redux on top of that.

## Path to v2 (unchanged from original plan's intent)

When persistence is added later: replace the SQLite-backed storage/query layer with a Supabase-backed equivalent (same function signatures), add real auth (unlocking a real Account tab), add RLS so users see their own portfolios but all benchmarks, and consider moving price-history fetching server-side (e.g. a scheduled Edge Function) so history isn't re-fetched per device. Screens and computation logic (§3) don't change — only where the raw data comes from.
