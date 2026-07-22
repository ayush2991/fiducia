# Detail & Compare Scrub-Crosshair Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps between the running app's Overview (Detail) and Compare screens and the `"Nocturne Detail (Scrub / Crosshair)"` / `"Nocturne Compare (Scrub / Crosshair)"` mock states in `docs/mock-reference.html`, so drag-to-scrub interaction on both charts matches the mock's visuals and live-updating text.

**Architecture:** Both `PerformanceChart` and `CompareChart` currently track scrub state internally and never expose it, so the screens that own the headline text and entity list can't react to a drag. Each chart component gains an `onScrubChange` callback that reports the drag position as a normalized fraction (0–1) rather than a raw index — this matters because, per entity, series length can differ (`series.truncatedFrom` — see CLAUDE.md's market-data section), so index resolution must happen per-series in the owning screen, not once in the chart. A new pure helper, `percentChangeAt`, centralizes the "% change from series start" formula that's currently duplicated (and about to be duplicated further) across both chart components and both screens.

**Tech Stack:** React Native, `react-native-svg`, existing `src/lib/compute/chartGeometry.ts` geometry helpers, Jest for the one new pure-function test.

## Global Constraints

- Match `docs/mock-reference.html` exactly for values shown — labels, formatting, and which elements appear together — grep `data-screen-label="Nocturne Detail Scrub"` and `data-screen-label="Nocturne Compare Scrub"` to re-check markup while implementing.
- `src/lib/compute/` stays pure/I-O-free; `src/components/` stays presentational (no data-fetching, no entity-name/toggle logic inside chart components — that's screen-level, per the existing `EntityRow` split).
- No new gesture library — keep the existing `onResponderGrant`/`onResponderMove`/`onLayout` pattern already used by both charts.
- `npx tsc --noEmit` must stay clean after every task.
- UI tasks are only "done" once verified on the iOS Simulator via screenshot (per CLAUDE.md's "Verifying UI changes" — this project has no RN component test harness, only pure-function Jest tests under `src/lib/compute/`).

---

## Gaps found (investigation summary)

**Detail (`src/components/performance-chart.tsx` + `src/screens/overview/index.tsx`) vs. `"Nocturne Detail Scrub"`:**
1. No x-axis start/end date labels under the chart (mock: `detS.xStart`/`detS.xEnd` — also present in the *non*-scrub `"Nocturne Detail"` mock, so this is a standing gap, not scrub-specific).
2. Only the portfolio line gets a crosshair dot; the benchmark line has no marker at all when scrubbing (mock: a second hollow circle at `detS.scrubYB`).
3. No "Bench {{ value }}" pill next to the main value pill (mock shows both pills stacked under the crosshair).
4. The big headline number and "vs Benchmark 90/10 …" subtitle in `overview/index.tsx` are bound to the static full-period `stats.return` — they never change while dragging. The mock's headline (`detS.valStr`/`detS.bValStr`/`detS.timeLabel`) updates live to the scrub position.

**Compare (`src/components/compare-chart.tsx` + `src/screens/compare/index.tsx`) vs. `"Nocturne Compare Scrub"`:**
5. No x-axis start/end date labels under the chart (mock: `cmpS.xStart`/`cmpS.xEnd`, also in the non-scrub `"Nocturne Compare"` mock).
6. Header never shows a time label — mock shows `"4 selected · {{ cmpS.timeLabel }}"` while scrubbing; the app always shows a bare `"N selected"`.
7. The current in-chart floating tooltip (unlabeled colored dots + %, `compare-chart.tsx:121-138`) has no equivalent in the mock. The mock instead has a **"Value at crosshair"** panel below the chart: the same dot+name row list used normally, but swapped to show each entity's live scrub value in place of its holdings/stat line while dragging.
8. Entity rows (`EntityRow` in `compare/index.tsx`) always show the static full-period `stats.return` — never a scrub-position value.

---

## Task 1: `percentChangeAt` helper

**Files:**
- Modify: `src/lib/compute/chartGeometry.ts`
- Test: `src/lib/compute/chartGeometry.test.ts`

**Interfaces:**
- Produces: `percentChangeAt(values: number[], index: number): number` — used by Tasks 2, 3, 4, 5.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/compute/chartGeometry.test.ts`:

```ts
import {
  areaPath,
  lastPointPosition,
  linePath,
  nearestIndexForX,
  percentChangeAt,
  pointPosition,
  seriesRange,
} from './chartGeometry';
```

(update the existing import statement at the top of the file to add `percentChangeAt` in the alphabetized list)

```ts
describe('percentChangeAt', () => {
  it('returns 0% at the start of the series', () => {
    expect(percentChangeAt([100, 110, 90], 0)).toBe(0);
  });

  it('computes % change from the first value to the given index', () => {
    expect(percentChangeAt([100, 110, 90], 1)).toBe(10);
    expect(percentChangeAt([100, 110, 90], 2)).toBe(-10);
  });

  it('returns 0 for an empty series', () => {
    expect(percentChangeAt([], 0)).toBe(0);
  });

  it('returns 0 when the first value is 0, instead of NaN/Infinity', () => {
    expect(percentChangeAt([0, 10], 1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/compute/chartGeometry.test.ts`
Expected: FAIL — `percentChangeAt` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/compute/chartGeometry.ts` (after `seriesRange`):

```ts
// % change from a series' first value to the value at `index` — the
// "return so far" figure shown on both charts' scrub pills/tooltips and
// both screens' live headline/row values.
export function percentChangeAt(values: number[], index: number): number {
  if (values.length === 0) return 0;
  const base = values[0];
  if (base === 0) return 0;
  return ((values[index] - base) / base) * 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/compute/chartGeometry.test.ts`
Expected: PASS (all `percentChangeAt` cases plus the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/compute/chartGeometry.ts src/lib/compute/chartGeometry.test.ts
git commit -m "feat: add percentChangeAt geometry helper"
```

---

## Task 2: `PerformanceChart` — x-axis labels, benchmark scrub dot/pill, lift scrub fraction

**Files:**
- Modify: `src/components/performance-chart.tsx`

**Interfaces:**
- Consumes: `percentChangeAt` from Task 1, `nearestIndexForX`/`pointPosition`/`seriesRange` (existing).
- Produces: new `PerformanceChart` prop `onScrubChange?: (fraction: number | null) => void` — consumed by Task 3.

- [ ] **Step 1: Replace `scrubIndex` state with `scrubFraction`, and derive per-series indices from it**

In `src/components/performance-chart.tsx`, replace:

```ts
  const [chartAreaWidth, setChartAreaWidth] = useState(width);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const values = series.points.map((p) => p.value);
  const benchmarkValues = benchmarkSeries?.points.map((p) => p.value) ?? [];
  const { min, max } = seriesRange(values);
  const displayIndex = scrubIndex ?? values.length - 1;
  const current = pointPosition(values, displayIndex, width, height);
  const pillLeft = Math.max(24, Math.min(width - 24, current.x));
  const gradientId = 'watchlist-chart-gradient';

  function handleTouch(evt: GestureResponderEvent) {
    if (values.length === 0 || chartAreaWidth <= 0) return;
    const index = nearestIndexForX(evt.nativeEvent.locationX, values.length, chartAreaWidth);
    setScrubIndex(index);
  }

  function handleLayout(evt: LayoutChangeEvent) {
    setChartAreaWidth(evt.nativeEvent.layout.width);
  }
```

with:

```ts
  const [chartAreaWidth, setChartAreaWidth] = useState(width);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const values = series.points.map((p) => p.value);
  const benchmarkValues = benchmarkSeries?.points.map((p) => p.value) ?? [];
  const { min, max } = seriesRange(values);
  // Each series can have a different length (truncated history — see
  // CLAUDE.md's market-data section), so the drag position is resolved to
  // an index independently per series rather than sharing one `scrubIndex`.
  const displayIndex =
    scrubFraction !== null ? nearestIndexForX(scrubFraction, values.length, 1) : values.length - 1;
  const benchmarkDisplayIndex =
    benchmarkValues.length > 0
      ? scrubFraction !== null
        ? nearestIndexForX(scrubFraction, benchmarkValues.length, 1)
        : benchmarkValues.length - 1
      : null;
  const current = pointPosition(values, displayIndex, width, height);
  const pillLeft = Math.max(24, Math.min(width - 24, current.x));
  const gradientId = 'watchlist-chart-gradient';

  function updateScrub(fraction: number | null) {
    setScrubFraction(fraction);
    onScrubChange?.(fraction);
  }

  function handleTouch(evt: GestureResponderEvent) {
    if (values.length === 0 || chartAreaWidth <= 0) return;
    updateScrub(Math.max(0, Math.min(1, evt.nativeEvent.locationX / chartAreaWidth)));
  }

  function handleLayout(evt: LayoutChangeEvent) {
    setChartAreaWidth(evt.nativeEvent.layout.width);
  }
```

- [ ] **Step 2: Add the `onScrubChange` prop and wire release/terminate to clear it**

Update the props type:

```ts
type PerformanceChartProps = {
  series: PerformanceSeries;
  benchmarkSeries?: PerformanceSeries;
  lineColor: string;
  width?: number;
  height?: number;
  showSeries?: boolean;
  showBenchmark?: boolean;
  onScrubChange?: (fraction: number | null) => void;
};
```

Add `onScrubChange` to the destructured props list in the function signature, and replace the two `setScrubIndex(null)` calls (`onResponderRelease`, `onResponderTerminate`) with `() => updateScrub(null)`.

- [ ] **Step 3: Add the benchmark scrub dot**

Directly after the existing portfolio `<Circle cx={current.x} cy={current.y} r={4} fill={lineColor} />` (inside the `{showSeries ? (...) : null}` block), add a sibling block for the benchmark dot — it must render whenever the benchmark line itself renders, not just while `showSeries` is true:

```tsx
          {showBenchmark && benchmarkValues.length > 0 && benchmarkDisplayIndex !== null ? (
            <Circle
              cx={pointPosition(benchmarkValues, benchmarkDisplayIndex, width, height).x}
              cy={pointPosition(benchmarkValues, benchmarkDisplayIndex, width, height).y}
              r={3.5}
              fill={colors.background}
              stroke={colors.textSecondary}
              strokeWidth={1.5}
            />
          ) : null}
```

Place this block right after the `{showBenchmark && benchmarkValues.length > 0 ? (<Path .../>) : null}` benchmark line block (so it's drawn on top of the line, matching the mock's z-order), not nested inside the portfolio's `{showSeries ? (...) : null}` block.

- [ ] **Step 4: Add the "Bench X%" pill**

The mock stacks a second, smaller pill directly under the main value pill. Replace the existing:

```tsx
      {showSeries ? (
        <View style={[styles.pill, { left: pillLeft - 20, backgroundColor: lineColor }]}>
          <Text style={styles.pillLabel}>
            {series.points.length > 0
              ? `${values[displayIndex] >= values[0] ? '+' : ''}${(
                  ((values[displayIndex] - values[0]) / values[0]) *
                  100
                ).toFixed(2)}%`
              : ''}
          </Text>
        </View>
      ) : null}
```

with:

```tsx
      {showSeries ? (
        <View style={[styles.pillGroup, { left: pillLeft - 20 }]}>
          <View style={[styles.pill, { backgroundColor: lineColor }]}>
            <Text style={styles.pillLabel}>
              {series.points.length > 0
                ? `${percentChangeAt(values, displayIndex) >= 0 ? '+' : ''}${percentChangeAt(values, displayIndex).toFixed(2)}%`
                : ''}
            </Text>
          </View>
          {showBenchmark && benchmarkValues.length > 0 && benchmarkDisplayIndex !== null ? (
            <View style={styles.benchPill}>
              <Text style={styles.benchPillLabel}>
                Bench {percentChangeAt(benchmarkValues, benchmarkDisplayIndex) >= 0 ? '+' : ''}
                {percentChangeAt(benchmarkValues, benchmarkDisplayIndex).toFixed(2)}%
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
```

Add the import: `import { areaPath, linePath, nearestIndexForX, percentChangeAt, pointPosition, seriesRange } from '@/lib/compute/chartGeometry';`

Add these three styles to `createStyles`, and change `pill`'s `position: 'absolute'` to live on the new wrapper instead:

```ts
    pillGroup: {
      position: 'absolute',
      top: 12,
      alignItems: 'center',
      gap: 3,
    },
    pill: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    pillLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.background,
    },
    benchPill: {
      backgroundColor: colors.surfaceMuted,
      paddingVertical: 2,
      paddingHorizontal: 7,
      borderRadius: 5,
    },
    benchPillLabel: {
      fontSize: 10,
      fontWeight: '500',
      color: colors.textSecondary,
    },
```

(remove the old `top: 12` from `pill` since it's now on `pillGroup`)

- [ ] **Step 5: Add x-axis start/end date labels**

Add below the closing `</Svg>` tag, before the existing `{showSeries ? (<View style={[styles.pill, ...` block:

```tsx
        {series.points.length > 0 ? (
          <View style={styles.xAxisRow}>
            <Text style={styles.xAxisLabel}>{series.points[0].date}</Text>
            <Text style={styles.xAxisLabel}>{series.points[series.points.length - 1].date}</Text>
          </View>
        ) : null}
```

This goes inside the outer touch-responder `<View>`, as a sibling after `</Svg>`. Add styles:

```ts
    xAxisRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
      paddingTop: 4,
    },
    xAxisLabel: {
      fontSize: 10,
      color: colors.textMuted,
    },
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/performance-chart.tsx
git commit -m "feat: add benchmark scrub dot, bench pill, x-axis labels, and lift scrub fraction in PerformanceChart"
```

---

## Task 3: Overview screen — live headline while scrubbing

**Files:**
- Modify: `src/screens/overview/index.tsx`

**Interfaces:**
- Consumes: `PerformanceChart`'s `onScrubChange` (Task 2), `percentChangeAt` and `nearestIndexForX` (Task 1 / existing).

- [ ] **Step 1: Add scrub state and derive live headline values**

In the `Overview` function, after the existing `showBenchmark` state, add:

```ts
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
```

After `detail` is available (near where `unavailableTickers`/`isStale` are derived), add:

```ts
  const portfolioValues = detail?.portfolio.series.points.map((p) => p.value) ?? [];
  const benchmarkValues = detail?.benchmark.series.points.map((p) => p.value) ?? [];
  const portfolioScrubIndex =
    scrubFraction !== null && portfolioValues.length > 0
      ? nearestIndexForX(scrubFraction, portfolioValues.length, 1)
      : null;
  const benchmarkScrubIndex =
    scrubFraction !== null && benchmarkValues.length > 0
      ? nearestIndexForX(scrubFraction, benchmarkValues.length, 1)
      : null;
  const headlineReturn =
    portfolioScrubIndex !== null ? percentChangeAt(portfolioValues, portfolioScrubIndex) : detail?.portfolio.stats.return ?? 0;
  const headlineBenchReturn =
    benchmarkScrubIndex !== null
      ? percentChangeAt(benchmarkValues, benchmarkScrubIndex)
      : detail?.benchmark.stats.return ?? 0;
  const headlineDateLabel =
    portfolioScrubIndex !== null ? detail?.portfolio.series.points[portfolioScrubIndex]?.date : null;
```

Add the import: `import { nearestIndexForX, percentChangeAt } from '@/lib/compute/chartGeometry';`

- [ ] **Step 2: Bind the headline to the live values**

Replace:

```tsx
        {detail ? (
          <View style={styles.headline}>
            <Text style={styles.returnValue}>
              {detail.portfolio.stats.return >= 0 ? '+' : ''}
              {detail.portfolio.stats.return.toFixed(2)}%
            </Text>
            <Text style={styles.returnSubtitle}>
              vs {detail.benchmark.portfolio.name}{' '}
              <Text style={styles.returnSubtitleValue}>
                {detail.benchmark.stats.return >= 0 ? '+' : ''}
                {detail.benchmark.stats.return.toFixed(2)}%
              </Text>{' '}
              · {period}
            </Text>
          </View>
        ) : null}
```

with:

```tsx
        {detail ? (
          <View style={styles.headline}>
            <Text style={styles.returnValue}>
              {headlineReturn >= 0 ? '+' : ''}
              {headlineReturn.toFixed(2)}%
            </Text>
            <Text style={styles.returnSubtitle}>
              vs {detail.benchmark.portfolio.name}{' '}
              <Text style={styles.returnSubtitleValue}>
                {headlineBenchReturn >= 0 ? '+' : ''}
                {headlineBenchReturn.toFixed(2)}%
              </Text>{' '}
              · {headlineDateLabel ?? period}
            </Text>
          </View>
        ) : null}
```

- [ ] **Step 3: Pass `onScrubChange` to `PerformanceChart`**

In the `<PerformanceChart ... />` call, add:

```tsx
              onScrubChange={setScrubFraction}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Simulator verification**

Start Metro without `CI=1` (so edits reload), open the Overview tab (deep link: `xcrun simctl openurl booted "exp://<lan-ip>:8081/--/(tabs)"` or the default landing tab if Overview is first), then drag across the chart. Screenshot with `xcrun simctl io booted screenshot <path>` mid-drag and confirm:
- The big headline number changes as you drag.
- The "vs Benchmark…" value changes as you drag.
- The date after "·" changes to the scrubbed date while dragging, and reverts to the period pill's label when released.
- The benchmark's hollow scrub dot appears on the dashed line under your finger.
- The "Bench X%" pill appears under the main pill.
- x-axis start/end dates appear under the chart.

- [ ] **Step 6: Commit**

```bash
git add src/screens/overview/index.tsx
git commit -m "feat: drive Overview headline from PerformanceChart scrub position"
```

---

## Task 4: `CompareChart` — x-axis labels, lift scrub fraction, drop the floating tooltip

**Files:**
- Modify: `src/components/compare-chart.tsx`

**Interfaces:**
- Consumes: nothing new beyond existing `nearestIndexForX`/`seriesRange`.
- Produces: new `CompareChart` props `dates: string[]` and `onScrubChange?: (fraction: number | null) => void` — consumed by Task 5. `CompareChartLine` type is unchanged.

- [ ] **Step 1: Add the `dates` and `onScrubChange` props**

Update the props type:

```ts
type CompareChartProps = {
  lines: CompareChartLine[];
  dates: string[];
  width?: number;
  height?: number;
  onScrubChange?: (fraction: number | null) => void;
};
```

Update the function signature: `export function CompareChart({ lines, dates, width = 330, height = 160, onScrubChange }: CompareChartProps) {`

- [ ] **Step 2: Report scrub fraction to the parent**

Replace:

```ts
  function handleTouch(evt: GestureResponderEvent) {
    if (chartAreaWidth <= 0) return;
    setScrubX(Math.max(0, Math.min(chartAreaWidth, evt.nativeEvent.locationX)));
  }

  function handleLayout(evt: LayoutChangeEvent) {
    setChartAreaWidth(evt.nativeEvent.layout.width);
  }
```

with:

```ts
  function handleTouch(evt: GestureResponderEvent) {
    if (chartAreaWidth <= 0) return;
    const x = Math.max(0, Math.min(chartAreaWidth, evt.nativeEvent.locationX));
    setScrubX(x);
    onScrubChange?.(x / chartAreaWidth);
  }

  function handleLayout(evt: LayoutChangeEvent) {
    setChartAreaWidth(evt.nativeEvent.layout.width);
  }

  function endTouch() {
    setScrubX(null);
    onScrubChange?.(null);
  }
```

Replace both `onResponderRelease={() => setScrubX(null)}` and `onResponderTerminate={() => setScrubX(null)}` with `onResponderRelease={endTouch}` and `onResponderTerminate={endTouch}`.

- [ ] **Step 3: Remove the floating tooltip box, add x-axis labels**

Replace the whole block from `{activeScrubX !== null && crosshairX !== null ? (` through its closing `) : null}` (the tooltip `<View>`) — delete it entirely, it has no equivalent in the mock (Task 5 replaces its function with the below-chart "Value at crosshair" row list).

In its place, immediately after the closing `</View>` of the outer touch-responder `<View>` (i.e. as a sibling, same position the tooltip used to occupy relative to the wrapper), add:

```tsx
      {dates.length > 0 ? (
        <View style={styles.xAxisRow}>
          <Text style={styles.xAxisLabel}>{dates[0]}</Text>
          <Text style={styles.xAxisLabel}>{dates[dates.length - 1]}</Text>
        </View>
      ) : null}
```

- [ ] **Step 4: Update styles**

Remove the now-unused `tooltip`, `tooltipRow`, `tooltipDot`, `tooltipValue` style entries from `createStyles`. Add:

```ts
    xAxisRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
      paddingTop: 4,
    },
    xAxisLabel: {
      fontSize: 10,
      color: colors.textMuted,
    },
```

`Text` remains imported/used (for the new labels), so no import changes needed there.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL at this point — `compare/index.tsx`'s `<CompareChart lines={lines} />` call is now missing the required `dates` prop. This is expected; Task 5 fixes the call site. Confirm the *only* error is the missing `dates` prop on that one call site, then proceed.

- [ ] **Step 6: Commit**

Hold this commit until Task 5 also lands (Task 5, Step 1 fixes the call site) — do the `git add`/`commit` for both files together at the end of Task 5 instead, so the tree typechecks at every commit. Skip committing here.

---

## Task 5: Compare screen — live time label header + "Value at crosshair" row mode

**Files:**
- Modify: `src/screens/compare/index.tsx`

**Interfaces:**
- Consumes: `CompareChart`'s `dates`/`onScrubChange` props (Task 4), `percentChangeAt`/`nearestIndexForX` (Task 1 / existing).

- [ ] **Step 1: Fix the `CompareChart` call site and add scrub state**

In the `Compare` function, after `const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());`, add:

```ts
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
```

Add the import: `import { nearestIndexForX, percentChangeAt } from '@/lib/compute/chartGeometry';`

Replace the `<CompareChart lines={lines} />` call with:

```tsx
            <CompareChart
              lines={lines}
              dates={entities[0]?.series.points.map((p) => p.date) ?? []}
              onScrubChange={setScrubFraction}
            />
```

- [ ] **Step 2: Compute the scrub date label and per-entity scrub percent**

After the `visibleCount`/`hasUnavailable`/`lines` declarations, add:

```ts
  const isScrubbing = scrubFraction !== null;
  const scrubDateLabel =
    isScrubbing && entities[0]
      ? entities[0].series.points[
          nearestIndexForX(scrubFraction!, entities[0].series.points.length, 1)
        ]?.date
      : null;

  function scrubPercentFor(entity: PortfolioPerformance): number | null {
    if (scrubFraction === null) return null;
    const values = entity.series.points.map((p) => p.value);
    if (values.length === 0) return null;
    const index = nearestIndexForX(scrubFraction, values.length, 1);
    return percentChangeAt(values, index);
  }
```

- [ ] **Step 3: Update the header to show the live time label**

Replace:

```tsx
        <Text style={styles.title}>{visibleCount} selected</Text>
```

with:

```tsx
        <Text style={styles.title}>
          {visibleCount} selected{scrubDateLabel ? ` · ${scrubDateLabel}` : ''}
        </Text>
```

- [ ] **Step 4: Swap the section label while scrubbing**

Replace:

```tsx
            <Text style={styles.sectionLabel}>Portfolios & Benchmarks</Text>
```

with:

```tsx
            <Text style={styles.sectionLabel}>
              {isScrubbing ? 'Value at crosshair' : 'Portfolios & Benchmarks'}
            </Text>
```

- [ ] **Step 5: Pass the scrub percent into `EntityRow` and add its "value at crosshair" render mode**

Replace the `<EntityRow ... />` call:

```tsx
        renderItem={({ item }) => (
          <EntityRow
            entity={item}
            color={colorById.get(item.portfolio.id) ?? colors.accent}
            isVisible={!hiddenIds.has(item.portfolio.id)}
            onToggle={() => toggle(item.portfolio.id)}
          />
        )}
```

with:

```tsx
        renderItem={({ item }) => (
          <EntityRow
            entity={item}
            color={colorById.get(item.portfolio.id) ?? colors.accent}
            isVisible={!hiddenIds.has(item.portfolio.id)}
            onToggle={() => toggle(item.portfolio.id)}
            scrubPercent={scrubPercentFor(item)}
          />
        )}
```

Update `EntityRow`'s props and body. Replace:

```tsx
function EntityRow({
  entity,
  color,
  isVisible,
  onToggle,
}: {
  entity: PortfolioPerformance;
  color: string;
  isVisible: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const holdingsSummary = entity.portfolio.holdings
    .slice(0, 3)
    .map((h) => `${Math.round(h.weight)}% ${h.ticker}`)
    .join(' · ');
  const isUnavailable = entity.dataFreshness.unavailableTickers.length > 0;

  return (
    <Pressable style={[styles.row, !isVisible && styles.rowHidden]} onPress={onToggle}>
      <View style={[styles.colorDot, { backgroundColor: color }]} />
      <View style={styles.rowMeta}>
        <Text style={styles.rowName}>{entity.portfolio.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {holdingsSummary || '—'}
        </Text>
        {isUnavailable ? (
          <Text style={[styles.rowSub, styles.rowSubWarn]} numberOfLines={1}>
            Couldn't load prices for {entity.dataFreshness.unavailableTickers.join(', ')}
          </Text>
        ) : (
          <Text style={styles.rowSub}>
            Sharpe {entity.stats.sharpe.toFixed(2)} · Vol {entity.stats.volatility.toFixed(1)}% · Max DD{' '}
            {entity.stats.maxDrawdown.toFixed(1)}%
            {entity.series.truncatedFrom ? ` · data from ${entity.series.truncatedFrom}` : ''}
            {entity.dataFreshness.stale ? ' · stale' : ''}
          </Text>
        )}
      </View>
      <Text style={styles.rowReturn}>
        {entity.stats.return >= 0 ? '+' : ''}
        {entity.stats.return.toFixed(2)}%
      </Text>
    </Pressable>
  );
}
```

with:

```tsx
function EntityRow({
  entity,
  color,
  isVisible,
  onToggle,
  scrubPercent,
}: {
  entity: PortfolioPerformance;
  color: string;
  isVisible: boolean;
  onToggle: () => void;
  scrubPercent: number | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const holdingsSummary = entity.portfolio.holdings
    .slice(0, 3)
    .map((h) => `${Math.round(h.weight)}% ${h.ticker}`)
    .join(' · ');
  const isUnavailable = entity.dataFreshness.unavailableTickers.length > 0;
  const displayPercent = scrubPercent ?? entity.stats.return;

  return (
    <Pressable style={[styles.row, !isVisible && styles.rowHidden]} onPress={onToggle}>
      <View style={[styles.colorDot, { backgroundColor: color }]} />
      <View style={styles.rowMeta}>
        <Text style={styles.rowName}>{entity.portfolio.name}</Text>
        {scrubPercent === null ? (
          isUnavailable ? (
            <Text style={[styles.rowSub, styles.rowSubWarn]} numberOfLines={1}>
              Couldn't load prices for {entity.dataFreshness.unavailableTickers.join(', ')}
            </Text>
          ) : (
            <>
              <Text style={styles.rowSub} numberOfLines={1}>
                {holdingsSummary || '—'}
              </Text>
              <Text style={styles.rowSub}>
                Sharpe {entity.stats.sharpe.toFixed(2)} · Vol {entity.stats.volatility.toFixed(1)}% · Max DD{' '}
                {entity.stats.maxDrawdown.toFixed(1)}%
                {entity.series.truncatedFrom ? ` · data from ${entity.series.truncatedFrom}` : ''}
                {entity.dataFreshness.stale ? ' · stale' : ''}
              </Text>
            </>
          )
        ) : null}
      </View>
      <Text style={styles.rowReturn}>
        {displayPercent >= 0 ? '+' : ''}
        {displayPercent.toFixed(2)}%
      </Text>
    </Pressable>
  );
}
```

(While scrubbing, this collapses the row down to exactly dot + name + live value — matching the mock's simplified "Value at crosshair" row — and reverts to the full holdings/stats display once the drag ends, since `scrubPercent` goes back to `null`.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (this also resolves the expected failure left at the end of Task 4).

- [ ] **Step 7: Simulator verification**

Open the Compare tab (deep link: `xcrun simctl openurl booted "exp://<lan-ip>:8081/--/compare"`), screenshot the default state, then drag across the chart and screenshot mid-drag. Confirm:
- x-axis start/end dates appear under the chart in both states.
- While dragging: header shows "N selected · <date>"; each visible entity's row collapses to dot + name + live % value; the section label reads "Value at crosshair".
- On release: header reverts to "N selected"; rows go back to showing holdings summary / Sharpe·Vol·MaxDD / static return; section label reverts to "Portfolios & Benchmarks".
- The old floating tooltip box is gone.

- [ ] **Step 8: Commit (covers both Task 4 and Task 5 changes)**

```bash
git add src/components/compare-chart.tsx src/screens/compare/index.tsx
git commit -m "feat: add Compare crosshair value list and live time label, matching mock"
```

---

## Task 6: Final cross-check against both mock screens

**Files:** none (verification-only)

- [x] **Step 1: Re-run the full test suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no errors.

Result: 61/61 tests pass, `tsc --noEmit` clean.

- [ ] **Step 2: Side-by-side screenshot comparison** — SKIPPED

Blocked: this Simulator install has no market-data provider configured (fresh SecureStore, empty state on Overview/Compare), and TextInput fields can't be reliably driven via AppleScript in this environment (documented limitation, see CLAUDE.md). User opted to skip this manual visual check rather than have it force-attempted; left for a manual follow-up smoke-test.

- [ ] **Step 3: Report any remaining pixel-level mismatches** — N/A, not performed (see Step 2)

Note (don't silently fix) any purely cosmetic deltas found (exact colors/spacing) for a follow-up pass — this plan targets functional/content parity, not a pixel-perfect redesign pass.

---

## Out of scope (noted, not fixed here)

- `CompareChart`'s per-line x-axis alignment when entities have different-length (truncated) series — each line is currently laid out over the full chart width independent of the others' actual date range. This is pre-existing behavior, not something introduced or claimed to be fixed by this plan, and isn't called out as broken in either mock (which assumes uniform-length lines).
- Pixel-exact color/spacing tuning against the mock (Task 6 catches and reports these, but fixing them is a separate pass to keep this plan's diff reviewable).
