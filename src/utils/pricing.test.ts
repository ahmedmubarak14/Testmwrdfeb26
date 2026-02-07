import { describe, expect, it } from 'vitest';
import { calculatePricingBreakdown, calculateVatAmount } from './pricing';

describe('pricing utilities', () => {
  it('calculates VAT using configured percentage', () => {
    expect(calculateVatAmount(100, 15)).toBe(15);
    expect(calculateVatAmount(250.75, 15)).toBe(37.61);
  });

  it('returns rounded totals with discount', () => {
    const pricing = calculatePricingBreakdown(1000, 15, 20.4);
    expect(pricing).toEqual({
      subtotal: 1000,
      vatAmount: 150,
      discountAmount: 20.4,
      total: 1129.6,
    });
  });

  it('clamps invalid values to safe defaults', () => {
    const pricing = calculatePricingBreakdown(-100, -5, -9);
    expect(pricing).toEqual({
      subtotal: 0,
      vatAmount: 0,
      discountAmount: 0,
      total: 0,
    });
  });
});
