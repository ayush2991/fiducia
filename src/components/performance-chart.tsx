import { useMemo, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
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
};

export function PerformanceChart({
  series,
  benchmarkSeries,
  lineColor,
  width = 330,
  height = 130,
  showSeries = true,
  showBenchmark = true,
  onScrubChange,
}: PerformanceChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [chartAreaWidth, setChartAreaWidth] = useState(width);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const values = series.points.map((p) => p.value);
  const benchmarkValues = benchmarkSeries?.points.map((p) => p.value) ?? [];
  // Portfolio and benchmark share one value scale (like CompareChart) rather than
  // each being normalized to its own min/max — otherwise a 50%-return line and a
  // 16%-return line would both get stretched to fill the same chart height and
  // look equally sized instead of visibly different.
  const { min, max } = seriesRange([...values, ...benchmarkValues]);
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
    updateScrub(Math.max(0, Math.min(1, evt.nativeEvent.locationX / chartAreaWidth)));
  }

  function handleLayout(evt: LayoutChangeEvent) {
    setChartAreaWidth(evt.nativeEvent.layout.width);
  }

  return (
    <View style={styles.wrapper}>
      <View
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => updateScrub(null)}
        onResponderTerminate={() => updateScrub(null)}
      >
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
          {showSeries ? (
            <Path d={areaPathByDate(series.points, domain, { min, max }, width, height)} fill={`url(#${gradientId})`} />
          ) : null}
          {showBenchmark && benchmarkPoints.length > 0 ? (
            <Path
              d={linePathByDate(benchmarkPoints, domain, { min, max }, width, height)}
              fill="none"
              stroke="#595d6c"
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
          <SvgText x={width - 28} y={height * 0.14 + 4} fill="#75798c" fontSize={9}>
            {max.toFixed(0)}
          </SvgText>
          <SvgText x={width - 28} y={height * 0.86 + 4} fill="#75798c" fontSize={9}>
            {min.toFixed(0)}
          </SvgText>
        </Svg>
      </View>
      {series.points.length > 0 ? (
        <View style={styles.xAxisRow}>
          <Text style={styles.xAxisLabel}>{series.points[0].date}</Text>
          <Text style={styles.xAxisLabel}>{series.points[series.points.length - 1].date}</Text>
        </View>
      ) : null}
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
    scrubDate: {
      position: 'absolute',
      top: -2,
      right: 10,
      fontSize: 9,
      color: colors.textMuted,
    },
  });
