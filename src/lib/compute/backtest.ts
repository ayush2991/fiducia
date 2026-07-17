export type PricePoint = { date: string; close: number };

// Static-weight backtest: combines each held ticker's price series into a single
// portfolio value series (indexed to 100 at the first shared date), using the
// portfolio's current weights held constant across the whole window. Per spec §3,
// this does not track historical allocation changes.
export function combineWeightedSeries(
  holdings: { ticker: string; weight: number }[],
  pricesByTicker: Record<string, PricePoint[]>
): { date: string; value: number }[] {
  if (holdings.length === 0) return [];
  const totalWeight = holdings.reduce((sum, h) => sum + h.weight, 0);
  if (totalWeight === 0) return [];

  const closesByTicker = holdings.map(
    (h) => new Map((pricesByTicker[h.ticker] ?? []).map((p) => [p.date, p.close]))
  );
  const firstTickerDates = (pricesByTicker[holdings[0].ticker] ?? []).map((p) => p.date);
  const sharedDates = firstTickerDates
    .filter((date) => closesByTicker.every((closes) => closes.has(date)))
    .sort();
  if (sharedDates.length === 0) return [];

  const values: { date: string; value: number }[] = [{ date: sharedDates[0], value: 100 }];
  for (let i = 1; i < sharedDates.length; i++) {
    const prevDate = sharedDates[i - 1];
    const date = sharedDates[i];
    let weightedReturn = 0;
    holdings.forEach((h, idx) => {
      const prev = closesByTicker[idx].get(prevDate)!;
      const cur = closesByTicker[idx].get(date)!;
      if (prev !== 0) {
        weightedReturn += (h.weight / totalWeight) * ((cur - prev) / prev);
      }
    });
    const prevValue = values[values.length - 1].value;
    values.push({ date, value: prevValue * (1 + weightedReturn) });
  }
  return values;
}
