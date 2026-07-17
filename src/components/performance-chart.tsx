import { StyleSheet, Text, View } from 'react-native';
import { Circle, Defs, Line, LinearGradient, Path, Stop, Svg, Text as SvgText } from 'react-native-svg';

import { areaPath, lastPointPosition, linePath, seriesRange } from '@/lib/compute/chartGeometry';
import type { PerformanceSeries } from '@/lib/api/types';
import { colors } from '@/theme/colors';

type PerformanceChartProps = {
  series: PerformanceSeries;
  benchmarkSeries?: PerformanceSeries;
  lineColor: string;
  width?: number;
  height?: number;
};

export function PerformanceChart({
  series,
  benchmarkSeries,
  lineColor,
  width = 330,
  height = 130,
}: PerformanceChartProps) {
  const values = series.points.map((p) => p.value);
  const benchmarkValues = benchmarkSeries?.points.map((p) => p.value) ?? [];
  const { min, max } = seriesRange(values);
  const last = lastPointPosition(values, width, height);
  const pillLeft = Math.max(24, Math.min(width - 24, last.x));
  const gradientId = 'watchlist-chart-gradient';

  return (
    <View style={styles.wrapper}>
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
        <Path d={areaPath(values, width, height)} fill={`url(#${gradientId})`} />
        {benchmarkValues.length > 0 ? (
          <Path
            d={linePath(benchmarkValues, width, height)}
            fill="none"
            stroke="#595d6c"
            strokeWidth={1.3}
            strokeDasharray="3,3"
          />
        ) : null}
        <Path d={linePath(values, width, height)} fill="none" stroke={lineColor} strokeWidth={2} />
        <Line x1={last.x} y1={0} x2={last.x} y2={height} stroke="#4c5397" strokeWidth={1} strokeDasharray="2,2" />
        <Circle cx={last.x} cy={last.y} r={4} fill={lineColor} />
        <SvgText x={width - 28} y={height * 0.14 + 4} fill="#75798c" fontSize={9}>
          {max.toFixed(0)}
        </SvgText>
        <SvgText x={width - 28} y={height * 0.86 + 4} fill="#75798c" fontSize={9}>
          {min.toFixed(0)}
        </SvgText>
      </Svg>
      <View style={[styles.pill, { left: pillLeft - 20, backgroundColor: lineColor }]}>
        <Text style={styles.pillLabel}>
          {series.points.length > 0
            ? `${values[values.length - 1] >= values[0] ? '+' : ''}${(
                ((values[values.length - 1] - values[0]) / values[0]) *
                100
              ).toFixed(1)}%`
            : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingTop: 14,
    paddingHorizontal: 10,
    paddingBottom: 4,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 12,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.background,
  },
});
