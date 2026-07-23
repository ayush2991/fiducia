import { financialModelingPrepProvider } from './financialModelingPrep';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('financialModelingPrepProvider.fetchDailySeries', () => {
  it('maps and sorts the bare array into PricePoint[]', async () => {
    mockFetchOnce(200, [
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-01', close: 100 },
    ]);
    const points = await financialModelingPrepProvider.fetchDailySeries('SPY', 'key');
    expect(points).toEqual([
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 },
    ]);
  });

  it('throws the Error Message field when present', async () => {
    mockFetchOnce(200, { 'Error Message': 'Invalid API KEY.' });
    await expect(financialModelingPrepProvider.fetchDailySeries('SPY', 'bad-key')).rejects.toThrow(
      'Invalid API KEY.'
    );
  });

  it('throws on an empty array', async () => {
    mockFetchOnce(200, []);
    await expect(financialModelingPrepProvider.fetchDailySeries('BOGUS', 'key')).rejects.toThrow(
      'Unknown ticker or no price data returned for BOGUS'
    );
  });

  it('throws a key-specific message on 401/403', async () => {
    mockFetchOnce(401, {});
    await expect(financialModelingPrepProvider.fetchDailySeries('SPY', 'bad-key')).rejects.toThrow(
      'rejected the API key'
    );
  });
});

describe('financialModelingPrepProvider.lookupCompanyName', () => {
  it('returns the resolved name on a matching symbol', async () => {
    mockFetchOnce(200, [{ symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust' }]);
    await expect(financialModelingPrepProvider.lookupCompanyName('SPY', 'key')).resolves.toBe(
      'SPDR S&P 500 ETF Trust'
    );
  });

  it('falls back to the ticker on failure', async () => {
    mockFetchOnce(500, {});
    await expect(financialModelingPrepProvider.lookupCompanyName('SPY', 'key')).resolves.toBe('SPY');
  });
});
