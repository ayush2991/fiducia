import { useMemo, useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent, View as RNView } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Circle, Defs, Line, LinearGradient, Path, Stop, Svg, Text as SvgText } from 'react-native-svg';

import {
  areaPathByDate,
  dateDomain,
  linePathByDate,
  nearestIndexForDate,
  percentChangeAt,
  pointPositionByDate,
  seriesRange,
} from '@/lib/compute/chartGeometry';
import type { PerformanceSeries } from '@/lib/api/types';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type PerformanceChartProps = {
  series: PerformanceSeries;
  benchmarkSeries?: PerformanceSeries;
  lineColor: string;
  width?: number;
  height?: number;
  showSeries?: boolean;
  showBenchmark?: boolean;
  onScrubChange?: (fraction: number | null) => void;
  seriesLabel?: string;
  benchmarkLabel?: string;
  onToggleSeries?: () => void;
  onToggleBenchmark?: () => void;
  // What the scrub pill reports at the crosshair: 'percent' (return since the
  // start of the window, the default) or 'value' (the series' indexed value at
  // that point — see backtest.ts, indexed to 100 at the first shared date).
  valueDisplay?: 'percent' | 'value';
  // Draw the $max/$mid/$min labels on the horizontal grid lines. Off when the
  // scrub pill already surfaces the value (see Overview).
  showScaleLabels?: boolean;
};

