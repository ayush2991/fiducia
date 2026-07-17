import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';

import { AccountIcon, CompareIcon, OverviewIcon, WatchlistIcon } from '@/components/icons';
import { TabBarButton, TabBarContainer } from '@/components/tab-bar';
import { colors } from '@/theme/colors';

export default function TabLayout() {
  return (
    <Tabs style={{ flex: 1, backgroundColor: colors.background }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <TabBarContainer>
          <TabTrigger name="index" href="/" asChild>
            <TabBarButton label="Overview" renderIcon={(color) => <OverviewIcon color={color} />} />
          </TabTrigger>
          <TabTrigger name="compare" href="/compare" asChild>
            <TabBarButton label="Compare" renderIcon={(color) => <CompareIcon color={color} />} />
          </TabTrigger>
          <TabTrigger name="watchlist" href="/watchlist" asChild>
            <TabBarButton label="Watchlist" renderIcon={(color) => <WatchlistIcon color={color} />} />
          </TabTrigger>
          <TabTrigger name="account" href="/account" asChild>
            <TabBarButton label="Account" renderIcon={(color) => <AccountIcon color={color} />} />
          </TabTrigger>
        </TabBarContainer>
      </TabList>
    </Tabs>
  );
}
