import { forwardRef, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type TabBarButtonProps = PressableProps & {
  isFocused?: boolean;
  label: string;
  renderIcon: (color: string) => ReactNode;
};

export const TabBarButton = forwardRef<View, TabBarButtonProps>(
  ({ isFocused, label, renderIcon, style: _style, ...props }, ref) => {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const color = isFocused ? colors.accent : colors.textMuted;
    return (
      <Pressable ref={ref} style={styles.button} {...props}>
        {renderIcon(color)}
        <Text style={[styles.label, { color }]}>{label}</Text>
      </Pressable>
    );
  }
);

export const TabBarContainer = forwardRef<View, ViewProps>(({ style, children, ...props }, ref) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View ref={ref} style={[styles.bar, { paddingBottom: insets.bottom }, style]} {...props}>
      {children}
    </View>
  );
});

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    button: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingTop: 10,
      paddingBottom: 12,
    },
    label: {
      fontSize: 10,
      fontWeight: '500',
    },
  });
