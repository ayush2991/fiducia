import { router } from 'expo-router';

import { EmptyState } from '@/components/empty-state';

// The mock only specifies an empty state for Overview; this reuses that
// pattern since Compare is equally empty with zero portfolios.
export function Compare() {
  return (
    <EmptyState
      title="Nothing to compare yet"
      message="Add at least one portfolio to overlay its performance against benchmarks or other portfolios."
      ctaLabel="+ Add Portfolio"
      onPressCta={() => router.push('/add-portfolio')}
    />
  );
}
