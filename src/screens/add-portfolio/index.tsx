import { useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseIcon } from '@/components/icons';
import { createPortfolio, getLatestPrice } from '@/lib/api/portfolios';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type EntryMode = 'alloc' | 'raw' | 'shares' | 'dollar';

interface HoldingRow {
  id: string;
  ticker: string;
  value: string;
  validationState: 'idle' | 'pending' | 'valid' | 'invalid';
  error?: string;
  price?: number;
}

const MODE_LABELS: Record<EntryMode, string> = {
  alloc: 'Allocation %',
  raw: 'Raw Weights',
  shares: 'Share Count',
  dollar: 'Dollar ($)',
};

const MODE_HINTS: Record<EntryMode, string> = {
  alloc: 'Enter the percentage each holding represents. Total should be close to 100%.',
  raw: 'Enter any relative numbers — they\'ll be normalized to 100% on save.',
  shares: 'Enter how many shares you own. Current prices will compute allocations.',
  dollar: 'Enter the dollar amount invested in each holding.',
};

const MODE_UNIT: Record<EntryMode, string> = {
  alloc: '%',
  raw: 'Weight',
  shares: 'Shares',
  dollar: '$',
};

let nextId = 1;
function makeRow(): HoldingRow {
  return { id: String(nextId++), ticker: '', value: '', validationState: 'idle' };
}

function computePcts(rows: HoldingRow[], mode: EntryMode): number[] {
  const vals = rows.map((r) => parseFloat(r.value) || 0);
  switch (mode) {
    case 'alloc':
      return vals;
    case 'raw': {
      const total = vals.reduce((s, v) => s + v, 0);
      return total === 0 ? vals.map(() => 0) : vals.map((v) => (v / total) * 100);
    }
    case 'shares': {
      const dollars = rows.map((r, i) => vals[i] * (r.price ?? 0));
      const total = dollars.reduce((s, v) => s + v, 0);
      return total === 0 ? dollars.map(() => 0) : dollars.map((v) => (v / total) * 100);
    }
    case 'dollar': {
      const total = vals.reduce((s, v) => s + v, 0);
      return total === 0 ? vals.map(() => 0) : vals.map((v) => (v / total) * 100);
    }
  }
}

