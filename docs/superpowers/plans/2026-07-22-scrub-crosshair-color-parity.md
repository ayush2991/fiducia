# Scrub/Crosshair Color Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three cosmetic color/style deltas found when comparing the running app's Overview (Detail) and Compare scrub/crosshair interaction against `"Nocturne Detail Scrub"` / `"Nocturne Compare Scrub"` in `docs/mock-reference.html`, without touching the Watchlist tab's green/red gain-loss color scheme.

**Architecture:** All three gaps are pure prop/style tweaks to the two existing chart components (`src/components/performance-chart.tsx`, `src/components/compare-chart.tsx`) plus one call-site color change in `src/screens/overview/index.tsx`. No new state, no new geometry math, no new components. `WatchlistRow` (`src/components/watchlist-row.tsx`) also renders `PerformanceChart` but passes its own `changeColor` (green/red) as the `lineColor` prop — since `lineColor` stays a prop the component doesn't hardcode, none of these changes touch it.

**Tech Stack:** React Native, `react-native-svg`, existing `useTheme()`/`ColorTokens` theming (`src/theme/themes/nocturne.ts`).

## Global Constraints

- Match `docs/mock-reference.html` exactly for the elements this plan touches — grep `data-screen-label="Nocturne Detail Scrub"` and `data-screen-label="Nocturne Compare Scrub"` to re-check exact hex/stroke/radius values while implementing.
- The Watchlist tab must keep its green/red (`colors.positive`/`colors.negative`) gain-loss color scheme — do not change `src/components/watchlist-row.tsx`'s `changeColor` logic or its `<PerformanceChart lineColor={changeColor} .../>` call.
- `src/components/` stays presentational (no data-fetching, no new logic beyond what's specified below).
- `npx tsc --noEmit` must stay clean after every task.
- UI tasks are only "done" once verified by screenshot on a running simulator/emulator (per CLAUDE.md's "Verifying UI changes") — a passing typecheck alone doesn't prove the visual is right.
- Reuse existing `ColorTokens` (`colors.accent`, `colors.accentSoft`, `colors.background`) rather than introducing new hardcoded hex literals, per `src/theme/` conventions in CLAUDE.md.

---

## Gaps addressed (from prior scrub-parity verification pass)

1. Both charts' crosshair vertical line renders dashed `#4c5397` (1px) — mock specifies a solid line at `#d2cefd` (`colors.accentSoft`), 1.5px, no dash.
2. Detail chart's line/pill/dot color (`PerformanceChart`'s `lineColor` prop, as called from `overview/index.tsx`) is gain/loss-based (`colors.positive`/`colors.negative`) — mock always uses the fixed purple accent `#9184d9` (`colors.accent`) for the Detail chart, regardless of return sign.
3. Detail's portfolio scrub dot (`performance-chart.tsx`) has no stroke and `r=4` — mock uses `r=4.5` with a `#161826` (`colors.background`) stroke, width 2. Compare's per-line scrub dots (`compare-chart.tsx`) have the same gap: no stroke, `r=3.5` vs. mock's `r=4` with a `#161826` stroke, width 1.5.

---

## Task 1: Crosshair vertical line — solid accent-soft in both charts

**Files:**
- Modify: `src/components/performance-chart.tsx:112-120`
- Modify: `src/components/compare-chart.tsx:109-119`

**Interfaces:** None — purely a style-prop change to existing `<Line>` elements. No new props, no signature changes.

- [x] **Step 1: Update `PerformanceChart`'s crosshair line**

In `src/components/performance-chart.tsx`, inside the `{showSeries ? (...) : null}` block, replace:

```tsx
              <Line
                x1={current.x}
                y1={0}
                x2={current.x}
                y2={height}
                stroke="#4c5397"
                strokeWidth={1}
                strokeDasharray="2,2"
              />
```

with:

```tsx
              <Line x1={current.x} y1={0} x2={current.x} y2={height} stroke={colors.accentSoft} strokeWidth={1.5} />
```

(`colors` is already destructured from `useTheme()` at the top of the component, so no new import is needed.)

- [x] **Step 2: Update `CompareChart`'s crosshair line**

In `src/components/compare-chart.tsx`, replace:

```tsx
          {crosshairX !== null ? (
            <Line
              x1={crosshairX}
              y1={0}
              x2={crosshairX}
              y2={height}
              stroke="#4c5397"
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          ) : null}
```

with:

```tsx
          {crosshairX !== null ? (
            <Line x1={crosshairX} y1={0} x2={crosshairX} y2={height} stroke={colors.accentSoft} strokeWidth={1.5} />
          ) : null}
```

(`colors` is already destructured from `useTheme()` at the top of `CompareChart`, so no new import is needed.)

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 4: Commit**

```bash
git add src/components/performance-chart.tsx src/components/compare-chart.tsx
git commit -m "fix: match mock's solid accent-soft crosshair line on both charts"
```

---

## Task 2: Scrub dot stroke/radius parity in both charts

**Files:**
- Modify: `src/components/performance-chart.tsx:121`
- Modify: `src/components/compare-chart.tsx:120-127`

**Interfaces:** None — purely a style-prop change to existing `<Circle>` elements.

- [x] **Step 1: Update `PerformanceChart`'s portfolio scrub dot**

In `src/components/performance-chart.tsx`, replace:

```tsx
              <Circle cx={current.x} cy={current.y} r={4} fill={lineColor} />
```

with:

```tsx
              <Circle cx={current.x} cy={current.y} r={4.5} fill={lineColor} stroke={colors.background} strokeWidth={2} />
```

- [x] **Step 2: Update `CompareChart`'s per-line scrub dots**

In `src/components/compare-chart.tsx`, replace:

```tsx
          {activeScrubX !== null
            ? lines.map((line) => {
                if (line.values.length === 0) return null;
                const index = nearestIndexForX(activeScrubX, line.values.length, chartAreaWidth);
                const pos = sharedScalePosition(line.values, index, min, max, width, height);
                return <Circle key={line.id} cx={pos.x} cy={pos.y} r={3.5} fill={line.color} />;
              })
            : null}
```

with:

```tsx
          {activeScrubX !== null
            ? lines.map((line) => {
                if (line.values.length === 0) return null;
                const index = nearestIndexForX(activeScrubX, line.values.length, chartAreaWidth);
                const pos = sharedScalePosition(line.values, index, min, max, width, height);
                return (
                  <Circle
                    key={line.id}
                    cx={pos.x}
                    cy={pos.y}
                    r={4}
                    fill={line.color}
                    stroke={colors.background}
                    strokeWidth={1.5}
                  />
                );
              })
            : null}
```

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 4: Commit**

```bash
git add src/components/performance-chart.tsx src/components/compare-chart.tsx
git commit -m "fix: match mock's stroked, larger scrub dots on both charts"
```

---

## Task 3: Detail chart uses fixed purple accent instead of gain/loss color

**Files:**
- Modify: `src/screens/overview/index.tsx:274`

**Interfaces:** None — call-site prop value change only. `PerformanceChart`'s `lineColor` prop type (`string`) is unchanged; `WatchlistRow`'s call site (`src/components/watchlist-row.tsx:65`) is untouched and keeps passing `changeColor` (green/red).

- [x] **Step 1: Change the Overview screen's `PerformanceChart` call to use the fixed accent color**

In `src/screens/overview/index.tsx`, replace:

```tsx
            <PerformanceChart
              series={detail.portfolio.series}
              benchmarkSeries={detail.benchmark.series}
              lineColor={detail.portfolio.stats.return >= 0 ? colors.positive : colors.negative}
              showSeries={showPortfolio}
              showBenchmark={showBenchmark}
              onScrubChange={setScrubFraction}
            />
```

with:

```tsx
            <PerformanceChart
              series={detail.portfolio.series}
              benchmarkSeries={detail.benchmark.series}
              lineColor={colors.accent}
              showSeries={showPortfolio}
              showBenchmark={showBenchmark}
              onScrubChange={setScrubFraction}
            />
```

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Simulator/emulator verification**

Start Metro without `CI=1` (so edits reload). Open the Overview tab (deep link: `xcrun simctl openurl booted "exp://<lan-ip>:8081/--/(tabs)"` on iOS, or `adb shell am start -a android.intent.action.VIEW -d "exp://<lan-ip>:<port>/--/"` on Android). Screenshot the default (non-scrub) state and mid-drag state. Confirm:
- The headline pill, chart line/area gradient, and portfolio scrub dot are all purple (`#9184d9`) regardless of whether the return is positive or negative — no more green/red on this screen.
- Then open the Watchlist tab, expand a ticker's detail chart, and confirm its line/pill/dot are still green for a positive return and red for a negative one (unchanged).

- [x] **Step 4: Commit**

```bash
git add src/screens/overview/index.tsx
git commit -m "fix: use fixed accent purple for Detail chart, matching mock"
```

---

## Task 4: Final cross-check against both mock scrub screens

**Files:** none (verification-only)

- [x] **Step 1: Re-run typecheck and the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: all pass, no errors (this plan adds no new pure-function logic, so no new Jest tests are needed — `src/lib/compute/*.test.ts` should be unaffected).

- [x] **Step 2: Side-by-side screenshot comparison**

On a running simulator/emulator: screenshot Overview mid-scrub and Compare mid-scrub, and open `docs/mock-reference.html`'s `"Nocturne Detail Scrub"` / `"Nocturne Compare Scrub"` sections side by side. Confirm:
- Crosshair line: solid light-purple, not dashed, on both charts.
- Scrub dots: visibly stroked with a dark ring, not flat-filled, on both charts.
- Detail chart: purple line/pill/dot in both a positive- and a negative-return portfolio (switch periods or portfolios if needed to see a negative case).
- Watchlist: still green/red, unaffected.

- [x] **Step 3: Note any remaining deltas**

If anything still doesn't match (e.g. exact stroke width rounding on-device), note it in the commit message or a follow-up — do not silently leave this step unchecked without a reason recorded.

---

## Out of scope (noted, not fixed here)

- Any further pixel-exact spacing/typography tuning beyond the three color/style gaps listed above — this plan targets exactly the deltas found in the prior verification pass, not a full re-audit.
