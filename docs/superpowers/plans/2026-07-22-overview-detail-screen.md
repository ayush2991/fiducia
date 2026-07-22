# Overview (Detail Screen) Completion — Findings & Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Findings (implementation audit, 2026-07-22)

A full pass over `src/` against `docs/superpowers/specs/2026-07-16-portfolio-comparison-design.md` and `CLAUDE.md` found the app in good shape overall: `npx tsc --noEmit` is clean, all 57 Jest tests pass, and there are no `TODO`/`FIXME`/stub markers anywhere in source. Compare, Watchlist, Add Portfolio (all 4 entry modes), Add Ticker, Account/provider settings, and the compute layer (`returns`/`risk`/`regression`/`backtest`/`chartGeometry`) are all fully built and match spec.

**The one substantial gap:** the Overview tab — the single-portfolio "Detail screen," arguably the app's flagship view — is missing its entire performance/analytics half.

- `src/screens/overview/index.tsx` currently renders only a portfolio-name switcher (bottom sheet, works correctly) and a static holdings list. Per spec §4 "Overview tab" (and CLAUDE.md's description of the Detail screen), it is missing:
  - The big return headline and "vs Benchmark X +Y% · period" subtitle
  - Period pills (1D/7D/30D/3M)
  - The performance chart (gradient glow, dashed benchmark line, drag-to-scrub crosshair)
  - Toggle chips to show/hide the portfolio or benchmark line independently
  - The Sharpe/Volatility/Max Drawdown/Alpha/Beta/Correlation statistics table (Portfolio vs. Bench. columns)
  - The "data from [date]" truncated-history note
  - The "no market data provider configured" empty state (Compare and Watchlist both have this; Overview doesn't, because it currently fetches no market data at all)
- Root cause: `src/lib/api/compare.ts` only implements `compareEntities()` (every portfolio overlaid vs. SPY, for the Compare tab). It's missing `getPortfolioPerformance(portfolioId, period)` — the single-portfolio-vs-benchmark function the design doc's §7 API surface calls for. Nothing calls it because it doesn't exist.
- This is a wiring/composition gap, not a missing-foundation problem: `PerformanceChart` (gradient fill, crosshair scrub, dashed benchmark line) already exists and is fully working — it's used correctly in `watchlist-row.tsx`. The regression/risk/backtest math it needs is already built and tested. Overview just never calls into any of it.

**Confirmed non-gaps** (intentional deviations from the original spec doc, documented in CLAUDE.md, not to be "fixed"):
- Account tab is a full BYOK provider picker, not the spec's "stub" placeholder.
- Watchlist's "Markets" snapshot strip is explicitly deferred in the spec.
- `PeriodKey` capped to 1D/7D/30D/3M (no YTD/1Y/5Y/MAX) — justified by Alpha Vantage's free-tier `compact`-only limitation.

## Decisions

Two things the spec/mock leave ambiguous, resolved in conversation with the user before writing this plan:

1. **Benchmark is fixed, not user-selectable, for this pass.** The decoded mock (`docs/mock-reference.html`, `data-screen-label="Nocturne Detail"`) shows the "vs Benchmark 90/10" subtitle and the "Benchmark 90/10" toggle chip as plain hardcoded text with no chevron/picker affordance next to them — unlike the portfolio-name row, which has an explicit chevron opening the switcher sheet. So a fixed benchmark (no picker UI) matches the mock's actual interactivity, not just a simplification.
2. **The fixed benchmark is `SPY` (S&P 500) directly, not the seeded "90/10 Benchmark" portfolio the mock's literal copy shows.** User's explicit call: keep v1 simple and consistent with the pattern Watchlist and Compare already use (`BENCHMARK_TICKER = 'SPY'` in both `compare.ts` and `watchlist.ts`) — a single raw ticker series, not a second weighted backtest.

**Documented future direction (not built now):** the user wants to eventually let a user pick a benchmark, and even plot *multiple* benchmarks at once on Overview (e.g. S&P 500 *and* a 60/40 portfolio overlaid against the active portfolio) — with benchmarks themselves always being fixed/curated (SPY, 60/40, 90/10), never arbitrary user portfolios. Arbitrary multi-portfolio comparison stays the Compare tab's job; Overview only ever compares one active portfolio against one or more *benchmarks*. When that lands, expect:
   - `getPortfolioPerformance`'s signature to grow a `benchmarkIds: string[]` parameter (defaulting to `['SPY']`), returning `benchmarks: PortfolioPerformance[]` instead of a single `benchmark`.
   - `PerformanceChart` to accept an array of benchmark series/colors instead of the single optional `benchmarkSeries` it has today.
   - A benchmark picker (multi-select) similar in spirit to the portfolio switcher sheet.
   Not scoping or designing this now — flagging it so the single-benchmark plumbing below doesn't accidentally close the door on it (e.g. don't hardcode assumptions that only one benchmark can ever exist deeper than necessary).

## Architecture

`getPortfolioPerformance` reuses `compare.ts`'s existing `buildPerformance` helper unchanged, called twice: once for the active portfolio (against SPY's raw price series, exactly like `compareEntities` already does for every portfolio), and once for a synthetic single-holding "SPY" portfolio (exactly the same trick `watchlist.ts` doesn't need but `compareEntities` effectively already performs when a benchmark row's own performance is requested — here we just aren't fetching all portfolios, only the one plus SPY). This means no new compute logic — only a new, narrower composition function in `src/lib/api/compare.ts`.

`PerformanceChart` needs two new optional boolean props (`showSeries`, `showBenchmark`, both defaulting to `true`) so Overview's toggle chips can independently hide either line — `watchlist-row.tsx`'s existing usage is unaffected since it never passes them.

## Global Constraints

- UI code never touches SQLite or the market-data API directly — only `src/lib/api/*` (per spec §7 / `CLAUDE.md`).
- Match `docs/mock-reference.html`'s "Nocturne Detail" section exactly for new visual elements (return headline, subtitle, toggle chips, stats table) — exact values are pulled out per-task below. All of them map cleanly onto existing `ColorTokens` (see mapping table in Task 4) — no new theme tokens needed.
- Components build their `StyleSheet` from `createStyles(colors)` memoized with `useMemo`, per the theming convention — never a module-level `StyleSheet.create` referencing colors directly.
- After any UI-affecting task, verify by running the app in the simulator and screenshotting (`xcrun simctl io booted screenshot`) — `npx tsc --noEmit` alone doesn't prove a screen renders correctly (see `CLAUDE.md` "Verifying UI changes").
- Alpha, Beta, Correlation are portfolio-only per spec §4 — the Bench. column shows "—" for those three rows, not a computed self-correlation number, even though the synthetic SPY-vs-SPY call will produce trivial values (correlation 1, beta 1, alpha 0) — the UI must not render them, not just happen to render plausible-looking noise.

---

## Task 1: Add `getPortfolioPerformance` to the API layer

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/api/compare.ts`

**Interfaces:**
- Consumes: existing `buildPerformance`, `ensureFreshHistory`, `toApiPortfolio`, `BENCHMARK_TICKER` (already `'SPY'`) in `compare.ts`; `getAllPrices` from `src/lib/storage/prices.ts`; `Portfolio`, `PortfolioPerformance` from `types.ts`.
- Produces: `PortfolioDetailPerformance` type; `getPortfolioPerformance(portfolioId: string, period: PeriodKey): Promise<PortfolioDetailPerformance>`, consumed by Task 5 (Overview screen).

- [ ] **Step 1: Add the return type**

In `src/lib/api/types.ts`, add:

```typescript
export interface PortfolioDetailPerformance {
  portfolio: PortfolioPerformance;
  benchmark: PortfolioPerformance; // fixed to SPY for now — see docs/superpowers/plans/2026-07-22-overview-detail-screen.md
}
```

- [ ] **Step 2: Add a synthetic single-ticker "SPY" portfolio helper and the new export**

In `src/lib/api/compare.ts`, add near the top (below `BENCHMARK_TICKER`):

```typescript
const BENCHMARK_NAME = 'S&P 500';

function syntheticBenchmarkPortfolio(): Portfolio {
  return {
    id: BENCHMARK_TICKER,
    name: BENCHMARK_NAME,
    type: 'benchmark',
    holdings: [{ ticker: BENCHMARK_TICKER, weight: 100, name: BENCHMARK_NAME }],
  };
}
```

Add the new export (after `compareEntities`):

```typescript
// Single-portfolio-vs-benchmark performance for the Overview/Detail screen.
// Benchmark is fixed to SPY for now (see 2026-07-22 plan doc) — not user-selectable.
export async function getPortfolioPerformance(
  portfolioId: string,
  period: PeriodKey
): Promise<PortfolioDetailPerformance> {
  const rows = await portfolioStorage.getAllPortfolios();
  const row = rows.find((r) => r.id === portfolioId);
  if (!row) throw new Error(`Portfolio not found: ${portfolioId}`);
  const portfolio = toApiPortfolio(row);

  const tickers = new Set<string>([BENCHMARK_TICKER]);
  for (const h of portfolio.holdings) tickers.add(h.ticker);
  await Promise.all([...tickers].map(ensureFreshHistory));

  const pricesByTicker: Record<string, PricePoint[]> = {};
  await Promise.all(
    [...tickers].map(async (ticker) => {
      pricesByTicker[ticker] = await getAllPrices(ticker);
    })
  );

  const benchmarkPrices = pricesByTicker[BENCHMARK_TICKER] ?? [];
  const portfolioPerf = buildPerformance(portfolio, pricesByTicker, benchmarkPrices, period);
  const benchmarkPerf = buildPerformance(syntheticBenchmarkPortfolio(), pricesByTicker, benchmarkPrices, period);

  return { portfolio: portfolioPerf, benchmark: benchmarkPerf };
}
```

Update the `PortfolioDetailPerformance` import at the top of `compare.ts`'s type-only import line.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/compare.ts
git commit -m "feat: add getPortfolioPerformance for single-portfolio-vs-SPY detail view"
```

---

## Task 2: Let `PerformanceChart` hide either line independently

**Files:**
- Modify: `src/components/performance-chart.tsx`

**Interfaces:**
- Produces: two new optional props, `showSeries?: boolean` (default `true`) and `showBenchmark?: boolean` (default `true`), consumed by Task 5 (Overview's toggle chips). `watchlist-row.tsx`'s existing call site is unaffected (it never passes them, so both default `true` — identical current behavior).

- [ ] **Step 1: Add the props and gate rendering**

In `PerformanceChartProps`, add:

```typescript
type PerformanceChartProps = {
  series: PerformanceSeries;
  benchmarkSeries?: PerformanceSeries;
  lineColor: string;
  width?: number;
  height?: number;
  showSeries?: boolean;
  showBenchmark?: boolean;
};
```

Destructure with defaults (`showSeries = true, showBenchmark = true`). Gate the existing JSX:
- The `<Path d={areaPath(...)} .../>` (glow fill), the portfolio `<Path d={linePath(values,...)} .../>`, the crosshair `<Line .../>`, the pulsing `<Circle .../>`, and the floating value `<View style={styles.pill}>` pill — all wrapped in `showSeries &&`.
- The dashed benchmark `<Path .../>` — change its existing `benchmarkValues.length > 0 ?` guard to `showBenchmark && benchmarkValues.length > 0 ?`.
- Grid high/low `<SvgText>` labels stay unconditional (they reflect the visible data range regardless of which line is toggled — keep using `seriesRange(values)` from the portfolio series as today, matching current behavior since only one series drives the min/max axis).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test -- src/lib/compute/chartGeometry.test.ts` (sanity — this task doesn't touch compute, just confirms nothing regressed)
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/performance-chart.tsx
git commit -m "feat: let PerformanceChart hide the portfolio or benchmark line independently"
```

---

## Task 3: Wire the Overview screen to real performance data

**Files:**
- Modify: `src/screens/overview/index.tsx`

**Interfaces:**
- Consumes: `getPortfolioPerformance` (Task 1), `PerformanceChart` with new toggle props (Task 2), `PeriodPills`, `getActiveProvider` from `src/lib/api/settings.ts`, `DEFAULT_PERIOD`/`PeriodKey` from `types.ts`.
- Produces: a fully-functional Detail screen — return headline, subtitle, period pills, chart, toggle chips, stats table, truncation note, provider empty state — replacing the current holdings-list-only screen. The portfolio switcher and holdings list logic already in this file are unchanged.

Exact mock values (`docs/mock-reference.html`, `data-screen-label="Nocturne Detail"`), mapped onto existing `ColorTokens`:

| Element | Mock style | Token/value to use |
|---|---|---|
| Return headline | `font:500 42px`, color `#e9e9ed` | `fontWeight: '500'`, `fontSize: 42`, `colors.textPrimary` |
| "vs Benchmark…" subtitle | `font-size:12px`, color `#9397ab`, `margin-top:8px` | `fontSize: 12`, `colors.textSecondary`, `marginTop: 8` (benchmark return figure itself in accent-soft `#d2cefd` → `colors.accentSoft`) |
| Toggle chip (portfolio) | `padding:4px 10px;border-radius:20px;border:1px solid #9184d9` | `colors.accent` border |
| Toggle chip (benchmark) | same padding/radius, `border:1px solid #595d6c` | `colors.textMuted` border |
| Toggle chip dot (portfolio) | 8×8 circle, `#9184d9` | `colors.accent` |
| Toggle chip dash (benchmark) | 8×1.5 rect, `#9397ab` | `colors.textSecondary` |
| Chip label | `font-size:11px;font-weight:500;color:#e9e9ed` | `colors.textPrimary` |
| Hidden-chip opacity | mock's `{{ det.pOpacity }}`/`{{ det.bOpacity }}` binding | `0.4` when hidden, `1` when visible — same convention as Compare's `rowHidden: { opacity: 0.4 }` |
| "Statistics" section label | `font:500 13px;letter-spacing:.02em;color:#9397ab` | matches existing `holdingsSectionLabel`/Compare's `sectionLabel` style already in this codebase — reuse that pattern |
| Stats table header row | `font-size:10px;letter-spacing:.06em;uppercase;color:#75798c;border-bottom:1px solid #2c2f40` | `colors.textSecondary`, `colors.borderStrong` |
| Stats table row | `padding:8px 0;border-bottom:1px solid #21232f` | reuse the literal `'#21232f'` already hardcoded in `watchlist-row.tsx`'s `statRow` style, for consistency with that existing table |
| Stats table label / portfolio value / bench value | colors `#9397ab` / `#e9e9ed` (weight 600) / `#75798c` | `colors.textSecondary` / `colors.textPrimary` (`fontWeight: '600'`) / `colors.textSecondary` |

- [ ] **Step 1: Add period + visibility state, and the two new queries**

Add local state: `const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);`, `const [showPortfolio, setShowPortfolio] = useState(true);`, `const [showBenchmark, setShowBenchmark] = useState(true);`.

Add queries (alongside the existing `portfolios` query):

```typescript
const { data: detail, isPending: isDetailPending } = useQuery({
  queryKey: ['portfolioPerformance', activeId, period],
  queryFn: () => getPortfolioPerformance(activeId!, period),
  enabled: activeId !== null,
});
const { data: activeProvider, isPending: isProviderPending } = useQuery({
  queryKey: ['activeProvider'],
  queryFn: getActiveProvider,
});
```

- [ ] **Step 2: Add the no-provider empty state**

Mirror Compare's/Watchlist's pattern exactly (same message shape, `router.push('/account')` CTA), inserted after the existing zero-portfolios empty-state check:

```tsx
if (!isProviderPending && !activeProvider) {
  return (
    <EmptyState
      title="No market data provider"
      message="Add an API key in Settings to see performance, returns, and chart data."
      ctaLabel="Go to Settings"
      onPressCta={() => router.push('/account')}
    />
  );
}
```

- [ ] **Step 3: Add the return headline + subtitle below the existing header row**

```tsx
{detail && (
  <View style={styles.headline}>
    <Text style={styles.returnValue}>
      {detail.portfolio.stats.return >= 0 ? '+' : ''}
      {detail.portfolio.stats.return.toFixed(1)}%
    </Text>
    <Text style={styles.returnSubtitle}>
      vs {detail.benchmark.portfolio.name}{' '}
      <Text style={styles.returnSubtitleValue}>
        {detail.benchmark.stats.return >= 0 ? '+' : ''}
        {detail.benchmark.stats.return.toFixed(1)}%
      </Text>{' '}
      · {period}
    </Text>
  </View>
)}
```

(Note: `detail.benchmark` is a `PortfolioPerformance`, so the name comes from `detail.benchmark.portfolio.name` — `"S&P 500"` per Task 1's `syntheticBenchmarkPortfolio`.)

- [ ] **Step 4: Add period pills, chart, and toggle chips**

```tsx
<PeriodPills active={period} onSelect={setPeriod} />
{detail && (
  <View style={styles.chartSection}>
    <PerformanceChart
      series={detail.portfolio.series}
      benchmarkSeries={detail.benchmark.series}
      lineColor={detail.portfolio.stats.return >= 0 ? colors.positive : colors.negative}
      showSeries={showPortfolio}
      showBenchmark={showBenchmark}
    />
    <View style={styles.toggleRow}>
      <Pressable
        style={[styles.toggleChip, { borderColor: colors.accent, opacity: showPortfolio ? 1 : 0.4 }]}
        onPress={() => setShowPortfolio((v) => !v)}
      >
        <View style={[styles.toggleDot, { backgroundColor: colors.accent }]} />
        <Text style={styles.toggleLabel}>{active?.name}</Text>
      </Pressable>
      <Pressable
        style={[styles.toggleChip, { borderColor: colors.textMuted, opacity: showBenchmark ? 1 : 0.4 }]}
        onPress={() => setShowBenchmark((v) => !v)}
      >
        <View style={[styles.toggleDash, { backgroundColor: colors.textSecondary }]} />
        <Text style={styles.toggleLabel}>{detail.benchmark.portfolio.name}</Text>
      </Pressable>
    </View>
    {detail.portfolio.series.truncatedFrom && (
      <Text style={styles.truncationNote}>Data from {detail.portfolio.series.truncatedFrom}</Text>
    )}
  </View>
)}
```

- [ ] **Step 5: Add the two-column stats table**

New local subcomponent in the same file (matching the existing `HoldingItem`/`PortfolioSwitcher` in-file pattern):

```tsx
const STATS_ROWS: { key: keyof PerformanceStats; label: string; suffix: string; portfolioOnly?: boolean }[] = [
  { key: 'sharpe', label: 'Sharpe Ratio', suffix: '' },
  { key: 'volatility', label: 'Volatility', suffix: '%' },
  { key: 'maxDrawdown', label: 'Max Drawdown', suffix: '%' },
  { key: 'alpha', label: 'Alpha', suffix: '%', portfolioOnly: true },
  { key: 'beta', label: 'Beta', suffix: '', portfolioOnly: true },
  { key: 'correlation', label: 'Correlation', suffix: '', portfolioOnly: true },
];

function StatsTable({ portfolio, benchmark }: { portfolio: PerformanceStats; benchmark: PerformanceStats }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.statsTable}>
      <View style={styles.statsHeaderRow}>
        <Text style={[styles.statsHeaderCell, styles.statsMetricCol]}>Metric</Text>
        <Text style={[styles.statsHeaderCell, styles.statsValueCol]}>Portfolio</Text>
        <Text style={[styles.statsHeaderCell, styles.statsValueCol]}>Bench.</Text>
      </View>
      {STATS_ROWS.map((row) => (
        <View key={row.key} style={styles.statsRow}>
          <Text style={[styles.statsLabel, styles.statsMetricCol]}>{row.label}</Text>
          <Text style={[styles.statsPortfolioValue, styles.statsValueCol]}>
            {portfolio[row.key].toFixed(2)}
            {row.suffix}
          </Text>
          <Text style={[styles.statsBenchValue, styles.statsValueCol]}>
            {row.portfolioOnly ? '—' : `${benchmark[row.key].toFixed(2)}${row.suffix}`}
          </Text>
        </View>
      ))}
    </View>
  );
}
```

Render it after the chart section, before the existing "Holdings" section:

```tsx
{detail && (
  <>
    <Text style={styles.holdingsSectionLabel}>Statistics</Text>
    <StatsTable portfolio={detail.portfolio.stats} benchmark={detail.benchmark.stats} />
  </>
)}
```

(Reuse the existing `holdingsSectionLabel` style for the "Statistics" label too — same visual treatment per the mock table above; rename it to something like `sectionLabel` if it reads oddly reused verbatim, but functionally identical styling either way.)

- [ ] **Step 6: Add the new styles**

Add to the `createStyles` function: `headline`, `returnValue` (`fontSize: 42, fontWeight: '500', color: colors.textPrimary`), `returnSubtitle` (`fontSize: 12, color: colors.textSecondary, marginTop: 8`), `returnSubtitleValue` (`color: colors.accentSoft`), `chartSection` (`paddingHorizontal: 18, marginTop: 16`), `toggleRow` (`flexDirection: 'row', gap: 8, marginTop: 8`), `toggleChip` (`flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1`), `toggleDot` (`width: 8, height: 8, borderRadius: 4`), `toggleDash` (`width: 8, height: 1.5`), `toggleLabel` (`fontSize: 11, fontWeight: '500', color: colors.textPrimary`), `truncationNote` (`fontSize: 11, color: colors.textSecondary, marginTop: 8`), `statsTable`, `statsHeaderRow`/`statsRow` (`flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1` with `colors.borderStrong` for header, `'#21232f'` for data rows per the mapping table above), `statsHeaderCell` (`fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textSecondary`), `statsMetricCol` (`flex: 1`), `statsValueCol` (`width: 70, textAlign: 'right'`), `statsLabel` (`fontSize: 13, color: colors.textSecondary`), `statsPortfolioValue` (`fontSize: 13, fontWeight: '600', color: colors.textPrimary`), `statsBenchValue` (`fontSize: 13, color: colors.textSecondary`).

- [ ] **Step 7: Handle the loading state for the detail query**

While `isDetailPending` (and `activeId` is set), show an `ActivityIndicator` in place of the chart/stats block only — the holdings list and header should still render immediately from the already-loaded `portfolios` query, so switching periods doesn't blank the whole screen, only the chart/stats section.

- [ ] **Step 8: Invalidate the new query key on portfolio edits**

In `src/screens/add-portfolio/index.tsx`'s `saveMutation.onSuccess`, add:

```typescript
queryClient.invalidateQueries({ queryKey: ['portfolioPerformance'] });
```

alongside the existing `['portfolios']` and `['compare']` invalidations.

- [ ] **Step 9: Verify — type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Verify — manual simulator check**

Per `CLAUDE.md` "Verifying UI changes": start Metro (check for an already-running server first), open the app, and screenshot the Overview tab in these states:
- A portfolio with full period history selected at each of 1D/7D/30D/3M (chart, headline, subtitle, and stats table all update)
- Toggling the portfolio chip off (glow/line/dot/pill disappear, dashed benchmark line stays)
- Toggling the benchmark chip off (dashed line disappears, portfolio line stays)
- Switching to a different portfolio via the switcher (chart/stats update for the new active portfolio)
- No provider configured (empty state with "Go to Settings" CTA)
- Zero portfolios (existing empty state — confirm it still renders correctly, unaffected by this change)

- [ ] **Step 11: Commit**

```bash
git add src/screens/overview/index.tsx src/screens/add-portfolio/index.tsx
git commit -m "feat: wire Overview to real performance data — chart, stats, and benchmark toggle"
```

---

## Out of scope for this plan

- Any benchmark picker UI, or plotting more than one benchmark at once — deferred per the "Documented future direction" note above.
- Changing `compareEntities`/the Compare tab — unaffected by this work.
- Any change to `WatchlistTickerPerformance`/`watchlist.ts` — unaffected; `PerformanceChart`'s new props default to current behavior there.
