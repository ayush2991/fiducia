import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { PERIODS, type PeriodKey } from '@/lib/api/types';
import { useTheme } from '@/theme/ThemeProvider';

type PeriodPillsProps = {
  active: PeriodKey;
  onSelect: (period: PeriodKey) => void;
};

const DIVIDER = 'rgba(233,233,237,.16)';

export function PeriodPills({ active, onSelect }: PeriodPillsProps) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {PERIODS.map((period) => {
        const isActive = period === active;
        return (
          <TouchableOpacity
            key={period}
            onPress={() => onSelect(period)}
            style={[styles.pill, { borderColor: isActive ? colors.accent : DIVIDER }]}
          >
            <Text style={[styles.label, { color: isActive ? colors.accent : colors.textPrimary }]}>
              {period}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
