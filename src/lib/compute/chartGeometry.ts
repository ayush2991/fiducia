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
