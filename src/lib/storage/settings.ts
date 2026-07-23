import * as SecureStore from 'expo-secure-store';

export type ProviderId = 'tiingo' | 'financialModelingPrep';

const ACTIVE_PROVIDER_KEY = 'fiducia.activeProvider';
const apiKeyStorageKey = (providerId: ProviderId) => `fiducia.apiKey.${providerId}`;

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
