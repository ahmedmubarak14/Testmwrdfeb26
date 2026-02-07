export interface PricingBreakdown {
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  total: number;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateVatAmount(subtotal: number, vatRatePercent: number): number {
  const safeSubtotal = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  const safeVatPercent = Number.isFinite(vatRatePercent) ? Math.max(0, vatRatePercent) : 0;
  return roundCurrency(safeSubtotal * (safeVatPercent / 100));
}

export function calculatePricingBreakdown(
  subtotal: number,
  vatRatePercent: number,
  discountAmount: number = 0
): PricingBreakdown {
  const safeSubtotal = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  const safeDiscount = Number.isFinite(discountAmount) ? Math.max(0, discountAmount) : 0;
  const vatAmount = calculateVatAmount(safeSubtotal, vatRatePercent);
  const total = Math.max(0, roundCurrency(safeSubtotal + vatAmount - safeDiscount));

  return {
    subtotal: roundCurrency(safeSubtotal),
    vatAmount,
    discountAmount: roundCurrency(safeDiscount),
    total,
  };
}
