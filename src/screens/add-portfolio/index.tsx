import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BackIcon } from '@/components/icons';
import { colors } from '@/theme/colors';

export function AddPortfolio() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <BackIcon color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.title}>New Portfolio</Text>
        <View style={styles.spacer} />
      </View>
      <View style={styles.body}>
        <Text style={styles.message}>Portfolio creation is coming soon.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  spacer: {
    width: 14,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19.5,
  },
});
