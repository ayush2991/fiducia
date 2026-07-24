import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming?: boolean;
};

// Absolutely-positioned overlay meant to sit on top of an already-visible
// sheet/screen (see docs/mock-reference.html turn 5a) rather than a separate
// RN <Modal> — the caller decides what it overlays.
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  isConfirming = false,
}: ConfirmDialogProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={isConfirming}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.confirmBtn} onPress={onConfirm} disabled={isConfirming}>
            <Text style={styles.confirmLabel}>{isConfirming ? '…' : confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      borderRadius: 16,
    },
    card: {
      width: '100%',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 16,
      padding: 20,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    message: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
      marginBottom: 18,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelLabel: {
      fontSize: 13.5,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: colors.negative,
      backgroundColor: colors.negative,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmLabel: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.background,
    },
  });
