import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PerformanceChart } from '@/components/performance-chart';
import { EmptyState } from '@/components/empty-state';
import { ChevronDownIcon } from '@/components/icons';
import { PeriodPills } from '@/components/period-pills';
import { getPortfolioPerformance } from '@/lib/api/compare';
import { nearestIndexForX, percentChangeAt } from '@/lib/compute/chartGeometry';
import { listPortfolios } from '@/lib/api/portfolios';
import { getActiveProvider } from '@/lib/api/settings';
import { DEFAULT_PERIOD, type Holding, type PerformanceStats, type PeriodKey, type Portfolio } from '@/lib/api/types';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function HoldingItem({ holding }: { holding: Holding }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.holdingRow}>
      <View style={styles.tickerBadge}>
        <Text style={styles.tickerBadgeText}>{holding.ticker}</Text>
      </View>
      <View style={styles.holdingMeta}>
        <Text style={styles.holdingName} numberOfLines={1}>
          {holding.name}
        </Text>
        <View style={styles.weightBarTrack}>
          <View style={[styles.weightBarFill, { width: `${holding.weight}%` }]} />
        </View>
      </View>
      <Text style={styles.holdingWeight}>{holding.weight.toFixed(1)}%</Text>
    </View>
  );
}

function PortfolioSwitcher({
  portfolios,
  activeId,
  onSelect,
  onClose,
  onAddNew,
}: {
  portfolios: Portfolio[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onAddNew: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
          <View style={styles.dragHandle} />
          <Text style={styles.switcherTitle}>Your Portfolios</Text>
          {portfolios.map((p) => {
            const isActive = p.id === activeId;
            const sub = p.holdings
              .slice(0, 3)
              .map((h) => `${Math.round(h.weight)}% ${h.ticker}`)
              .join(' · ');
            return (
              <Pressable
                key={p.id}
                style={styles.switcherRow}
                onPress={() => { onSelect(p.id); onClose(); }}
              >
                <View style={[styles.radioDot, { borderColor: isActive ? colors.accent : colors.borderStrong }]}>
                  {isActive && <View style={styles.radioDotFill} />}
                </View>
                <View style={styles.switcherRowMeta}>
                  <Text style={styles.switcherRowName}>{p.name}</Text>
                  <Text style={styles.switcherRowSub} numberOfLines={1}>{sub}</Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable style={styles.switcherAddBtn} onPress={onAddNew}>
            <Text style={styles.switcherAddLabel}>+ Add Portfolio</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const STATS_ROWS: { key: keyof PerformanceStats; label: string; suffix: string; portfolioOnly?: boolean }[] = [
  { key: 'sharpe', label: 'Sharpe Ratio', suffix: '' },
  { key: 'volatility', label: 'Volatility', suffix: '%' },
  { key: 'maxDrawdown', label: 'Max Drawdown', suffix: '%' },
  { key: 'alpha', label: 'Alpha', suffix: '%', portfolioOnly: true },
  { key: 'beta', label: 'Beta', suffix: '', portfolioOnly: true },
  { key: 'correlation', label: 'Correlation', suffix: '', portfolioOnly: true },
];

function formatStat(value: number | null, suffix: string): string {
  return value !== null ? `${value.toFixed(2)}${suffix}` : 'N/A';
}

function StatsTable({ portfolio, benchmark }: { portfolio: PerformanceStats; benchmark: PerformanceStats }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.statsTable}>
      <View style={styles.statsHeaderRow}>
        <Text style={[styles.statsHeaderCell, styles.statsMetricCol]}>Metric</Text>
        <Text style={[styles.statsHeaderCell, styles.statsValueCol]}>Portfolio</Text>
        <Text style={[styles.statsHeaderCell, styles.statsValueCol]}>Bench.</Text>
      </View>
      {STATS_ROWS.map((row) => (
        <View key={row.key} style={styles.statsRow}>
          <Text style={[styles.statsLabel, styles.statsMetricCol]}>{row.label}</Text>
          <Text style={[styles.statsPortfolioValue, styles.statsValueCol]}>
            {formatStat(portfolio[row.key], row.suffix)}
          </Text>
          <Text style={[styles.statsBenchValue, styles.statsValueCol]}>
            {row.portfolioOnly ? '—' : formatStat(benchmark[row.key], row.suffix)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Overview() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [showPortfolio, setShowPortfolio] = useState(true);
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: portfolios = [], isPending } = useQuery({
    queryKey: ['portfolios', 'user'],
    queryFn: () => listPortfolios('user'),
  });

  useEffect(() => {
    if (portfolios.length > 0 && !activeId) {
      setActiveId(portfolios[0].id);
    }
  }, [portfolios, activeId]);

  const active = portfolios.find((p) => p.id === activeId) ?? portfolios[0] ?? null;

  const {
    data: detail,
    isPending: isDetailPending,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['portfolioPerformance', active?.id, period],
    queryFn: () => getPortfolioPerformance(active!.id, period),
    enabled: active !== null,
  });
  const unavailableTickers = detail
    ? Array.from(
        new Set([
          ...detail.portfolio.dataFreshness.unavailableTickers,
          ...detail.benchmark.dataFreshness.unavailableTickers,
        ])
      )
    : [];
  const isStale = detail
    ? detail.portfolio.dataFreshness.stale || detail.benchmark.dataFreshness.stale
    : false;
  const lastAsOfDate = detail?.portfolio.series.points[detail.portfolio.series.points.length - 1]?.date;
  const portfolioValues = detail?.portfolio.series.points.map((p) => p.value) ?? [];
  const benchmarkValues = detail?.benchmark.series.points.map((p) => p.value) ?? [];
  const portfolioScrubIndex =
    scrubFraction !== null && portfolioValues.length > 0
      ? nearestIndexForX(scrubFraction, portfolioValues.length, 1)
      : null;
  const benchmarkScrubIndex =
    scrubFraction !== null && benchmarkValues.length > 0
      ? nearestIndexForX(scrubFraction, benchmarkValues.length, 1)
      : null;
  const headlineReturn =
    portfolioScrubIndex !== null ? percentChangeAt(portfolioValues, portfolioScrubIndex) : detail?.portfolio.stats.return ?? 0;
  const headlineBenchReturn =
    benchmarkScrubIndex !== null
      ? percentChangeAt(benchmarkValues, benchmarkScrubIndex)
      : detail?.benchmark.stats.return ?? 0;
  const headlineDateLabel =
    portfolioScrubIndex !== null ? detail?.portfolio.series.points[portfolioScrubIndex]?.date : null;
  const { data: activeProvider, isPending: isProviderPending } = useQuery({
    queryKey: ['activeProvider'],
    queryFn: getActiveProvider,
  });

  if (isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (portfolios.length === 0) {
    return (
      <EmptyState
        title="No portfolios yet"
        message="Add your first portfolio to start tracking performance and holdings."
        ctaLabel="+ Add Portfolio"
        onPressCta={() => router.push('/add-portfolio')}
      />
    );
  }

  if (!isProviderPending && !activeProvider) {
    return (
      <EmptyState
        title="No market data provider"
        message="Add an API key in Settings to see performance, returns, and chart data."
        ctaLabel="Go to Settings"
        onPressCta={() => router.push('/account')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.eyebrow}>Portfolio</Text>
        <Pressable style={styles.namePressable} onPress={() => setShowSwitcher(true)}>
          <Text style={styles.portfolioName}>{active?.name ?? ''}</Text>
          <ChevronDownIcon color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Disable vertical scroll while scrubbing the chart: otherwise a slightly
          diagonal drag lets the ScrollView claim the gesture and terminate the
          chart's touch responder, snapping the crosshair back to its rightmost
          resting position. (CompareChart hides this by drawing no resting crosshair.) */}
      <ScrollView contentContainerStyle={styles.scrollContent} scrollEnabled={scrubFraction === null}>
        {detail ? (
          <View style={styles.headline}>
            <Text style={styles.returnValue}>
              {headlineReturn >= 0 ? '+' : ''}
              {headlineReturn.toFixed(2)}%
            </Text>
            <Text style={styles.returnSubtitle}>
              vs {detail.benchmark.portfolio.name}{' '}
              <Text style={styles.returnSubtitleValue}>
                {headlineBenchReturn >= 0 ? '+' : ''}
                {headlineBenchReturn.toFixed(2)}%
              </Text>{' '}
              · {headlineDateLabel ?? period}
            </Text>
          </View>
        ) : null}

        <PeriodPills active={period} onSelect={setPeriod} />

        {isDetailPending ? (
          <View style={styles.chartLoading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : detail ? (
          <View style={styles.chartSection}>
            <PerformanceChart
              series={detail.portfolio.series}
              benchmarkSeries={detail.benchmark.series}
              lineColor={colors.accent}
              showSeries={showPortfolio}
              showBenchmark={showBenchmark}
              onScrubChange={setScrubFraction}
            />
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.toggleChip, { borderColor: colors.accent, opacity: showPortfolio ? 1 : 0.4 }]}
                onPress={() => setShowPortfolio((v) => !v)}
              >
                <View style={[styles.toggleDot, { backgroundColor: colors.accent }]} />
                <Text style={styles.toggleLabel}>{active?.name}</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleChip, { borderColor: colors.textMuted, opacity: showBenchmark ? 1 : 0.4 }]}
                onPress={() => setShowBenchmark((v) => !v)}
              >
                <View style={[styles.toggleDash, { backgroundColor: colors.textSecondary }]} />
                <Text style={styles.toggleLabel}>{detail.benchmark.portfolio.name}</Text>
              </Pressable>
            </View>
            {detail.portfolio.series.truncatedFrom ? (
              <Text style={styles.truncationNote}>Data from {detail.portfolio.series.truncatedFrom}</Text>
            ) : null}
            {unavailableTickers.length > 0 ? (
              <View style={styles.retryRow}>
                <Text style={styles.retryText}>
                  Couldn't load prices for {unavailableTickers.join(', ')}
                </Text>
                <Pressable onPress={() => refetchDetail()} hitSlop={8}>
                  <Text style={styles.retryLink}>Retry</Text>
                </Pressable>
              </View>
            ) : isStale ? (
              <Text style={styles.truncationNote}>
                {lastAsOfDate ? `Prices as of ${lastAsOfDate} · couldn't refresh` : "Couldn't refresh prices"}
              </Text>
            ) : null}
          </View>
        ) : null}

        {detail ? (
          <>
            <Text style={styles.sectionLabel}>Statistics</Text>
            <StatsTable portfolio={detail.portfolio.stats} benchmark={detail.benchmark.stats} />
          </>
        ) : null}

        <Text style={styles.holdingsSectionLabel}>Holdings</Text>
        {active?.holdings.map((h) => (
          <HoldingItem key={h.ticker} holding={h} />
        ))}
      </ScrollView>

      {showSwitcher && (
        <PortfolioSwitcher
          portfolios={portfolios}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            queryClient.invalidateQueries({ queryKey: ['portfolioPerformance'] });
          }}
          onClose={() => setShowSwitcher(false)}
          onAddNew={() => {
            setShowSwitcher(false);
            router.push('/add-portfolio');
          }}
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
    namePressable: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 3,
      alignSelf: 'flex-start',
    },
    portfolioName: {
      fontSize: 19,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    headline: {
      paddingHorizontal: 18,
      paddingTop: 4,
    },
    returnValue: {
      fontSize: 42,
      fontWeight: '500',
      color: colors.textPrimary,
      lineHeight: 46,
    },
    returnSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 8,
    },
    returnSubtitleValue: {
      color: colors.accentSoft,
    },
    chartLoading: {
      height: 130,
      marginHorizontal: 18,
      marginTop: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartSection: {
      paddingHorizontal: 18,
      marginTop: 16,
    },
    toggleRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    toggleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 20,
      borderWidth: 1,
    },
    toggleDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    toggleDash: {
      width: 8,
      height: 1.5,
    },
    toggleLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    truncationNote: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 8,
    },
    retryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    retryText: {
      fontSize: 11,
      color: colors.negative,
      flex: 1,
      marginRight: 8,
    },
    retryLink: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.accent,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '500',
      letterSpacing: 0.26,
      color: colors.textSecondary,
      marginTop: 22,
      marginBottom: 10,
      marginHorizontal: 18,
    },
    statsTable: {
      marginHorizontal: 18,
    },
    statsHeaderRow: {
      flexDirection: 'row',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderStrong,
    },
    statsRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: '#21232f',
    },
    statsHeaderCell: {
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    statsMetricCol: {
      flex: 1,
    },
    statsValueCol: {
      width: 70,
      textAlign: 'right',
    },
    statsLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    statsPortfolioValue: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    statsBenchValue: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    holdingsSectionLabel: {
      fontSize: 13,
      fontWeight: '500',
      letterSpacing: 0.26,
      color: colors.textSecondary,
      marginTop: 22,
      marginBottom: 10,
      marginHorizontal: 18,
    },
    holdingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
      marginHorizontal: 18,
    },
    tickerBadge: {
      width: 42,
      height: 26,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    tickerBadgeText: {
      fontSize: 10.5,
      fontWeight: '500',
      color: colors.accentSoft,
    },
    holdingMeta: {
      flex: 1,
      minWidth: 0,
    },
    holdingName: {
      fontSize: 13,
      color: colors.textPrimary,
    },
    weightBarTrack: {
      height: 3,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 2,
      marginTop: 6,
      overflow: 'hidden',
    },
    weightBarFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: 2,
      backgroundColor: colors.accent,
    },
    holdingWeight: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textPrimary,
      flexShrink: 0,
    },
    // Switcher modal
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(10,11,18,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 18,
      paddingBottom: 18,
      paddingTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -12 },
      shadowOpacity: 0.4,
      shadowRadius: 32,
      elevation: 24,
    },
    dragHandle: {
      width: 32,
      height: 3,
      backgroundColor: colors.borderStrong,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 14,
    },
    switcherTitle: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    switcherRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    radioDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDotFill: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    switcherRowMeta: {
      flex: 1,
      minWidth: 0,
    },
    switcherRowName: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    switcherRowSub: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    switcherAddBtn: {
      width: '100%',
      marginTop: 12,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderStrong,
      alignItems: 'center',
    },
    switcherAddLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
    },
  });
