export const generateSKU = (category: string): string => {
    const prefixMap: Record<string, string> = {
        'Office': 'OFF',
        'IT Supplies': 'ITS',
        'Breakroom': 'BRK',
        'Janitorial': 'JAN',
        'Maintenance': 'MRO',
        'General': 'GEN'
    };

    const prefix = prefixMap[category] || category.substring(0, 3).toUpperCase();
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();

    return `${prefix}-${randomSuffix}`;
};
