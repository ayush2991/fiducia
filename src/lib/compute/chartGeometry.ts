export function linePath(values: number[], width: number, height: number, padY = 8): string {
  if (values.length === 0) return '';
  const { min, max } = seriesRange(values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = padY + (height - padY * 2) * (1 - (v - min) / range);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function areaPath(values: number[], width: number, height: number, padY = 8): string {
  const line = linePath(values, width, height, padY);
  if (!line) return '';
  return `${line} L${width},${height} L0,${height} Z`;
}

export function lastPointPosition(
  values: number[],
  width: number,
  height: number,
  padY = 8
): { x: number; y: number } {
  return pointPosition(values, values.length - 1, width, height, padY);
}

// Position of an arbitrary point (not just the last), so a chart can track a
// scrub/drag gesture across the series instead of only ever showing the end.
export function pointPosition(
  values: number[],
  index: number,
  width: number,
  height: number,
  padY = 8
): { x: number; y: number } {
  const { min, max } = seriesRange(values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const v = values[index];
  return { x: index * stepX, y: padY + (height - padY * 2) * (1 - (v - min) / range) };
}

// Maps a touch's x-offset (in whatever pixel space the caller measured, e.g. via
// onLayout) to the nearest series index, given that same space's total width.
export function nearestIndexForX(x: number, count: number, spaceWidth: number): number {
  if (count <= 1) return 0;
  const stepX = spaceWidth / (count - 1);
  const index = Math.round(x / stepX);
  return Math.max(0, Math.min(count - 1, index));
}

export function seriesRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

// % change from a series' first value to the value at `index` — the
// "return so far" figure shown on both charts' scrub pills/tooltips and
// both screens' live headline/row values.
export function percentChangeAt(values: number[], index: number): number {
  if (values.length === 0) return 0;
  const base = values[0];
  if (base === 0) return 0;
  return ((values[index] - base) / base) * 100;
}

// --- Date-based geometry ---
//
// The functions above space points evenly by array index, which is wrong when
// comparing series of different lengths (e.g. a brand-new ticker with 5 daily
// points against a benchmark with 90) — both would stretch across the same
// width regardless of how much real history each actually spans. These
// variants position points by their actual date within a shared domain
// instead, so a short series occupies only the trailing portion of the chart.

export interface DatedPoint {
  date: string;
  value: number;
}

export interface DateDomain {
  minDate: string;
  maxDate: string;
}

// Widest date range spanned by any of the given series — the shared x-axis
// domain every series is positioned within.
export function dateDomain(pointSets: DatedPoint[][]): DateDomain {
  let minDate: string | null = null;
  let maxDate: string | null = null;
  for (const points of pointSets) {
    for (const p of points) {
      if (minDate === null || p.date < minDate) minDate = p.date;
      if (maxDate === null || p.date > maxDate) maxDate = p.date;
    }
  }
  return { minDate: minDate ?? '', maxDate: maxDate ?? '' };
}

// Where a date falls within a domain, as a 0..1 fraction (0 = minDate, 1 = maxDate).
export function xFractionForDate(date: string, domain: DateDomain): number {
  const min = Date.parse(domain.minDate);
  const max = Date.parse(domain.maxDate);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return 0.5;
  const t = Date.parse(date);
  return (t - min) / (max - min);
}

export function linePathByDate(
  points: DatedPoint[],
  domain: DateDomain,
  valueRange: { min: number; max: number },
  width: number,
  height: number,
  padY = 8
): string {
  if (points.length === 0) return '';
  const range = valueRange.max - valueRange.min || 1;
  return points
    .map((p, i) => {
      const x = xFractionForDate(p.date, domain) * width;
      const y = padY + (height - padY * 2) * (1 - (p.value - valueRange.min) / range);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function areaPathByDate(
  points: DatedPoint[],
  domain: DateDomain,
  valueRange: { min: number; max: number },
  width: number,
  height: number,
  padY = 8
): string {
  const line = linePathByDate(points, domain, valueRange, width, height, padY);
  if (!line) return '';
  return `${line} L${width},${height} L0,${height} Z`;
}

export function pointPositionByDate(
  points: DatedPoint[],
  index: number,
  domain: DateDomain,
  valueRange: { min: number; max: number },
  width: number,
  height: number,
  padY = 8
): { x: number; y: number } {
  const range = valueRange.max - valueRange.min || 1;
  const p = points[index];
  return {
    x: xFractionForDate(p.date, domain) * width,
    y: padY + (height - padY * 2) * (1 - (p.value - valueRange.min) / range),
  };
}

// Index of the point whose date is closest to `targetDate` — the date-based
// equivalent of nearestIndexForX, used to resolve a scrub touch (converted to
// a target date via the shared domain) to each series' own nearest point,
// even when that series starts later than the domain's minDate.
export function nearestIndexForDate(targetDate: string, points: DatedPoint[]): number {
  if (points.length === 0) return 0;
  const target = Date.parse(targetDate);
  let bestIndex = 0;
  let bestDiff = Infinity;
  points.forEach((p, i) => {
    const diff = Math.abs(Date.parse(p.date) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  });
  return bestIndex;
}
