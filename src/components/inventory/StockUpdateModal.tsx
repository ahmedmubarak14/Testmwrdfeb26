import { logger } from '@/src/utils/logger';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inventoryService } from '../../services/inventoryService';
import { useToast } from '../../hooks/useToast';

interface StockUpdateModalProps {
    isOpen: boolean;
    onClose: () => void;
    productId: string;
    productName: string;
    currentStock: number;
    onStockUpdated: () => void;
    userId: string;
}

export const StockUpdateModal: React.FC<StockUpdateModalProps> = ({
    isOpen,
    onClose,
    productId,
    productName,
    currentStock,
    onStockUpdated,
    userId
}) => {
    const { t } = useTranslation();
    const toast = useToast();
    const [newStock, setNewStock] = useState(currentStock.toString());
    const [adjustmentMode, setAdjustmentMode] = useState<'set' | 'add' | 'subtract'>('set');
    const [adjustmentAmount, setAdjustmentAmount] = useState('0');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const calculateFinalStock = (): number => {
        if (adjustmentMode === 'set') {
            return parseInt(newStock) || 0;
        } else if (adjustmentMode === 'add') {
            return currentStock + (parseInt(adjustmentAmount) || 0);
        } else {
            return Math.max(0, currentStock - (parseInt(adjustmentAmount) || 0));
        }
    };

    const handleSubmit = async () => {
        try {
            setLoading(true);
            const finalStock = calculateFinalStock();

            await inventoryService.updateStock(productId, finalStock, userId, 'manual_adjustment');

            toast.success(t('inventory.stockUpdated') || 'Stock updated successfully');
            onStockUpdated();
            onClose();
        } catch (error) {
            logger.error('Error updating stock:', error);
            toast.error(t('inventory.updateError') || 'Failed to update stock');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-neutral-100">
                    <h2 className="text-xl font-bold text-neutral-800">
                        {t('inventory.updateStock') || 'Update Stock'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-neutral-100 rounded-lg transition-colors"
                    >
                        <span className="material-symbols-outlined text-neutral-500">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Product Info */}
                    <div className="bg-neutral-50 rounded-lg p-4">
                        <p className="font-medium text-neutral-800">{productName}</p>
                        <p className="text-sm text-neutral-500">
                            {t('inventory.currentStock') || 'Current Stock'}: <span className="font-bold">{currentStock}</span>
                        </p>
                    </div>

                    {/* Mode Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-600">
                            {t('inventory.adjustmentType') || 'Adjustment Type'}
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setAdjustmentMode('set')}
                                className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${adjustmentMode === 'set'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                    }`}
                            >
                                {t('inventory.setTo') || 'Set To'}
                            </button>
                            <button
                                onClick={() => setAdjustmentMode('add')}
                                className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${adjustmentMode === 'add'
                                        ? 'bg-green-600 text-white'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-sm align-middle">add</span>
                                {t('inventory.add') || 'Add'}
                            </button>
                            <button
                                onClick={() => setAdjustmentMode('subtract')}
                                className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${adjustmentMode === 'subtract'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-sm align-middle">remove</span>
                                {t('inventory.subtract') || 'Subtract'}
                            </button>
                        </div>
                    </div>

                    {/* Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-600">
                            {adjustmentMode === 'set'
                                ? (t('inventory.newStock') || 'New Stock Quantity')
                                : (t('inventory.amount') || 'Amount')
                            }
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={adjustmentMode === 'set' ? newStock : adjustmentAmount}
                            onChange={(e) => {
                                if (adjustmentMode === 'set') {
                                    setNewStock(e.target.value);
                                } else {
                                    setAdjustmentAmount(e.target.value);
                                }
                            }}
                            className="w-full px-4 py-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium"
                        />
                    </div>

                    {/* Preview */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                        <span className="text-blue-700">
                            {t('inventory.finalStock') || 'Final Stock'}:
                        </span>
                        <span className="text-2xl font-bold text-blue-800">
                            {calculateFinalStock()}
                        </span>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-neutral-100">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-neutral-100 text-neutral-700 rounded-lg font-medium hover:bg-neutral-200 transition-colors"
                    >
                        {t('common.cancel') || 'Cancel'}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {t('common.processing') || 'Processing...'}
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-sm">check</span>
                                {t('common.save') || 'Save'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StockUpdateModal;
