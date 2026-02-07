import { describe, expect, it } from 'vitest';
import { LOW_STOCK_THRESHOLD, getStockStatus } from './inventoryService';

describe('getStockStatus', () => {
  it('marks non-positive stock as out_of_stock', () => {
    expect(getStockStatus(0)).toBe('out_of_stock');
    expect(getStockStatus(-3)).toBe('out_of_stock');
  });

  it('marks low but positive stock as low_stock', () => {
    expect(getStockStatus(1)).toBe('low_stock');
    expect(getStockStatus(LOW_STOCK_THRESHOLD)).toBe('low_stock');
  });

  it('marks stock above threshold as in_stock', () => {
    expect(getStockStatus(LOW_STOCK_THRESHOLD + 1)).toBe('in_stock');
  });
});

