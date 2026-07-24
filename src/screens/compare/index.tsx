import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompareChart, type CompareChartLine } from '@/components/compare-chart';
import { EmptyState } from '@/components/empty-state';
import { PeriodPills } from '@/components/period-pills';
import { compareEntities } from '@/lib/api/compare';
import { getActiveProvider } from '@/lib/api/settings';
import { DEFAULT_PERIOD, type PeriodKey, type PortfolioPerformance } from '@/lib/api/types';
import { dateDomain, nearestIndexForDate, percentChangeAt } from '@/lib/compute/chartGeometry';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function EntityRow({
  entity,
  color,
  isVisible,
  onToggle,
  scrubPercent,
}: {
  entity: PortfolioPerformance;
  color: string;
  isVisible: boolean;
  onToggle: () => void;
  scrubPercent: number | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const holdingsSummary = entity.portfolio.holdings
    .map((h) => `${Math.round(h.weight)}% ${h.ticker}`)
    .join(' · ');
  const isUnavailable = entity.dataFreshness.unavailableTickers.length > 0;
  const displayPercent = scrubPercent ?? entity.stats.return;

  return (
    <Pressable style={[styles.row, !isVisible && styles.rowHidden]} onPress={onToggle}>
      <View style={[styles.colorDot, { backgroundColor: color }]} />
      <View style={styles.rowMeta}>
        <Text style={styles.rowName}>{entity.portfolio.name}</Text>
        {scrubPercent === null ? (
          isUnavailable ? (
            <Text style={[styles.rowSub, styles.rowSubWarn]} numberOfLines={1}>
              Couldn't load prices for {entity.dataFreshness.unavailableTickers.join(', ')}
            </Text>
          ) : (
            <>
              <Text style={styles.rowSub}>
                {holdingsSummary || '—'}
              </Text>
              <Text style={styles.rowSub}>
                Sharpe {entity.stats.sharpe !== null ? entity.stats.sharpe.toFixed(2) : 'N/A'} · Vol{' '}
                {entity.stats.volatility.toFixed(1)}% · Max DD{' '}
                {entity.stats.maxDrawdown.toFixed(1)}%
                {entity.series.truncatedFrom ? ` · data from ${entity.series.truncatedFrom}` : ''}
                {entity.dataFreshness.stale ? ' · stale' : ''}
              </Text>
            </>
          )
        ) : null}
      </View>
      <Text style={styles.rowReturn}>
        {displayPercent >= 0 ? '+' : ''}
        {displayPercent.toFixed(2)}%
      </Text>
    </Pressable>
  );
}

export function Compare() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);

  const {
    data: entities = [],
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['compare', period],
    queryFn: () => compareEntities(period),
    placeholderData: keepPreviousData,
  });
  const { data: activeProvider, isPending: isProviderPending } = useQuery({
    queryKey: ['activeProvider'],
    queryFn: getActiveProvider,
  });

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    entities.forEach((e, i) => map.set(e.portfolio.id, colors.chartPalette[i % colors.chartPalette.length]));
    return map;
  }, [entities, colors]);

  function toggle(id: string) {
    setHiddenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleCount = entities.length - hiddenIds.size;
  const hasUnavailable = entities.some((e) => e.dataFreshness.unavailableTickers.length > 0);
  const lines: CompareChartLine[] = entities
    .filter((e) => !hiddenIds.has(e.portfolio.id))
    .map((e) => ({
      id: e.portfolio.id,
      color: colorById.get(e.portfolio.id) ?? colors.accent,
      dashed: e.portfolio.type === 'benchmark',
      points: e.series.points,
    }));
  // Shared date domain across the visible lines — the same one CompareChart
  // derives internally — so a scrub fraction resolves to the same target date
  // (and thus the same per-entity nearest point) here as it does on the chart.
  const chartDomain = dateDomain(lines.map((l) => l.points));
  const isScrubbing = scrubFraction !== null;
  const scrubTargetDate =
    isScrubbing && chartDomain.minDate && chartDomain.maxDate
      ? new Date(
          Date.parse(chartDomain.minDate) +
            scrubFraction! * (Date.parse(chartDomain.maxDate) - Date.parse(chartDomain.minDate))
        ).toISOString()
      : null;
  const scrubDateLabel =
    scrubTargetDate !== null && entities[0]
      ? entities[0].series.points[nearestIndexForDate(scrubTargetDate, entities[0].series.points)]?.date
      : null;

  function scrubPercentFor(entity: PortfolioPerformance): number | null {
    if (scrubTargetDate === null) return null;
    const values = entity.series.points.map((p) => p.value);
    if (values.length === 0) return null;
    const index = nearestIndexForDate(scrubTargetDate, entity.series.points);
    return percentChangeAt(values, index);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.eyebrow}>Compare</Text>
        <Text style={styles.title}>
          {visibleCount} selected
          {scrubDateLabel ? (
            <>
              {' · '}
              <Text style={styles.titleAccent}>{scrubDateLabel}</Text>
            </>
          ) : null}
        </Text>
      </View>
      {hasUnavailable ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Couldn't load some prices</Text>
          <Pressable onPress={() => refetch()} hitSlop={8}>
            <Text style={styles.bannerLink}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <PeriodPills active={period} onSelect={setPeriod} />
      {isPending ? (
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : entities.length === 0 ? (
        <EmptyState
          title="Nothing to compare yet"
          message="Add at least one portfolio to overlay its performance against benchmarks or other portfolios."
          ctaLabel="+ Add Portfolio"
          onPressCta={() => router.push('/add-portfolio')}
        />
      ) : !isProviderPending && !activeProvider ? (
        <EmptyState
          title="No market data provider"
          message="Add an API key in Settings to see performance, returns, and chart data."
          ctaLabel="Go to Settings"
          onPressCta={() => router.push('/account')}
        />
      ) : (
        <FlatList
          data={entities}
          keyExtractor={(item) => item.portfolio.id}
          ListHeaderComponent={
            <View style={styles.chartWrapper}>
              <CompareChart lines={lines} onScrubChange={setScrubFraction} />
              <Text style={styles.sectionLabel}>
                {isScrubbing
                  ? scrubDateLabel
                    ? `% return as of ${scrubDateLabel}`
                    : '% return at crosshair'
                  : 'Portfolios & Benchmarks'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <EntityRow
              entity={item}
              color={colorById.get(item.portfolio.id) ?? colors.accent}
              isVisible={!hiddenIds.has(item.portfolio.id)}
              onToggle={() => toggle(item.portfolio.id)}
              scrubPercent={scrubPercentFor(item)}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
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
    titleAccent: {
      color: colors.accentSoft,
    },
    chartWrapper: {
      paddingHorizontal: 18,
      paddingTop: 4,
      paddingBottom: 4,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '500',
      letterSpacing: 0.26,
      color: colors.textSecondary,
      marginTop: 18,
      marginBottom: 6,
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
    rowSubWarn: {
      color: colors.negative,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 18,
      marginBottom: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: colors.surfaceMuted,
    },
    bannerText: {
      fontSize: 12,
      color: colors.negative,
    },
    bannerLink: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.accent,
    },
    rowReturn: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.textPrimary,
    },
  });
