import { router } from 'expo-router';

import { EmptyState } from '@/components/empty-state';

export function Overview() {
  return (
    <EmptyState
      title="No portfolios yet"
      message="Add your first portfolio to start tracking performance and holdings."
      ctaLabel="+ Add Portfolio"
      onPressCta={() => router.push('/add-portfolio')}
    />
  );
}
