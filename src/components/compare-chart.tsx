import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Line, Path, Svg } from 'react-native-svg';

import { seriesRange } from '@/lib/compute/chartGeometry';
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
  width?: number;
  height?: number;
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

export function CompareChart({ lines, width = 330, height = 160 }: CompareChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const allValues = lines.flatMap((l) => l.values);
  const { min, max } = seriesRange(allValues);

  return (
    <View style={styles.wrapper}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Line x1={0} y1={height * 0.14} x2={width} y2={height * 0.14} stroke={colors.chartGridLine} strokeWidth={1} />
        <Line x1={0} y1={height * 0.5} x2={width} y2={height * 0.5} stroke={colors.chartGridLine} strokeWidth={1} />
        <Line x1={0} y1={height * 0.86} x2={width} y2={height * 0.86} stroke={colors.chartGridLine} strokeWidth={1} />
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
      </Svg>
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
    },
  });
