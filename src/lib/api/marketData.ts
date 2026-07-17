import { getActiveProviderAndKey, PROVIDERS } from './settings';
import type { PricePoint } from './providers/types';

export class NoProviderConfiguredError extends Error {
  constructor() {
    super('No market data provider configured. Add an API key in Settings.');
    this.name = 'NoProviderConfiguredError';
  }
}

async function resolveActive(): Promise<{ providerId: keyof typeof PROVIDERS; apiKey: string }> {
  const active = await getActiveProviderAndKey();
  if (!active) throw new NoProviderConfiguredError();
  return active;
}

export async function fetchDailySeries(ticker: string): Promise<PricePoint[]> {
  const { providerId, apiKey } = await resolveActive();
  return PROVIDERS[providerId].fetchDailySeries(ticker, apiKey);
}

export async function lookupCompanyName(ticker: string): Promise<string> {
  const { providerId, apiKey } = await resolveActive();
  return PROVIDERS[providerId].lookupCompanyName(ticker, apiKey);
}