// The scrub pill either reports return-since-start ('+2.14%') or the indexed
// value at the crosshair ('$102.14' — a "growth of $100" figure, since the
// backtest indexes each series to 100 at its first shared date).
function formatPill(values: number[], index: number, mode: 'percent' | 'value'): string {
  if (mode === 'value') {
    return `$${(values[index] ?? 0).toFixed(2)}`;
  }
  const pct = percentChangeAt(values, index);
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

export function PerformanceChart({
  series,
  benchmarkSeries,
  lineColor,
  width = 330,
  height = 130,
  showSeries = true,
  showBenchmark = true,
  onScrubChange,
  seriesLabel,
  benchmarkLabel,
  onToggleSeries,
  onToggleBenchmark,
  valueDisplay = 'percent',
  showScaleLabels = true,
}: PerformanceChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const touchAreaRef = useRef<RNView>(null);
  const pageOffsetXRef = useRef(0);
  const isTouchingRef = useRef(false);
  const [chartAreaWidth, setChartAreaWidth] = useState(width);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const values = series.points.map((p) => p.value);
  const benchmarkValues = benchmarkSeries?.points.map((p) => p.value) ?? [];
  // Portfolio and benchmark share one value scale (like CompareChart) rather than
  // each being normalized to its own min/max — otherwise a 50%-return line and a
  // 16%-return line would both get stretched to fill the same chart height and
  // look equally sized instead of visibly different.
  const { min, max } = seriesRange([...values, ...benchmarkValues]);
  const mid = (min + max) / 2;
  const benchmarkPoints = benchmarkSeries?.points ?? [];
  // A shared date domain across both series, so a series with less real
  // history (e.g. a brand-new ticker) is positioned by its actual dates
  // instead of being stretched index-by-index across the same width as a
  // series with far more history.
  const domain = dateDomain([series.points, benchmarkPoints]);
  // Each series can have a different length (truncated history — see
  // CLAUDE.md's market-data section), so the drag position is resolved to
  // an index independently per series — by converting the touch fraction to
  // a target date within the shared domain, then finding each series' own
  // nearest point to that date — rather than sharing one `scrubIndex`.
  const targetDate =
    scrubFraction !== null
      ? new Date(
          Date.parse(domain.minDate) + scrubFraction * (Date.parse(domain.maxDate) - Date.parse(domain.minDate))
        ).toISOString()
      : null;
  const displayIndex =
    targetDate !== null ? nearestIndexForDate(targetDate, series.points) : values.length - 1;
  const benchmarkDisplayIndex =
    benchmarkPoints.length > 0
      ? targetDate !== null
        ? nearestIndexForDate(targetDate, benchmarkPoints)
        : benchmarkPoints.length - 1
      : null;
  const current = pointPositionByDate(series.points, displayIndex, domain, { min, max }, width, height);
  // `current.x` lives in the SVG's internal `width`-unit viewBox space, which the
  // <Svg> stretches to the actual rendered width via preserveAspectRatio="none" —
  // but pillGroup below is a plain RN View, not part of that coordinate system, so
  // its position has to be rescaled to real pixels or it drifts from the crosshair
  // whenever the rendered width differs from `width`.
  const renderedX = chartAreaWidth > 0 ? (current.x / width) * chartAreaWidth : current.x;
  const pillLeft = Math.max(24, Math.min(chartAreaWidth - 24, renderedX));
  const gradientId = 'watchlist-chart-gradient';

  function updateScrub(fraction: number | null) {
    setScrubFraction(fraction);
    onScrubChange?.(fraction);
  }

  function handleTouch(evt: GestureResponderEvent) {
    if (values.length === 0 || chartAreaWidth <= 0) return;
    // `locationX` is relative to whichever native view is currently under the
    // finger, which on the New Architecture can be any of the Svg's several
    // nested child views (Path/Line/Circle) rather than this touch surface —
    // so it jumps around mid-drag instead of tracking smoothly. `pageX` is
    // always screen-relative and immune to that, so we subtract the touch
    // surface's own measured page offset (captured in handleLayout) instead.
    const x = evt.nativeEvent.pageX - pageOffsetXRef.current;
    updateScrub(Math.max(0, Math.min(1, x / chartAreaWidth)));
  }

  function handleLayout(evt: LayoutChangeEvent) {
    setChartAreaWidth(evt.nativeEvent.layout.width);
    // A layout above the chart (e.g. Overview's headline, which re-renders with new
    // text on every scrub tick) can shift this view and re-fire onLayout mid-drag.
    // measure() resolves asynchronously, so a stale/racy result landing while the
    // finger is still moving can snap pageOffsetXRef to a wrong value and send the
    // crosshair flying to an edge. The offset can't legitimately change mid-touch,
    // so skip the remeasure while a touch is active.
    if (isTouchingRef.current) return;
    touchAreaRef.current?.measure((_x, _y, _w, _h, pageX) => {
      pageOffsetXRef.current = pageX;
    });
  }

  return (
    <View style={styles.wrapper}>
      <View
        ref={touchAreaRef}
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(evt) => {
          isTouchingRef.current = true;
          handleTouch(evt);
        }}
        onResponderMove={handleTouch}
        onResponderRelease={() => {
          isTouchingRef.current = false;
          updateScrub(null);
        }}
        onResponderTerminate={() => {
          isTouchingRef.current = false;
          updateScrub(null);
        }}
        onResponderTerminationRequest={() => false}
      >
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Line x1={0} y1={height * 0.14} x2={width} y2={height * 0.14} stroke={colors.border} strokeWidth={1} />
          <Line x1={0} y1={height * 0.5} x2={width} y2={height * 0.5} stroke={colors.border} strokeWidth={1} />
          <Line x1={0} y1={height * 0.86} x2={width} y2={height * 0.86} stroke={colors.border} strokeWidth={1} />
          {showSeries ? (
            <Path d={areaPathByDate(series.points, domain, { min, max }, width, height)} fill={`url(#${gradientId})`} />
          ) : null}
          {showBenchmark && benchmarkPoints.length > 0 ? (
            <Path
              d={linePathByDate(benchmarkPoints, domain, { min, max }, width, height)}
              fill="none"
              stroke={colors.textMuted}
              strokeWidth={1.3}
              strokeDasharray="3,3"
            />
          ) : null}
          {showBenchmark && benchmarkPoints.length > 0 && benchmarkDisplayIndex !== null
            ? (() => {
                const pos = pointPositionByDate(
                  benchmarkPoints,
                  benchmarkDisplayIndex,
                  domain,
                  { min, max },
                  width,
                  height
                );
                return (
                  <Circle
                    cx={pos.x}
                    cy={pos.y}
                    r={3.5}
                    fill={colors.background}
                    stroke={colors.textSecondary}
                    strokeWidth={1.5}
                  />
                );
              })()
            : null}
          {showSeries ? (
            <>
              <Path
                d={linePathByDate(series.points, domain, { min, max }, width, height)}
                fill="none"
                stroke={lineColor}
                strokeWidth={2}
              />
              <Line x1={current.x} y1={0} x2={current.x} y2={height} stroke={colors.accentSoft} strokeWidth={1.5} />
              <Circle cx={current.x} cy={current.y} r={4.5} fill={lineColor} stroke={colors.background} strokeWidth={2} />
            </>
          ) : null}
          {showScaleLabels ? (
            <>
              <SvgText x={4} y={height * 0.14 + 4} fill={colors.accentSoft} fontSize={9} fontWeight="600">
                ${max.toFixed(0)}
              </SvgText>
              <SvgText x={4} y={height * 0.5 + 4} fill={colors.textSecondary} fontSize={9}>
                ${mid.toFixed(0)}
              </SvgText>
              <SvgText x={4} y={height * 0.86 + 4} fill={colors.accentSoft} fontSize={9} fontWeight="600">
                ${min.toFixed(0)}
              </SvgText>
            </>
          ) : null}
        </Svg>
      </View>
      {series.points.length > 0 ? (
        <View style={styles.xAxisRow}>
          <Text style={styles.xAxisLabel}>{series.points[0].date}</Text>
          <Text style={styles.xAxisLabel}>{series.points[series.points.length - 1].date}</Text>
        </View>
      ) : null}
      {seriesLabel && benchmarkLabel ? (
        <View style={styles.legendRow}>
          <Pressable
            style={[styles.legendChip, { borderColor: lineColor, opacity: showSeries ? 1 : 0.4 }]}
            onPress={onToggleSeries}
          >
            <View style={[styles.legendDot, { backgroundColor: lineColor }]} />
            <Text style={styles.legendLabel}>{seriesLabel}</Text>
          </Pressable>
          <Pressable
            style={[styles.legendChip, { borderColor: colors.textMuted, opacity: showBenchmark ? 1 : 0.4 }]}
            onPress={onToggleBenchmark}
          >
            <View style={[styles.legendDash, { backgroundColor: colors.textSecondary }]} />
            <Text style={styles.legendLabel}>{benchmarkLabel}</Text>
          </Pressable>
        </View>
      ) : null}
      {showSeries ? (
        <View style={[styles.pillGroup, { left: pillLeft - 20 }]}>
          <View style={[styles.pill, { backgroundColor: lineColor }]}>
            <Text style={styles.pillLabel}>
              {series.points.length > 0 ? formatPill(values, displayIndex, valueDisplay) : ''}
            </Text>
          </View>
          {showBenchmark && benchmarkValues.length > 0 && benchmarkDisplayIndex !== null ? (
            <View style={styles.benchPill}>
              <Text style={styles.benchPillLabel}>
                Bench {formatPill(benchmarkValues, benchmarkDisplayIndex, valueDisplay)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {showSeries && scrubFraction !== null && series.points[displayIndex] ? (
        <Text style={styles.scrubDate}>{series.points[displayIndex].date}</Text>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    wrapper: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingTop: 14,
      paddingHorizontal: 10,
      paddingBottom: 4,
      position: 'relative',
    },
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
    xAxisRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
      paddingTop: 4,
    },
    xAxisLabel: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    legendRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
      paddingBottom: 10,
    },
    legendChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 20,
      borderWidth: 1,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendDash: {
      width: 8,
      height: 1.5,
    },
    legendLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    scrubDate: {
      position: 'absolute',
      top: -2,
      right: 10,
      fontSize: 9,
      color: colors.textMuted,
    },
  });
