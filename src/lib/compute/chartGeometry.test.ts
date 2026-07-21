import {
  areaPath,
  lastPointPosition,
  linePath,
  nearestIndexForX,
  pointPosition,
  seriesRange,
} from './chartGeometry';

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

describe('pointPosition', () => {
  it('matches lastPointPosition when given the final index', () => {
    expect(pointPosition([10, 20, 30], 2, 56, 24, 3)).toEqual(lastPointPosition([10, 20, 30], 56, 24, 3));
  });

  it('places an earlier index proportionally along the x-axis', () => {
    expect(pointPosition([10, 20, 30], 1, 56, 24, 3)).toEqual({ x: 28, y: 12 });
  });

  it('places the first index at x=0', () => {
    expect(pointPosition([10, 20, 30], 0, 56, 24, 3)).toEqual({ x: 0, y: 21 });
  });
});

describe('nearestIndexForX', () => {
  it('returns 0 for a single-point series', () => {
    expect(nearestIndexForX(40, 1, 56)).toBe(0);
  });

  it('rounds to the closest index', () => {
    expect(nearestIndexForX(0, 3, 56)).toBe(0);
    expect(nearestIndexForX(20, 3, 56)).toBe(1);
    expect(nearestIndexForX(56, 3, 56)).toBe(2);
  });

  it('clamps out-of-range x to the series bounds', () => {
    expect(nearestIndexForX(-10, 3, 56)).toBe(0);
    expect(nearestIndexForX(1000, 3, 56)).toBe(2);
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
