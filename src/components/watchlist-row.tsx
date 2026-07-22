import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

import { PerformanceChart } from '@/components/performance-chart';
import { linePath } from '@/lib/compute/chartGeometry';
import type { WatchlistTickerPerformance } from '@/lib/api/types';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type WatchlistRowProps = {
  item: WatchlistTickerPerformance;
  benchmarkSeries?: WatchlistTickerPerformance['series'];
  isOpen: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  onRetry?: () => void;
};

const STATS_ROWS: { key: keyof WatchlistTickerPerformance['stats']; label: string; suffix: string }[] = [
  { key: 'sharpe', label: 'Sharpe Ratio', suffix: '' },
  { key: 'volatility', label: 'Volatility', suffix: '%' },
  { key: 'maxDrawdown', label: 'Max Drawdown', suffix: '%' },
  { key: 'alpha', label: 'Alpha (vs S&P 500)', suffix: '%' },
  { key: 'beta', label: 'Beta (vs S&P 500)', suffix: '' },
  { key: 'correlation', label: 'Correlation (vs S&P 500)', suffix: '' },
];

export function WatchlistRow({ item, benchmarkSeries, isOpen, onToggle, onLongPress, onRetry }: WatchlistRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const changeColor = item.stats.return >= 0 ? colors.positive : colors.negative;
  const changeLabel = `${item.stats.return >= 0 ? '+' : ''}${item.stats.return.toFixed(1)}%`;
  const sparkPath = linePath(
    item.series.points.map((p) => p.value),
    56,
    24,
    3
  );

  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.row} onPress={onToggle} onLongPress={onLongPress}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{item.ticker}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.ticker}>{item.ticker}</Text>
        </View>
        <Svg width={56} height={24} viewBox="0 0 56 24" preserveAspectRatio="none">
          <Path d={sparkPath} fill="none" stroke={changeColor} strokeWidth={1.5} />
        </Svg>
        <View style={styles.priceCol}>
          <Text style={styles.price}>${item.price.toFixed(2)}</Text>
          <Text style={[styles.change, { color: changeColor }]}>{changeLabel}</Text>
        </View>
      </Pressable>
      {isOpen ? (
        <View style={styles.detail}>
          {item.series.points.length > 0 ? (
            <>
              <PerformanceChart series={item.series} benchmarkSeries={benchmarkSeries} lineColor={changeColor} />
              <Text style={styles.caption}>Dashed line: S&P 500 · same period</Text>
              {item.series.truncatedFrom ? (
                <Text style={styles.caption}>Data from {item.series.truncatedFrom}</Text>
              ) : null}
              {item.dataFreshness.stale ? (
                <Text style={styles.caption}>
                  Prices as of {item.series.points[item.series.points.length - 1].date} · couldn't refresh
                </Text>
              ) : null}
              <View style={styles.statsTable}>
                {STATS_ROWS.map((row) => (
                  <View key={row.key} style={styles.statRow}>
                    <Text style={styles.statLabel}>{row.label}</Text>
                    <Text style={styles.statValue}>
                      {item.stats[row.key].toFixed(2)}
                      {row.suffix}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.retryRow}>
              <Text style={styles.retryText}>Couldn't load prices for {item.ticker}</Text>
              {onRetry ? (
                <Pressable onPress={onRetry} hitSlop={8}>
                  <Text style={styles.retryLink}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    wrapper: {
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 18,
    },
    badge: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.accentSoft,
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 13,
      color: colors.textPrimary,
    },
    ticker: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    priceCol: {
      alignItems: 'flex-end',
      width: 66,
    },
    price: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    change: {
      fontSize: 11,
      marginTop: 2,
    },
    detail: {
      paddingHorizontal: 18,
      paddingBottom: 20,
    },
    caption: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 6,
    },
    retryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    retryText: {
      fontSize: 12,
      color: colors.negative,
      flex: 1,
      marginRight: 8,
    },
    retryLink: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.accent,
    },
    statsTable: {
      marginTop: 12,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: '#21232f',
    },
    statLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    statValue: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
