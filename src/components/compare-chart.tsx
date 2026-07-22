import { useMemo, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, Line, Path, Svg } from 'react-native-svg';

import { nearestIndexForX, seriesRange } from '@/lib/compute/chartGeometry';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export type CompareChartLine = {
  id: string;
  color: string;
  dashed: boolean;
  values: number[];
};

type CompareChartProps = {
  lines: CompareChartLine[];
  dates: string[];
  width?: number;
  height?: number;
  onScrubChange?: (fraction: number | null) => void;
};

const PAD_Y = 8;

// Unlike the single-entity PerformanceChart (which scales its one line to its own
// min/max), every line here must share one scale so entities stay comparable.
function sharedScalePath(values: number[], min: number, max: number, width: number, height: number): string {
  if (values.length === 0) return '';
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = PAD_Y + (height - PAD_Y * 2) * (1 - (v - min) / range);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// Position of a single point on a line drawn with sharedScalePath — same shared
// min/max, so a scrub gesture places the dot exactly on that line's own path.
function sharedScalePosition(
  values: number[],
  index: number,
  min: number,
  max: number,
  width: number,
  height: number
): { x: number; y: number } {
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const v = values[index];
  return { x: index * stepX, y: PAD_Y + (height - PAD_Y * 2) * (1 - (v - min) / range) };
}

export function CompareChart({ lines, dates, width = 330, height = 160, onScrubChange }: CompareChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [chartAreaWidth, setChartAreaWidth] = useState(width);
  const [scrubX, setScrubX] = useState<number | null>(null);
  const allValues = lines.flatMap((l) => l.values);
  const { min, max } = seriesRange(allValues);
  const activeScrubX = scrubX !== null && chartAreaWidth > 0 ? scrubX : null;
  const crosshairX = activeScrubX !== null ? (activeScrubX / chartAreaWidth) * width : null;

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

  return (
    <View style={styles.wrapper}>
      <View
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={endTouch}
        onResponderTerminate={endTouch}
      >
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Line x1={0} y1={height * 0.14} x2={width} y2={height * 0.14} stroke="#2a2d3d" strokeWidth={1} />
          <Line x1={0} y1={height * 0.5} x2={width} y2={height * 0.5} stroke="#2a2d3d" strokeWidth={1} />
          <Line x1={0} y1={height * 0.86} x2={width} y2={height * 0.86} stroke="#2a2d3d" strokeWidth={1} />
          {lines.map((line) => (
            <Path
              key={line.id}
              d={sharedScalePath(line.values, min, max, width, height)}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeDasharray={line.dashed ? '4,3' : undefined}
            />
          ))}
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
          {activeScrubX !== null
            ? lines.map((line) => {
                if (line.values.length === 0) return null;
                const index = nearestIndexForX(activeScrubX, line.values.length, chartAreaWidth);
                const pos = sharedScalePosition(line.values, index, min, max, width, height);
                return <Circle key={line.id} cx={pos.x} cy={pos.y} r={3.5} fill={line.color} />;
              })
            : null}
        </Svg>
      </View>
      {dates.length > 0 ? (
        <View style={styles.xAxisRow}>
          <Text style={styles.xAxisLabel}>{dates[0]}</Text>
          <Text style={styles.xAxisLabel}>{dates[dates.length - 1]}</Text>
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
      color: colors.textMuted,
    },
  });
