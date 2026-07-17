export type PricePoint = { date: string; close: number };

export type ProviderId = 'alphaVantage' | 'tiingo' | 'financialModelingPrep';

export interface MarketDataProvider {
  fetchDailySeries(ticker: string, apiKey: string): Promise<PricePoint[]>;
  lookupCompanyName(ticker: string, apiKey: string): Promise<string>;
  // Cheap call used by the Settings screen to confirm a pasted key actually
  // works before saving it — must not throw on a valid key, must throw a
  // human-readable message on an invalid one.
  validateApiKey(apiKey: string): Promise<void>;
}

export interface ProviderMetadata {
  id: ProviderId;
  label: string;
  signupUrl: string;
}

export const PROVIDER_METADATA: ProviderMetadata[] = [
  { id: 'alphaVantage', label: 'Alpha Vantage', signupUrl: 'https://www.alphavantage.co/support/#api-key' },
  { id: 'tiingo', label: 'Tiingo', signupUrl: 'https://api.tiingo.com' },
  {
    id: 'financialModelingPrep',
    label: 'Financial Modeling Prep',
    signupUrl: 'https://site.financialmodelingprep.com',
  },
];
