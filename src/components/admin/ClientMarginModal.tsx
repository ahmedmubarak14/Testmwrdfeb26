import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User } from '../../types/types';

interface ClientMarginModalProps {
    isOpen: boolean;
    onClose: () => void;
    client: User | null;
    onSave: (clientId: string, margin: number) => Promise<void>;
    isLoading: boolean;
}

export const ClientMarginModal: React.FC<ClientMarginModalProps> = ({
    isOpen,
    onClose,
    client,
    onSave,
    isLoading
}) => {
    const { t } = useTranslation();
    const [margin, setMargin] = useState<string>('');

    useEffect(() => {
        if (isOpen && client) {
            setMargin(client.clientMargin?.toString() || '');
        }
    }, [isOpen, client]);

    if (!isOpen || !client) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const val = parseFloat(margin);
        if (!isNaN(val) && val >= 0) {
            onSave(client.id, val);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {t('admin.margins.setClientMargin', 'Set Client Margin')}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {t('admin.margins.settingMarginFor', 'Setting margin for')} <span className="font-semibold text-gray-700 dark:text-gray-300">{client.companyName || client.name}</span>
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('admin.margins.marginPercentage', 'Margin Percentage')} (%)
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                required
                                aria-invalid={margin !== '' && (isNaN(parseFloat(margin)) || parseFloat(margin) < 0) ? 'true' : undefined}
                                className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                placeholder={t('admin.margins.marginPlaceholder', 'e.g. 15')}
                                value={margin}
                                onChange={(e) => setMargin(e.target.value)}
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                                %
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {t('admin.margins.clientMarginHint', 'This margin will override any Category or Global defaults for this client\'s quotes.')}
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !margin}
                            className="px-6 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isLoading && <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>}
                            {t('admin.margins.saveMargin', 'Save Margin')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
