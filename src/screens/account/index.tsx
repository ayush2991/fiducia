import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronRightIcon } from '@/components/icons';
import {
  activateStoredProviderKey,
  clearProviderKey,
  getActiveProvider,
  hasStoredKey,
  listProviders,
  saveAndActivateProviderKey,
} from '@/lib/api/settings';
import type { ProviderId, ProviderMetadata } from '@/lib/api/providers/types';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function ProviderRow({
  provider,
  isActive,
  hasKey,
  isExpanded,
  onToggle,
}: {
  provider: ProviderMetadata;
  isActive: boolean;
  hasKey: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [keyInput, setKeyInput] = useState('');
  const [showKeyForm, setShowKeyForm] = useState(false);
  const queryClient = useQueryClient();

  const invalidateProviderQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['settingsProviders'] });
    queryClient.invalidateQueries({ queryKey: ['activeProvider'] });
  };

  const saveMutation = useMutation({
    mutationFn: (key: string) => saveAndActivateProviderKey(provider.id, key),
    onSuccess: () => {
      invalidateProviderQueries();
      setKeyInput('');
      setShowKeyForm(false);
      onToggle();
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => activateStoredProviderKey(provider.id),
    onSuccess: () => {
      invalidateProviderQueries();
      onToggle();
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearProviderKey(provider.id),
    onSuccess: invalidateProviderQueries,
  });

  const offerQuickActivate = hasKey && !isActive && !showKeyForm;

  return (
    <View>
      <Pressable style={styles.row} onPress={onToggle}>
        <View style={styles.iconChip}>
          <View style={[styles.radioDot, { borderColor: isActive ? colors.accent : colors.borderStrong }]}>
            {isActive && <View style={styles.radioDotFill} />}
          </View>
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.rowLabel}>{provider.label}</Text>
          <Text style={styles.rowSub}>
            {isActive ? 'Active' : hasKey ? 'Key saved' : 'Not configured'}
          </Text>
        </View>
        <ChevronRightIcon color={colors.textMuted} />
      </Pressable>
      {isExpanded && (
        <View style={styles.expanded}>
          {offerQuickActivate ? (
            <>
              {activateMutation.isError ? (
                <Text style={styles.error}>{(activateMutation.error as Error).message}</Text>
              ) : null}
              <Pressable
                style={styles.saveBtn}
                disabled={activateMutation.isPending}
                onPress={() => activateMutation.mutate()}
              >
                {activateMutation.isPending ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.saveBtnLabel}>Activate</Text>
                )}
              </Pressable>
              <Pressable style={styles.clearBtn} onPress={() => setShowKeyForm(true)}>
                <Text style={styles.clearBtnLabel}>Use a different key</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Paste API key"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={keyInput}
                onChangeText={setKeyInput}
              />
              {saveMutation.isError ? (
                <Text style={styles.error}>{(saveMutation.error as Error).message}</Text>
              ) : null}
              <Pressable
                style={[styles.saveBtn, !keyInput.trim() && styles.saveBtnDisabled]}
                disabled={!keyInput.trim() || saveMutation.isPending}
                onPress={() => saveMutation.mutate(keyInput.trim())}
              >
                {saveMutation.isPending ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.saveBtnLabel}>Save & Activate</Text>
                )}
              </Pressable>
              {hasKey && !isActive ? (
                <Pressable style={styles.clearBtn} onPress={() => clearMutation.mutate()}>
                  <Text style={styles.clearBtnLabel}>Remove saved key</Text>
                </Pressable>
              ) : null}
            </>
          )}
          <Pressable onPress={() => Linking.openURL(provider.signupUrl)}>
            <Text style={styles.signupLink}>Get a free API key →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function Account() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expandedId, setExpandedId] = useState<ProviderId | null>(null);

  const providers = listProviders();

  const { data: activeProvider } = useQuery({
    queryKey: ['activeProvider'],
    queryFn: getActiveProvider,
  });

  const { data: keyStatus = {} as Record<ProviderId, boolean> } = useQuery({
    queryKey: ['settingsProviders'],
    queryFn: async () => {
      const entries = await Promise.all(providers.map(async (p) => [p.id, await hasStoredKey(p.id)] as const));
      return Object.fromEntries(entries) as Record<ProviderId, boolean>;
    },
  });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.eyebrow}>Account</Text>
        <Text style={styles.title}>Market Data Provider</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.sectionLabel}>Provider</Text>
        <Text style={styles.sectionHint}>
          Pick one provider and add your own free API key. Only one provider is active at a time.
        </Text>
        {providers.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            isActive={activeProvider === provider.id}
            hasKey={keyStatus[provider.id] ?? false}
            isExpanded={expandedId === provider.id}
            onToggle={() => setExpandedId((cur) => (cur === provider.id ? null : provider.id))}
          />
        ))}
      </View>
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
    body: {
      paddingHorizontal: 18,
      paddingTop: 20,
    },
    sectionLabel: {
      fontSize: 11,
      letterSpacing: 0.66,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginBottom: 6,
    },
    sectionHint: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    iconChip: {
      width: 28,
      height: 28,
      borderRadius: 7,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    radioDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDotFill: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    rowMeta: {
      flex: 1,
      minWidth: 0,
    },
    rowLabel: {
      fontSize: 13.5,
      color: colors.textPrimary,
    },
    rowSub: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    expanded: {
      paddingVertical: 14,
      paddingHorizontal: 4,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.textPrimary,
      fontSize: 14,
      backgroundColor: colors.surface,
    },
    error: {
      color: colors.negative,
      fontSize: 12,
    },
    saveBtn: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
    },
    saveBtnDisabled: {
      opacity: 0.5,
    },
    saveBtnLabel: {
      color: colors.background,
      fontSize: 14,
      fontWeight: '600',
    },
    clearBtn: {
      alignItems: 'center',
      paddingVertical: 6,
    },
    clearBtnLabel: {
      color: colors.negative,
      fontSize: 12.5,
    },
    signupLink: {
      color: colors.accentSoft,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 2,
    },
  });
