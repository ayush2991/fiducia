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
  const { min, max } = seriesRange(values);
  const range = max - min || 1;
  const last = values[values.length - 1];
  return { x: width, y: padY + (height - padY * 2) * (1 - (last - min) / range) };
}

export function seriesRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}
