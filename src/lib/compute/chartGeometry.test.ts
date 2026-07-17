import { areaPath, lastPointPosition, linePath, seriesRange } from './chartGeometry';

describe('linePath', () => {
  it('returns an empty string for no values', () => {
    expect(linePath([], 56, 24)).toBe('');
  });

  it('maps a flat series to a straight horizontal line at mid-height', () => {
    expect(linePath([100, 100], 56, 24, 3)).toBe('M0.0,21.0 L56.0,21.0');
  });

  it('places the lowest value at the bottom and highest at the top', () => {
    expect(linePath([10, 20], 56, 24, 3)).toBe('M0.0,21.0 L56.0,3.0');
  });
});

describe('areaPath', () => {
  it('closes the line path down to the bottom corners', () => {
    expect(areaPath([10, 20], 56, 24, 3)).toBe('M0.0,21.0 L56.0,3.0 L56,24 L0,24 Z');
  });
});

describe('lastPointPosition', () => {
  it('returns the x/y of the final value', () => {
    expect(lastPointPosition([10, 20], 56, 24, 3)).toEqual({ x: 56, y: 3 });
  });
});

describe('seriesRange', () => {
  it('returns min and max of the series', () => {
    expect(seriesRange([10, 30, 20])).toEqual({ min: 10, max: 30 });
  });

  it('returns 0/0 for empty input', () => {
    expect(seriesRange([])).toEqual({ min: 0, max: 0 });
  });
});
