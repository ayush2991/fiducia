import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { seedDevProviderFromEnv } from '@/lib/api/settings';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 60 * 1000, // 1 hour — daily-close data doesn't change intraday, don't refetch on every tab switch
    },
  },
});

function AppShell() {
  const { themeName } = useTheme();

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-portfolio" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-portfolio" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-ticker" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style={themeName === 'daybreak' ? 'dark' : 'light'} />
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    seedDevProviderFromEnv();
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
