import * as storage from '@/lib/storage/settings';
import type { ThemePreference } from '@/lib/storage/settings';
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

export async function getThemePreference(): Promise<ThemePreference | null> {
  return storage.getThemePreference();
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  await storage.setThemePreference(preference);
}

// Validates the key against the live provider before persisting it or
// activating it — a bad key should never silently become "active".
export async function saveAndActivateProviderKey(providerId: ProviderId, key: string): Promise<void> {
  await PROVIDERS[providerId].validateApiKey(key); // throws with a readable message on failure
  await storage.setStoredApiKey(providerId, key);
  await storage.setActiveProviderId(providerId);
}

// Switches the active provider using a key already saved from a prior
// "Save & Activate" — no re-entry/re-validation needed.
export async function activateStoredProviderKey(providerId: ProviderId): Promise<void> {
  const key = await storage.getStoredApiKey(providerId);
  if (!key) throw new Error('No saved key for this provider');
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

// Dev-only convenience: fills a fresh/cleared install's provider from `.env`
// so simulator testing doesn't depend on typing into the Account tab's
// TextInput, which is unreliable to drive via AppleScript in this environment.
export async function seedDevProviderFromEnv(): Promise<void> {
  if (!__DEV__) return;
  if (await storage.getActiveProviderId()) return;

  const tiingoKey = process.env.EXPO_PUBLIC_TIINGO_API_KEY;
  const fmpKey = process.env.EXPO_PUBLIC_FMP_API_KEY;

  try {
    if (tiingoKey) {
      await saveAndActivateProviderKey('tiingo', tiingoKey);
    } else if (fmpKey) {
      await saveAndActivateProviderKey('financialModelingPrep', fmpKey);
    }
  } catch (error) {
    console.warn('seedDevProviderFromEnv: failed to seed provider from .env', error);
  }
}
