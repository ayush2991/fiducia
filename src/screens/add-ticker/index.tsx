import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackIcon } from '@/components/icons';
import { addWatchlistTicker } from '@/lib/api/watchlist';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export function AddTicker() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [ticker, setTicker] = useState('');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => addWatchlistTicker(ticker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      router.back();
    },
  });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <BackIcon color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.title}>Add to Watchlist</Text>
        <View style={styles.spacer} />
      </View>
      <View style={styles.body}>
        <TextInput
          style={styles.input}
          placeholder="Ticker symbol (e.g. AAPL)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          value={ticker}
          onChangeText={setTicker}
        />
        {mutation.isError ? <Text style={styles.error}>{(mutation.error as Error).message}</Text> : null}
        <Pressable
          style={[styles.submit, !ticker.trim() && styles.submitDisabled]}
          disabled={!ticker.trim() || mutation.isPending}
          onPress={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.submitLabel}>Add</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
    },
    title: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
    spacer: { width: 14 },
    body: { padding: 18, gap: 14 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.textPrimary,
      fontSize: 14,
      backgroundColor: colors.surface,
    },
    error: { color: colors.negative, fontSize: 12 },
    submit: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
    },
    submitDisabled: { opacity: 0.5 },
    submitLabel: { color: colors.background, fontSize: 14, fontWeight: '600' },
  });
