import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';

import { ThemeProvider } from '@/theme/ThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 60 * 1000, // 1 hour — daily-close data doesn't change intraday, don't refetch on every tab switch
    },
  },
});

export default function RootLayout() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-portfolio" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-ticker" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="light" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
