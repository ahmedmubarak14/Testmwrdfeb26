import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RFQ } from '../../types/types';

interface RFQMarginModalProps {
    isOpen: boolean;
    onClose: () => void;
    rfq: RFQ | null;
    currentMargin?: number;
    onSave: (rfqId: string, margin: number) => Promise<void>;
    isLoading: boolean;
}

export default function RFQMarginModal({
    isOpen,
    onClose,
    rfq,
    currentMargin,
    onSave,
    isLoading
}: RFQMarginModalProps) {
    const { t } = useTranslation();
    const [margin, setMargin] = useState<string>('');

    useEffect(() => {
        if (isOpen && currentMargin !== undefined) {
            setMargin(currentMargin.toString());
        } else {
            setMargin('');
        }
    }, [isOpen, currentMargin]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!rfq) return;

        const numMargin = parseFloat(margin);
        if (isNaN(numMargin) || numMargin < 0) {
            return;
        }

        onSave(rfq.id, numMargin);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                        {t('admin.margins.setRFQMargin') || 'Set RFQ Margin'}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                        {t('admin.margins.rfqMarginDescription') || 'This will update the margin for all quotes associated with this RFQ.'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                            {t('admin.margins.marginPercentage') || 'Margin Percentage'}
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={margin}
                                onChange={(e) => setMargin(e.target.value)}
                                className="w-full px-4 py-2 pr-8 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                placeholder="0.00"
                                required
                            />
                            <span className="absolute right-3 top-2 text-neutral-500 dark:text-neutral-400 pointer-events-none">
                                %
                            </span>
                        </div>
                        {rfq && (
                            <p className="mt-2 text-xs text-neutral-500">
                                RFQ ID: {rfq.id}
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                            disabled={isLoading}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            disabled={isLoading || !margin}
                        >
                            {isLoading && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                            {t('common.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
