import {
  areaPath,
  dateDomain,
  lastPointPosition,
  linePath,
  linePathByDate,
  nearestIndexForDate,
  nearestIndexForX,
  percentChangeAt,
  pointPosition,
  pointPositionByDate,
  seriesRange,
  xFractionForDate,
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

describe('percentChangeAt', () => {
  it('returns 0% at the start of the series', () => {
    expect(percentChangeAt([100, 110, 90], 0)).toBe(0);
  });

  it('computes % change from the first value to the given index', () => {
    expect(percentChangeAt([100, 110, 90], 1)).toBe(10);
    expect(percentChangeAt([100, 110, 90], 2)).toBe(-10);
  });

  it('returns 0 for an empty series', () => {
    expect(percentChangeAt([], 0)).toBe(0);
  });

  it('returns 0 when the first value is 0, instead of NaN/Infinity', () => {
    expect(percentChangeAt([0, 10], 1)).toBe(0);
  });
});

describe('dateDomain', () => {
  it('spans the min/max date across all provided series', () => {
    const longSeries = [{ date: '2026-01-01', value: 1 }, { date: '2026-03-01', value: 2 }];
    const shortSeries = [{ date: '2026-02-20', value: 1 }, { date: '2026-03-01', value: 1.1 }];
    expect(dateDomain([longSeries, shortSeries])).toEqual({ minDate: '2026-01-01', maxDate: '2026-03-01' });
  });

  it('returns empty strings for no points', () => {
    expect(dateDomain([[], []])).toEqual({ minDate: '', maxDate: '' });
  });
});

describe('xFractionForDate', () => {
  const domain = { minDate: '2026-01-01', maxDate: '2026-01-11' };

  it('maps the domain start to 0 and end to 1', () => {
    expect(xFractionForDate('2026-01-01', domain)).toBe(0);
    expect(xFractionForDate('2026-01-11', domain)).toBe(1);
  });

  it('maps a midpoint date proportionally', () => {
    expect(xFractionForDate('2026-01-06', domain)).toBeCloseTo(0.5, 5);
  });

  it('returns 0.5 for a degenerate single-date domain', () => {
    expect(xFractionForDate('2026-01-01', { minDate: '2026-01-01', maxDate: '2026-01-01' })).toBe(0.5);
  });
});

describe('linePathByDate', () => {
  it('returns an empty string for no points', () => {
    expect(linePathByDate([], { minDate: '', maxDate: '' }, { min: 0, max: 0 }, 56, 24)).toBe('');
  });

  it('positions a short series only in the trailing portion of a wider domain', () => {
    const domain = { minDate: '2026-01-01', maxDate: '2026-01-11' };
    const points = [{ date: '2026-01-09', value: 10 }, { date: '2026-01-11', value: 20 }];
    const path = linePathByDate(points, domain, { min: 10, max: 20 }, 100, 24, 0);
    // day 9 of 11 -> fraction 0.8 -> x=80, value=min -> y=24; day 11 -> fraction 1 -> x=100, value=max -> y=0
    expect(path).toBe('M80.0,24.0 L100.0,0.0');
  });
});

describe('pointPositionByDate', () => {
  it('places a point at the x-fraction implied by its date within the domain', () => {
    const domain = { minDate: '2026-01-01', maxDate: '2026-01-11' };
    const points = [{ date: '2026-01-01', value: 10 }, { date: '2026-01-06', value: 20 }];
    expect(pointPositionByDate(points, 1, domain, { min: 10, max: 20 }, 100, 24, 0)).toEqual({ x: 50, y: 0 });
  });
});

describe('nearestIndexForDate', () => {
  it('picks the closest point by date, including for a series starting partway through a domain', () => {
    const points = [{ date: '2026-01-09', value: 10 }, { date: '2026-01-10', value: 15 }, { date: '2026-01-11', value: 20 }];
    expect(nearestIndexForDate('2026-01-01', points)).toBe(0);
    expect(nearestIndexForDate('2026-01-10', points)).toBe(1);
    expect(nearestIndexForDate('2026-01-11', points)).toBe(2);
  });

  it('returns 0 for an empty series', () => {
    expect(nearestIndexForDate('2026-01-01', [])).toBe(0);
  });
});