// Reuses the already-computed per-row percentages so the footer can never disagree
// with what's shown per row (e.g. Raw Weights sums to 0% when every row is empty,
// not a hardcoded 100%).
function computeTotalStr(rows: HoldingRow[], mode: EntryMode, pcts: number[]): string {
  switch (mode) {
    case 'alloc': {
      const sum = rows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0);
      return `${sum.toFixed(1)}%`;
    }
    case 'raw': {
      const sum = pcts.reduce((s, p) => s + p, 0);
      return `${sum.toFixed(1)}%`;
    }
    case 'shares': {
      const sum = rows.reduce((s, r) => s + (parseFloat(r.value) || 0) * (r.price ?? 0), 0);
      return `$${sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    case 'dollar': {
      const sum = rows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0);
      return `$${sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }
}

export function AddPortfolio() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<EntryMode>('alloc');
  const [rows, setRows] = useState<HoldingRow[]>([makeRow()]);
  // Track the latest validation calls so stale async results from fast edits are ignored.
  const validationSeq = useRef<Record<string, number>>({});

  function updateRow(id: string, patch: Partial<HoldingRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Row values are entered under one mode's unit (%, raw weight, shares, dollars) —
  // switching modes without clearing them would silently reinterpret the same number
  // under a different unit (e.g. "50" meaning 50% becomes 50 shares).
  function changeMode(next: EntryMode) {
    setMode(next);
    setRows((prev) => prev.map((r) => ({ ...r, value: '' })));
  }

  async function validateTicker(rowId: string, rawTicker: string) {
    const ticker = rawTicker.trim().toUpperCase();
    if (!ticker) {
      updateRow(rowId, { validationState: 'idle', error: undefined, price: undefined });
      return;
    }
    const seq = (validationSeq.current[rowId] ?? 0) + 1;
    validationSeq.current[rowId] = seq;

    updateRow(rowId, { ticker, validationState: 'pending', error: undefined });
    try {
      const price = await getLatestPrice(ticker);
      if (validationSeq.current[rowId] !== seq) return; // superseded
      updateRow(rowId, { validationState: 'valid', price, error: undefined });
    } catch (err) {
      if (validationSeq.current[rowId] !== seq) return;
      const message = err instanceof Error ? err.message : 'Unknown ticker';
      updateRow(rowId, { validationState: 'invalid', price: undefined, error: message });
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rawHoldings = rows
        .filter((r) => r.validationState === 'valid' && (parseFloat(r.value) || 0) > 0)
        .map((r) => {
          const val = parseFloat(r.value);
          const weight = mode === 'shares' ? val * (r.price ?? 0) : val;
          return { ticker: r.ticker, weight };
        });
      return createPortfolio(name.trim(), 'user', rawHoldings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['compare'] });
      queryClient.invalidateQueries({ queryKey: ['portfolioPerformance'] });
      router.back();
    },
  });

  const pcts = computePcts(rows, mode);
  const totalStr = computeTotalStr(rows, mode, pcts);
  const allocTotal = rows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0);
  const totalIsOff = mode === 'alloc' && (allocTotal < 95 || allocTotal > 105);

  const rowsWithTicker = rows.filter((r) => r.ticker.trim() !== '');
  const isSaveDisabled =
    saveMutation.isPending ||
    name.trim() === '' ||
    rowsWithTicker.length === 0 ||
    rowsWithTicker.some((r) => r.validationState !== 'valid') ||
    !rowsWithTicker.some((r) => r.validationState === 'valid' && (parseFloat(r.value) || 0) > 0);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Portfolio</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Portfolio Name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Portfolio Name</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Core Growth"
            placeholderTextColor={colors.textMuted}
            returnKeyType="next"
          />
        </View>

        {/* Entry Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>How would you like to enter holdings?</Text>
          <View style={styles.modeBtns}>
            {(Object.keys(MODE_LABELS) as EntryMode[]).map((m) => (
              <Pressable
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                onPress={() => changeMode(m)}
              >
                <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                  {MODE_LABELS[m]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.modeHint}>{MODE_HINTS[mode]}</Text>
        </View>

        {/* Holdings Table */}
        <View style={styles.section}>
          {/* Column headers */}
          <View style={styles.colHeaders}>
            <Text style={[styles.colHeader, { width: 72 }]}>Ticker</Text>
            <Text style={[styles.colHeader, { flex: 1, textAlign: 'right' }]}>{MODE_UNIT[mode]}</Text>
            <Text style={[styles.colHeader, { width: 50, textAlign: 'right' }]}>Alloc</Text>
            <View style={{ width: 32 }} />
          </View>

          {rows.map((row, idx) => (
            <View key={row.id}>
              <View style={styles.holdingRow}>
                <TextInput
                  style={[
                    styles.tickerInput,
                    row.validationState === 'invalid' && styles.inputError,
                  ]}
                  value={row.ticker}
                  onChangeText={(t) => updateRow(row.id, { ticker: t.toUpperCase(), validationState: 'idle', error: undefined, price: undefined })}
                  onBlur={() => validateTicker(row.id, row.ticker)}
                  placeholder="TICKER"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="next"
                />
                <TextInput
                  style={styles.valueInput}
                  value={row.value}
                  onChangeText={(v) => updateRow(row.id, { value: v })}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  textAlign="right"
                />
                <Text style={styles.pctLabel}>
                  {row.validationState === 'pending'
                    ? '…'
                    : (pcts[idx] > 0 ? pcts[idx].toFixed(1) : '0.0') + '%'}
                </Text>
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  hitSlop={8}
                >
                  <CloseIcon color={colors.textMuted} />
                </Pressable>
              </View>
              {row.error ? <Text style={styles.rowError}>{row.error}</Text> : null}
            </View>
          ))}

          <Pressable style={styles.addRowBtn} onPress={() => setRows((prev) => [...prev, makeRow()])}>
            <Text style={styles.addRowLabel}>+ Add Holding</Text>
          </Pressable>
        </View>

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={[styles.totalValue, totalIsOff && styles.totalValueWarn]}>{totalStr}</Text>
        </View>

        {/* Save */}
        <View style={styles.section}>
          <Pressable
            style={[styles.saveBtn, isSaveDisabled && styles.saveBtnDisabled]}
            onPress={() => saveMutation.mutate()}
            disabled={isSaveDisabled}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={[styles.saveBtnText, isSaveDisabled && styles.saveBtnTextDisabled]}>
                Save Portfolio
              </Text>
            )}
          </Pressable>
          {saveMutation.isError ? (
            <Text style={styles.saveError}>Failed to save — please try again.</Text>
          ) : null}
        </View>

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
      paddingTop: 20,
      paddingBottom: 4,
    },
    backBtn: {
      padding: 4,
    },
    backChevron: {
      fontSize: 26,
      color: colors.textSecondary,
      lineHeight: 28,
    },
    headerTitle: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    headerSpacer: {
      width: 26,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 8,
    },
    section: {
      paddingHorizontal: 18,
      paddingTop: 14,
    },
    sectionLabel: {
      fontSize: 11,
      letterSpacing: 0.66,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    nameInput: {
      width: '100%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      padding: 12,
      paddingHorizontal: 14,
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '500',
    },
    modeBtns: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    modeBtn: {
      paddingVertical: 8,
      paddingHorizontal: 13,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    modeBtnActive: {
      borderColor: colors.accent,
      backgroundColor: 'transparent',
    },
    modeBtnText: {
      fontSize: 12.5,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    modeBtnTextActive: {
      color: colors.accent,
    },
    modeHint: {
      fontSize: 12.5,
      color: colors.textSecondary,
      marginTop: 10,
      lineHeight: 18,
    },
    colHeaders: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingBottom: 8,
    },
    colHeader: {
      fontSize: 10.5,
      letterSpacing: 0.66,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    holdingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    tickerInput: {
      width: 72,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 10,
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '500',
    },
    inputError: {
      borderColor: colors.negative,
    },
    valueInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 10,
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'right',
    },
    pctLabel: {
      width: 50,
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'right',
    },
    removeBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
    },
    rowError: {
      fontSize: 11,
      color: colors.negative,
      paddingHorizontal: 2,
      paddingTop: 4,
      paddingBottom: 2,
    },
    addRowBtn: {
      width: '100%',
      marginTop: 10,
      paddingVertical: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderStrong,
      borderRadius: 8,
      alignItems: 'center',
    },
    addRowLabel: {
      fontSize: 12.5,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    totalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingTop: 16,
    },
    totalLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    totalValue: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    totalValueWarn: {
      color: colors.negative,
    },
    saveBtn: {
      width: '100%',
      paddingVertical: 13,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnDisabled: {
      borderColor: colors.borderStrong,
    },
    saveBtnText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: colors.accent,
    },
    saveBtnTextDisabled: {
      color: colors.textMuted,
    },
    saveError: {
      fontSize: 12,
      color: colors.negative,
      textAlign: 'center',
      marginTop: 8,
    },
  });
