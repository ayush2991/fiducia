import { tiingoProvider } from './tiingo';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('tiingoProvider.fetchDailySeries', () => {
  it('maps and sorts the response into PricePoint[]', async () => {
    mockFetchOnce(200, [
      { date: '2024-01-02T00:00:00.000Z', close: 101 },
      { date: '2024-01-01T00:00:00.000Z', close: 100 },
    ]);
    const points = await tiingoProvider.fetchDailySeries('SPY', 'key');
    expect(points).toEqual([
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 },
    ]);
  });

  it('throws "Unknown ticker" on a 404', async () => {
    mockFetchOnce(404, {});
    await expect(tiingoProvider.fetchDailySeries('BOGUS', 'key')).rejects.toThrow('Unknown ticker: BOGUS');
  });

  it('throws a key-specific message on 401/403', async () => {
    mockFetchOnce(401, {});
    await expect(tiingoProvider.fetchDailySeries('SPY', 'bad-key')).rejects.toThrow('Tiingo rejected the API key');
  });

  it('throws with the status code on other non-OK statuses', async () => {
    mockFetchOnce(500, {});
    await expect(tiingoProvider.fetchDailySeries('SPY', 'key')).rejects.toThrow('status 500');
  });
});

describe('tiingoProvider.fetchDailySeries startDate window', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requests a startDate far enough back to cover the 5Y period', async () => {
    mockFetchOnce(200, [{ date: '2024-01-01T00:00:00.000Z', close: 100 }]);
    await tiingoProvider.fetchDailySeries('SPY', 'key');
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    const startDate = new URL(calledUrl).searchParams.get('startDate');
    expect(startDate).toBe('2021-05-04');
  });
});

describe('tiingoProvider.lookupCompanyName', () => {
  it('returns the resolved name', async () => {
    mockFetchOnce(200, { name: 'SPDR S&P 500 ETF Trust' });
    await expect(tiingoProvider.lookupCompanyName('SPY', 'key')).resolves.toBe('SPDR S&P 500 ETF Trust');
  });

  it('falls back to the ticker on failure', async () => {
    mockFetchOnce(500, {});
    await expect(tiingoProvider.lookupCompanyName('SPY', 'key')).resolves.toBe('SPY');
  });
});
