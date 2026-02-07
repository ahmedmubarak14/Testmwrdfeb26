import React from 'react';
import { useTranslation } from 'react-i18next';

export interface QuoteWithDetails {
    id: string;
    rfq_id: string;
    supplier_id: string;
    price: number;
    finalPrice?: number;
    leadTime?: string;
    warranty?: string;
    notes?: string;
    status: string;
    created_at: string;
    supplier?: {
        id: string;
        companyName?: string;
        name?: string;
    };
    product?: {
        id: string;
        name: string;
        brand?: string;
        imageUrl?: string;
    };
}

interface QuoteComparisonProps {
    quotes: QuoteWithDetails[];
    onAccept: (quoteId: string) => void;
    onClose: () => void;
}

export const QuoteComparison: React.FC<QuoteComparisonProps> = ({ quotes, onAccept, onClose }) => {
    const { t } = useTranslation();

    if (quotes.length === 0) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-8 max-w-md">
                    <h3 className="text-xl font-bold mb-4">{t('client.quotes.noQuotes')}</h3>
                    <p className="text-neutral-500 mb-6">
                        {t('client.quotes.noQuotesDesc') || 'No quotes are available for comparison yet.'}
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300"
                    >
                        {t('common.close')}
                    </button>
                </div>
            </div>
        );
    }

    // Find min/max prices for highlighting
    const prices = quotes.map(q => q.finalPrice || q.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
            <div className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] overflow-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-neutral-200 p-6 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-2xl font-bold text-neutral-800">
                            {t('client.quotes.comparison') || 'Quote Comparison'}
                        </h2>
                        <p className="text-neutral-500 text-sm mt-1">
                            {t('client.quotes.comparisonDesc') || 'Compare quotes side-by-side to make the best decision'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Comparison Table */}
                <div className="p-6 overflow-x-auto">
                    <table className="w-full border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-neutral-50">
                                <th className="p-4 text-left font-semibold text-neutral-700 sticky left-0 bg-neutral-50">
                                    {t('client.quotes.criteria') || 'Criteria'}
                                </th>
                                {quotes.map((quote, idx) => (
                                    <th key={quote.id} className="p-4 text-left font-semibold text-neutral-700">
                                        <div className="flex flex-col gap-1">
                                            <span>{quote.supplier?.companyName || quote.supplier?.name || `Supplier ${idx + 1}`}</span>
                                            <span className="text-xs font-normal text-neutral-500">
                                                {new Date(quote.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {/* Product Image */}
                            <tr className="border-b border-neutral-200">
                                <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">
                                    {t('client.quotes.product') || 'Product'}
                                </td>
                                {quotes.map(quote => (
                                    <td key={quote.id} className="p-4">
                                        <div className="flex items-center gap-3">
                                            {quote.product?.imageUrl && (
                                                <img
                                                    src={quote.product.imageUrl}
                                                    alt={quote.product.name}
                                                    className="w-16 h-16 object-cover rounded-lg"
                                                />
                                            )}
                                            <div>
                                                <p className="font-medium text-neutral-800">{quote.product?.name || 'Product'}</p>
                                                {quote.product?.brand && (
                                                    <p className="text-sm text-neutral-500">{quote.product.brand}</p>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                ))}
                            </tr>

                            {/* Price */}
                            <tr className="border-b border-neutral-200">
                                <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">
                                    {t('client.quotes.price') || 'Price'}
                                </td>
                                {quotes.map(quote => {
                                    const price = quote.finalPrice || quote.price;
                                    const isLowest = price === minPrice && quotes.length > 1;
                                    const isHighest = price === maxPrice && quotes.length > 1;

                                    return (
                                        <td key={quote.id} className="p-4">
                                            <div className="flex flex-col gap-1">
                                                <span className={`text-2xl font-bold ${isLowest ? 'text-green-600' : 'text-neutral-800'}`}>
                                                    ${price.toLocaleString()}
                                                </span>
                                                {isLowest && (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                                                        <span className="material-symbols-outlined text-sm">trending_down</span>
                                                        {t('client.quotes.bestPrice') || 'Best Price'}
                                                    </span>
                                                )}
                                                {isHighest && quotes.length > 2 && (
                                                    <span className="text-xs text-neutral-400">
                                                        {t('client.quotes.highest') || 'Highest'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* Lead Time */}
                            <tr className="border-b border-neutral-200">
                                <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">
                                    {t('client.quotes.leadTime') || 'Lead Time'}
                                </td>
                                {quotes.map(quote => (
                                    <td key={quote.id} className="p-4">
                                        <span className="text-neutral-700">{quote.leadTime || 'Not specified'}</span>
                                    </td>
                                ))}
                            </tr>

                            {/* Warranty */}
                            <tr className="border-b border-neutral-200">
                                <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">
                                    {t('client.quotes.warranty') || 'Warranty'}
                                </td>
                                {quotes.map(quote => (
                                    <td key={quote.id} className="p-4">
                                        <span className="text-neutral-700">{quote.warranty || 'Standard'}</span>
                                    </td>
                                ))}
                            </tr>

                            {/* Notes */}
                            <tr className="border-b border-neutral-200">
                                <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">
                                    {t('client.quotes.notes') || 'Notes'}
                                </td>
                                {quotes.map(quote => (
                                    <td key={quote.id} className="p-4">
                                        <span className="text-sm text-neutral-600">{quote.notes || '-'}</span>
                                    </td>
                                ))}
                            </tr>

                            {/* Actions */}
                            <tr>
                                <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">
                                    {t('client.quotes.action') || 'Action'}
                                </td>
                                {quotes.map(quote => (
                                    <td key={quote.id} className="p-4">
                                        <button
                                            onClick={() => onAccept(quote.id)}
                                            disabled={quote.status === 'ACCEPTED'}
                                            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed font-semibold transition-colors"
                                        >
                                            {quote.status === 'ACCEPTED'
                                                ? (t('client.quotes.accepted') || 'Accepted')
                                                : (t('client.quotes.acceptQuote') || 'Accept Quote')
                                            }
                                        </button>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Footer Note */}
                <div className="border-t border-neutral-200 p-6 bg-neutral-50">
                    <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-blue-600">info</span>
                        <div className="flex-1">
                            <p className="text-sm text-neutral-700 font-medium">
                                {t('client.quotes.comparisonNote') || 'Compare all aspects before making a decision'}
                            </p>
                            <p className="text-xs text-neutral-500 mt-1">
                                {t('client.quotes.comparisonNoteDesc') || 'Consider price, lead time, warranty, and supplier reliability when selecting a quote.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
