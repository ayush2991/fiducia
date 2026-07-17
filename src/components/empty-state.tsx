import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyPortfoliosIcon } from '@/components/icons';
import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type EmptyStateProps = {
  title: string;
  message: string;
  ctaLabel?: string;
  onPressCta?: () => void;
};

export function EmptyState({ title, message, ctaLabel, onPressCta }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <EmptyPortfoliosIcon borderColor={colors.borderStrong} plusColor={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {ctaLabel ? (
        <Pressable style={styles.cta} onPress={onPressCta}>
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 36,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 17,
      fontWeight: '500',
      color: colors.textPrimary,
      marginTop: 18,
      marginBottom: 8,
      textAlign: 'center',
    },
    message: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19.5,
      marginBottom: 22,
    },
    cta: {
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: 'transparent',
      paddingVertical: 11,
      paddingHorizontal: 22,
      borderRadius: 10,
    },
    ctaLabel: {
      color: colors.accent,
      fontSize: 13.5,
      fontWeight: '600',
    },
  });
