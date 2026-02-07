/**
 * Canonical currency formatter for the app.
 * All currency display should use this function or formatCurrencyCompact.
 */
export const formatCurrency = (amount: number, currency: string = 'SAR'): string => {
    return new Intl.NumberFormat('en-SA', {
        style: 'currency',
        currency: currency,
    }).format(amount);
};

/**
 * Compact currency formatter (no decimals) for dashboards and summary views.
 */
export const formatCurrencyCompact = (amount: number, currency: string = 'SAR'): string => {
    return new Intl.NumberFormat('en-SA', {
        style: 'currency',
        currency: currency,
        maximumFractionDigits: 0,
    }).format(amount);
};
