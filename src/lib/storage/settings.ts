// expo-secure-store is the app's local key/value store for BYOK provider
// credentials — and, pragmatically, for the theme preference below too:
// it's a single small string with no separate justification for its own
// storage tier, so it reuses this module rather than introducing one.
import * as SecureStore from 'expo-secure-store';

export type ProviderId = 'tiingo' | 'financialModelingPrep';
export type ThemePreference = 'light' | 'dark' | 'system';

const ACTIVE_PROVIDER_KEY = 'fiducia.activeProvider';
const apiKeyStorageKey = (providerId: ProviderId) => `fiducia.apiKey.${providerId}`;
const THEME_PREFERENCE_KEY = 'fiducia.themePreference';

export async function getActiveProviderId(): Promise<ProviderId | null> {
  return (await SecureStore.getItemAsync(ACTIVE_PROVIDER_KEY)) as ProviderId | null;
}

export async function setActiveProviderId(providerId: ProviderId): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_PROVIDER_KEY, providerId);
}

export async function clearActiveProviderId(): Promise<void> {
  await SecureStore.deleteItemAsync(ACTIVE_PROVIDER_KEY);
}

export async function getStoredApiKey(providerId: ProviderId): Promise<string | null> {
  return SecureStore.getItemAsync(apiKeyStorageKey(providerId));
}

export async function setStoredApiKey(providerId: ProviderId, key: string): Promise<void> {
  await SecureStore.setItemAsync(apiKeyStorageKey(providerId), key);
}

export async function clearStoredApiKey(providerId: ProviderId): Promise<void> {
  await SecureStore.deleteItemAsync(apiKeyStorageKey(providerId));
}

export async function getThemePreference(): Promise<ThemePreference | null> {
  return (await SecureStore.getItemAsync(THEME_PREFERENCE_KEY)) as ThemePreference | null;
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  await SecureStore.setItemAsync(THEME_PREFERENCE_KEY, preference);
}

export async function clearThemePreference(): Promise<void> {
  await SecureStore.deleteItemAsync(THEME_PREFERENCE_KEY);
}
