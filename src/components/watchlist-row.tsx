import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

import { linePath } from '@/lib/compute/chartGeometry';
import type { WatchlistTickerPerformance } from '@/lib/api/types';
import { colors } from '@/theme/colors';

type WatchlistRowProps = {
  item: WatchlistTickerPerformance;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function WatchlistRow({ item, onPress, onLongPress }: WatchlistRowProps) {
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
      <Pressable style={styles.row} onPress={onPress} onLongPress={onLongPress}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#1e2030',
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
});
