import { logger } from '@/src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { inventoryService, StockInfo } from '../../services/inventoryService';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { StockBadge } from '../inventory/StockBadge';

export const SupplierInventory: React.FC = () => {
    const { t } = useTranslation();
    const toast = useToast();
    const { currentUser } = useStore();

    const [products, setProducts] = useState<StockInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
    const [editingStockId, setEditingStockId] = useState<string | null>(null);
    const [editStockValue, setEditStockValue] = useState<number>(0);

    useEffect(() => {
        if (currentUser?.id) {
            loadInventory();
        }
    }, [currentUser]);

    const loadInventory = async () => {
        if (!currentUser?.id) return;
        setLoading(true);
        try {
            const data = await inventoryService.getSupplierProducts(currentUser.id);
            setProducts(data);
        } catch (error) {
            logger.error('Error loading inventory:', error);
            toast.error(t('supplier.inventory.loadError') || 'Failed to load inventory');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStock = async (productId: string) => {
        if (!currentUser?.id) return;
        try {
            await inventoryService.updateStock(productId, editStockValue, currentUser.id);
            toast.success(t('supplier.inventory.updateSuccess') || 'Stock updated successfully');
            setEditingStockId(null);
            loadInventory();
        } catch (error) {
            logger.error('Error updating stock:', error);
            toast.error(t('supplier.inventory.updateError') || 'Failed to update stock');
        }
    };

    const startEditing = (product: StockInfo) => {
        setEditingStockId(product.productId);
        setEditStockValue(product.currentStock);
    };

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.productName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{t('sidebar.inventory') || 'Inventory Management'}</h1>
                    <p className="text-gray-500">{t('supplier.inventory.subtitle') || 'Manage your product stock levels'}</p>
                </div>
                <button
                    onClick={loadInventory}
                    className="self-start md:self-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                    <span className="material-symbols-outlined text-lg">refresh</span>
                    {t('common.refresh') || 'Refresh'}
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex-1 relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                    <input
                        type="text"
                        placeholder={t('supplier.inventory.searchPlaceholder') || 'Search products...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                >
                    <option value="all">{t('common.allStatus') || 'All Status'}</option>
                    <option value="in_stock">{t('inventory.status.in_stock') || 'In Stock'}</option>
                    <option value="low_stock">{t('inventory.status.low_stock') || 'Low Stock'}</option>
                    <option value="out_of_stock">{t('inventory.status.out_of_stock') || 'Out of Stock'}</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-gray-600 text-sm">{t('supplier.inventory.product') || 'Product'}</th>
                                <th className="px-6 py-4 font-semibold text-gray-600 text-sm">{t('supplier.inventory.sku') || 'SKU'}</th>
                                <th className="px-6 py-4 font-semibold text-gray-600 text-sm">{t('supplier.inventory.category') || 'Category'}</th>
                                <th className="px-6 py-4 font-semibold text-gray-600 text-sm text-center">{t('supplier.inventory.currentStock') || 'Current Stock'}</th>
                                <th className="px-6 py-4 font-semibold text-gray-600 text-sm text-center">{t('supplier.inventory.status') || 'Status'}</th>
                                <th className="px-6 py-4 font-semibold text-gray-600 text-sm text-right">{t('common.actions') || 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="material-symbols-outlined text-4xl text-gray-300">inventory_2</span>
                                            <p>{t('supplier.inventory.noProducts') || 'No products found'}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((product) => (
                                    <tr key={product.productId} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{product.productName}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {/* Masking UUID provided as productID for 'SKU' visual if no real SKU */}
                                            <span className="font-mono text-xs">{product.productId.split('-')[0].toUpperCase()}</span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {product.category || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {editingStockId === product.productId ? (
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={editStockValue}
                                                    onChange={(e) => setEditStockValue(parseInt(e.target.value) || 0)}
                                                    className="w-20 text-center border border-primary rounded px-2 py-1 mx-auto focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span className="font-bold text-gray-700">{product.currentStock}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center flex justify-center">
                                            <StockBadge stock={product.currentStock} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {editingStockId === product.productId ? (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleUpdateStock(product.productId)}
                                                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                        title="Save"
                                                    >
                                                        <span className="material-symbols-outlined">check</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingStockId(null)}
                                                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                        title="Cancel"
                                                    >
                                                        <span className="material-symbols-outlined">close</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => startEditing(product)}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-semibold hover:underline"
                                                >
                                                    {t('common.edit') || 'Edit'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
