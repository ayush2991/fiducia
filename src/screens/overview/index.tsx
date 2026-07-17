import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
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

import { EmptyState } from '@/components/empty-state';
import { ChevronDownIcon } from '@/components/icons';
import { listPortfolios } from '@/lib/api/portfolios';
import type { Holding, Portfolio } from '@/lib/api/types';
import { colors } from '@/theme/colors';

function HoldingItem({ holding }: { holding: Holding }) {
  return (
    <View style={styles.holdingRow}>
      <View style={styles.tickerBadge}>
        <Text style={styles.tickerBadgeText}>{holding.ticker}</Text>
      </View>
      <View style={styles.holdingMeta}>
        <Text style={styles.holdingName} numberOfLines={1}>
          {holding.ticker}
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
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
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

export function Overview() {
  const insets = useSafeAreaInsets();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);

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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.eyebrow}>Portfolio</Text>
        <Pressable style={styles.namePressable} onPress={() => setShowSwitcher(true)}>
          <Text style={styles.portfolioName}>{active?.name ?? ''}</Text>
          <ChevronDownIcon color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.holdingsSectionLabel}>Holdings</Text>
        {active?.holdings.map((h) => (
          <HoldingItem key={h.ticker} holding={h} />
        ))}
      </ScrollView>

      {showSwitcher && (
        <PortfolioSwitcher
          portfolios={portfolios}
          activeId={activeId}
          onSelect={setActiveId}
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
    paddingHorizontal: 18,
    paddingBottom: 32,
  },
  holdingsSectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.26,
    color: colors.textSecondary,
    marginTop: 20,
    marginBottom: 10,
  },
  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
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
