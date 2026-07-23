import * as storage from '@/lib/storage/settings';
import { PROVIDER_METADATA, type ProviderId, type ProviderMetadata } from './providers/types';
import { tiingoProvider } from './providers/tiingo';
import { financialModelingPrepProvider } from './providers/financialModelingPrep';

export const PROVIDERS = {
  tiingo: tiingoProvider,
  financialModelingPrep: financialModelingPrepProvider,
};

export function listProviders(): ProviderMetadata[] {
  return PROVIDER_METADATA;
}

export async function getActiveProvider(): Promise<ProviderId | null> {
  return storage.getActiveProviderId();
}

export async function hasStoredKey(providerId: ProviderId): Promise<boolean> {
  return (await storage.getStoredApiKey(providerId)) !== null;
}

// Validates the key against the live provider before persisting it or
// activating it — a bad key should never silently become "active".
export async function saveAndActivateProviderKey(providerId: ProviderId, key: string): Promise<void> {
  await PROVIDERS[providerId].validateApiKey(key); // throws with a readable message on failure
  await storage.setStoredApiKey(providerId, key);
  await storage.setActiveProviderId(providerId);
}

export async function clearProviderKey(providerId: ProviderId): Promise<void> {
  await storage.clearStoredApiKey(providerId);
  const active = await storage.getActiveProviderId();
  if (active === providerId) {
    await storage.clearActiveProviderId();
  }
}

export async function getActiveProviderAndKey(): Promise<{ providerId: ProviderId; apiKey: string } | null> {
  const providerId = await storage.getActiveProviderId();
  if (!providerId) return null;
  const apiKey = await storage.getStoredApiKey(providerId);
  if (!apiKey) return null;
  return { providerId, apiKey };
}
