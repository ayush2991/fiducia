import { useMemo, useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent, View as RNView } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, Line, Path, Svg } from 'react-native-svg';

import { dateDomain, nearestIndexForDate, seriesRange, xFractionForDate } from '@/lib/compute/chartGeometry';
import type { DateDomain, DatedPoint } from '@/lib/compute/chartGeometry';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export type CompareChartLine = {
  id: string;
  color: string;
  dashed: boolean;
  points: DatedPoint[];
};

type CompareChartProps = {
  lines: CompareChartLine[];
  width?: number;
  height?: number;
  onScrubChange?: (fraction: number | null) => void;
};

const PAD_Y = 8;

// Unlike the single-entity PerformanceChart (which scales its one line to its own
// min/max), every line here must share one value scale so entities stay comparable.
// The x-axis, however, is positioned by each point's actual date within a shared
// domain — not by array index — so a line with less real history (e.g. a
// brand-new ticker) occupies only the trailing portion of the chart instead of
// being stretched across the same width as a much longer line.
function sharedScalePath(points: DatedPoint[], domain: DateDomain, min: number, max: number, width: number, height: number): string {
  if (points.length === 0) return '';
  const range = max - min || 1;
  return points
    .map((p, i) => {
      const x = xFractionForDate(p.date, domain) * width;
      const y = PAD_Y + (height - PAD_Y * 2) * (1 - (p.value - min) / range);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// Position of a single point on a line drawn with sharedScalePath — same shared
// domain/min/max, so a scrub gesture places the dot exactly on that line's own path.
function sharedScalePosition(
  points: DatedPoint[],
  index: number,
  domain: DateDomain,
  min: number,
  max: number,
  width: number,
  height: number
): { x: number; y: number } {
  const range = max - min || 1;
  const p = points[index];
  return {
    x: xFractionForDate(p.date, domain) * width,
    y: PAD_Y + (height - PAD_Y * 2) * (1 - (p.value - min) / range),
  };
}

export function CompareChart({ lines, width = 330, height = 160, onScrubChange }: CompareChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const touchAreaRef = useRef<RNView>(null);
  const pageOffsetXRef = useRef(0);
  const [chartAreaWidth, setChartAreaWidth] = useState(width);
  const [scrubX, setScrubX] = useState<number | null>(null);
  const allValues = lines.flatMap((l) => l.points.map((p) => p.value));
  const { min, max } = seriesRange(allValues);
  const domain = dateDomain(lines.map((l) => l.points));
  const activeScrubX = scrubX !== null && chartAreaWidth > 0 ? scrubX : null;
  const crosshairX = activeScrubX !== null ? (activeScrubX / chartAreaWidth) * width : null;
  const scrubTargetDate =
    activeScrubX !== null && domain.minDate && domain.maxDate
      ? new Date(
          Date.parse(domain.minDate) +
            (activeScrubX / chartAreaWidth) * (Date.parse(domain.maxDate) - Date.parse(domain.minDate))
        ).toISOString()
      : null;

  function handleTouch(evt: GestureResponderEvent) {
    if (chartAreaWidth <= 0) return;
    // `locationX` is relative to whichever native view is currently under the
    // finger, which on the New Architecture can be any of the Svg's several
    // nested child views (Path/Line/Circle) rather than this touch surface —
    // so it jumps around mid-drag instead of tracking smoothly. `pageX` is
    // always screen-relative and immune to that, so we subtract the touch
    // surface's own measured page offset (captured in handleLayout) instead.
    const x = Math.max(0, Math.min(chartAreaWidth, evt.nativeEvent.pageX - pageOffsetXRef.current));
    setScrubX(x);
    onScrubChange?.(x / chartAreaWidth);
  }

  function handleLayout(evt: LayoutChangeEvent) {
    setChartAreaWidth(evt.nativeEvent.layout.width);
    touchAreaRef.current?.measure((_x, _y, _w, _h, pageX) => {
      pageOffsetXRef.current = pageX;
    });
  }

  function endTouch() {
    setScrubX(null);
    onScrubChange?.(null);
  }

  return (
    <View style={styles.wrapper}>
      <View
        ref={touchAreaRef}
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={endTouch}
        onResponderTerminate={endTouch}
        onResponderTerminationRequest={() => false}
      >
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Line x1={0} y1={height * 0.14} x2={width} y2={height * 0.14} stroke="#2a2d3d" strokeWidth={1} />
          <Line x1={0} y1={height * 0.5} x2={width} y2={height * 0.5} stroke="#2a2d3d" strokeWidth={1} />
          <Line x1={0} y1={height * 0.86} x2={width} y2={height * 0.86} stroke="#2a2d3d" strokeWidth={1} />
          {lines.map((line) => (
            <Path
              key={line.id}
              d={sharedScalePath(line.points, domain, min, max, width, height)}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeDasharray={line.dashed ? '4,3' : undefined}
            />
          ))}
          {crosshairX !== null ? (
            <Line x1={crosshairX} y1={0} x2={crosshairX} y2={height} stroke={colors.accentSoft} strokeWidth={1.5} />
          ) : null}
          {scrubTargetDate !== null
            ? lines.map((line) => {
                if (line.points.length === 0) return null;
                const index = nearestIndexForDate(scrubTargetDate, line.points);
                const pos = sharedScalePosition(line.points, index, domain, min, max, width, height);
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
        </Svg>
      </View>
      {domain.minDate && domain.maxDate ? (
        <View style={styles.xAxisRow}>
          <Text style={styles.xAxisLabel}>{domain.minDate}</Text>
          <Text style={styles.xAxisLabel}>{domain.maxDate}</Text>
        </View>
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
    xAxisRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
      paddingTop: 4,
    },
    xAxisLabel: {
      fontSize: 10,
      color: colors.textSecondary,
    },
  });
