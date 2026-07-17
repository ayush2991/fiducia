import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlusIcon } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { PeriodPills } from '@/components/period-pills';
import { WatchlistRow } from '@/components/watchlist-row';
import { listWatchlist, removeWatchlistTicker } from '@/lib/api/watchlist';
import { DEFAULT_PERIOD, type PeriodKey } from '@/lib/api/types';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export function Watchlist() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ['watchlist', period],
    queryFn: () => listWatchlist(period),
  });
  const removeMutation = useMutation({
    mutationFn: (ticker: string) => removeWatchlistTicker(ticker),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  });
  const items = data?.items ?? [];
  const insets = useSafeAreaInsets();

  function confirmRemove(ticker: string) {
    Alert.alert(`Remove ${ticker}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(ticker) },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.eyebrow}>Markets</Text>
          <Text style={styles.title}>Watchlist</Text>
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/add-ticker')} hitSlop={8}>
          <PlusIcon color={colors.textPrimary} />
        </Pressable>
      </View>
      {!isPending && items.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          message="Track tickers here without adding them to a portfolio."
        />
      ) : (
        <>
          <PeriodPills active={period} onSelect={setPeriod} />
          <FlatList
            data={items}
            keyExtractor={(item) => item.ticker}
            renderItem={({ item }) => (
              <WatchlistRow
                item={item}
                benchmarkSeries={data?.benchmarkSeries}
                isOpen={expandedTicker === item.ticker}
                onToggle={() => setExpandedTicker((cur) => (cur === item.ticker ? null : item.ticker))}
                onLongPress={() => confirmRemove(item.ticker)}
              />
            )}
            contentContainerStyle={styles.list}
          />
        </>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
    },
    eyebrow: {
      fontSize: 10,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: colors.accent,
      fontWeight: '500',
    },
    title: {
      fontSize: 20,
      fontWeight: '500',
      color: colors.textPrimary,
      marginTop: 3,
    },
    addButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: {
      marginTop: 8,
      paddingBottom: 24,
    },
  });
