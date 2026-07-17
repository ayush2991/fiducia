import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompareChart, type CompareChartLine } from '@/components/compare-chart';
import { EmptyState } from '@/components/empty-state';
import { PeriodPills } from '@/components/period-pills';
import { compareEntities } from '@/lib/api/compare';
import { DEFAULT_PERIOD, type PeriodKey, type PortfolioPerformance } from '@/lib/api/types';
import { colors } from '@/theme/colors';

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
  const changeColor = entity.stats.return >= 0 ? colors.positive : colors.negative;
  const holdingsSummary = entity.portfolio.holdings
    .slice(0, 3)
    .map((h) => `${Math.round(h.weight)}% ${h.ticker}`)
    .join(' · ');

  return (
    <Pressable style={[styles.row, !isVisible && styles.rowHidden]} onPress={onToggle}>
      <View style={[styles.colorDot, { backgroundColor: color }]} />
      <View style={styles.rowMeta}>
        <Text style={styles.rowName}>{entity.portfolio.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {holdingsSummary || '—'}
        </Text>
        <Text style={styles.rowSub}>
          Sharpe {entity.stats.sharpe.toFixed(2)} · Vol {entity.stats.volatility.toFixed(1)}% · Max DD{' '}
          {entity.stats.maxDrawdown.toFixed(1)}%
        </Text>
      </View>
      <Text style={[styles.rowReturn, { color: changeColor }]}>
        {entity.stats.return >= 0 ? '+' : ''}
        {entity.stats.return.toFixed(1)}%
      </Text>
    </Pressable>
  );
}

export function Compare() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const { data: entities = [], isPending } = useQuery({
    queryKey: ['compare', period],
    queryFn: () => compareEntities(period),
  });

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    entities.forEach((e, i) => map.set(e.portfolio.id, colors.chartPalette[i % colors.chartPalette.length]));
    return map;
  }, [entities]);

  function toggle(id: string) {
    setHiddenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (entities.length === 0) {
    return (
      <EmptyState
        title="Nothing to compare yet"
        message="Add at least one portfolio to overlay its performance against benchmarks or other portfolios."
        ctaLabel="+ Add Portfolio"
        onPressCta={() => router.push('/add-portfolio')}
      />
    );
  }

  const visibleCount = entities.length - hiddenIds.size;
  const lines: CompareChartLine[] = entities
    .filter((e) => !hiddenIds.has(e.portfolio.id))
    .map((e) => ({
      id: e.portfolio.id,
      color: colorById.get(e.portfolio.id) ?? colors.accent,
      dashed: e.portfolio.type === 'benchmark',
      values: e.series.points.map((p) => p.value),
    }));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.eyebrow}>Compare</Text>
        <Text style={styles.title}>
          {visibleCount} {visibleCount === 1 ? 'entity' : 'entities'} shown
        </Text>
      </View>
      <PeriodPills active={period} onSelect={setPeriod} />
      <FlatList
        data={entities}
        keyExtractor={(item) => item.portfolio.id}
        ListHeaderComponent={
          <View style={styles.chartWrapper}>
            <CompareChart lines={lines} />
          </View>
        }
        renderItem={({ item }) => (
          <EntityRow
            entity={item}
            color={colorById.get(item.portfolio.id) ?? colors.accent}
            isVisible={!hiddenIds.has(item.portfolio.id)}
            onToggle={() => toggle(item.portfolio.id)}
          />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color: colors.accent,
    fontWeight: '500',
  },
  title: {
    fontSize: 19,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 3,
  },
  chartWrapper: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 12,
  },
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  rowHidden: {
    opacity: 0.4,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  rowMeta: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  rowSub: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  rowReturn: {
    fontSize: 14,
    fontWeight: '600',
  },
});
