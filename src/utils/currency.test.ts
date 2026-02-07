import { describe, expect, it } from 'vitest';
import { formatCurrency, formatCurrencyCompact } from './currency';

describe('formatCurrency', () => {
  it('formats positive amounts in SAR', () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain('1,234.56');
    expect(result).toContain('SAR');
  });

  it('formats zero correctly', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
    expect(result).toContain('SAR');
  });

  it('formats negative amounts', () => {
    const result = formatCurrency(-500);
    expect(result).toContain('500');
  });

  it('supports custom currency', () => {
    const result = formatCurrency(100, 'USD');
    expect(result).toContain('100');
    // en-SA locale formats USD as "$" symbol, not "US$"
    expect(result).toMatch(/\$|USD|US/);
  });

  it('handles large numbers', () => {
    const result = formatCurrency(1000000.99);
    expect(result).toContain('1,000,000.99');
  });
});

describe('formatCurrencyCompact', () => {
  it('formats without decimal places', () => {
    const result = formatCurrencyCompact(1234.56);
    expect(result).toContain('1,235'); // rounded
    expect(result).not.toContain('.56');
  });

  it('formats zero correctly', () => {
    const result = formatCurrencyCompact(0);
    expect(result).toContain('0');
  });
});
