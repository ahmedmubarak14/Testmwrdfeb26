import { logger } from '@/src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    inventoryService,
    StockInfo,
    LOW_STOCK_THRESHOLD
} from '../../services/inventoryService';
import { StockBadge } from '../inventory/StockBadge';
import { useToast } from '../../hooks/useToast';

type FilterType = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

export const InventoryDashboard: React.FC = () => {
    const { t } = useTranslation();
    const toast = useToast();

    const [products, setProducts] = useState<StockInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [summary, setSummary] = useState({
        totalProducts: 0,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
        totalStockValue: 0
    });

    useEffect(() => {
        loadInventory();
    }, []);

    const loadInventory = async () => {
        try {
            setLoading(true);
            const [productsData, summaryData] = await Promise.all([
                inventoryService.getAllProductsWithStock(),
                inventoryService.getInventorySummary()
            ]);
            setProducts(productsData);
            setSummary(summaryData);
        } catch (error) {
            logger.error('Error loading inventory:', error);
            toast.error(t('inventory.loadError') || 'Failed to load inventory');
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = products.filter(product => {
        // Apply status filter
        if (filter !== 'all' && product.status !== filter) return false;

        // Apply search filter
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            return (
                product.productName.toLowerCase().includes(search) ||
                product.supplierName?.toLowerCase().includes(search) ||
                product.category?.toLowerCase().includes(search)
            );
        }

        return true;
    });

    const handleExport = () => {
        const csvContent = [
            ['Product Name', 'Stock', 'Status', 'Supplier', 'Category'].join(','),
            ...filteredProducts.map(p => [
                `"${p.productName}"`,
                p.currentStock,
                p.status,
                `"${p.supplierName}"`,
                `"${p.category || 'N/A'}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        toast.success(t('inventory.exportSuccess') || 'Inventory exported successfully');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-neutral-800">
                        {t('inventory.title') || 'Inventory Management'}
                    </h2>
                    <p className="text-neutral-500">
                        {t('inventory.description') || 'Monitor and manage product stock levels'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadInventory}
                        className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <span className="material-symbols-outlined text-neutral-600">refresh</span>
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">download</span>
                        {t('common.export') || 'Export'}
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <span className="material-symbols-outlined text-blue-600">inventory_2</span>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">{t('inventory.totalProducts') || 'Total Products'}</p>
                            <p className="text-2xl font-bold text-neutral-800">{summary.totalProducts}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                            <span className="material-symbols-outlined text-green-600">check_circle</span>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">{t('inventory.inStock') || 'In Stock'}</p>
                            <p className="text-2xl font-bold text-green-600">{summary.inStock}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <span className="material-symbols-outlined text-amber-600">warning</span>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">{t('inventory.lowStock') || 'Low Stock'}</p>
                            <p className="text-2xl font-bold text-amber-600">{summary.lowStock}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                            <span className="material-symbols-outlined text-red-600">cancel</span>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">{t('inventory.outOfStock') || 'Out of Stock'}</p>
                            <p className="text-2xl font-bold text-red-600">{summary.outOfStock}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Low Stock Alert */}
            {summary.lowStock > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                    <span className="material-symbols-outlined text-amber-600">warning</span>
                    <div>
                        <p className="font-medium text-amber-800">
                            {t('inventory.lowStockAlert') || 'Low Stock Alert'}
                        </p>
                        <p className="text-sm text-amber-700">
                            {t('inventory.lowStockMessage', { count: summary.lowStock }) ||
                                `${summary.lowStock} products have ${LOW_STOCK_THRESHOLD} or fewer units remaining`}
                        </p>
                    </div>
                </div>
            )}

            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                        search
                    </span>
                    <input
                        type="text"
                        placeholder={t('inventory.searchPlaceholder') || 'Search products, suppliers...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="flex gap-2">
                    {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as FilterType[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === f
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                        >
                            {t(`inventory.filter.${f}`) ||
                                f.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-neutral-600">
                                    {t('inventory.productName') || 'Product Name'}
                                </th>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-neutral-600">
                                    {t('inventory.supplier') || 'Supplier'}
                                </th>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-neutral-600">
                                    {t('inventory.category') || 'Category'}
                                </th>
                                <th className="text-center px-6 py-3 text-sm font-semibold text-neutral-600">
                                    {t('inventory.stock') || 'Stock'}
                                </th>
                                <th className="text-center px-6 py-3 text-sm font-semibold text-neutral-600">
                                    {t('inventory.status') || 'Status'}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-neutral-500">
                                        <span className="material-symbols-outlined text-4xl mb-2">inventory_2</span>
                                        <p>{t('inventory.noProducts') || 'No products found'}</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((product) => (
                                    <tr key={product.productId} className="hover:bg-neutral-50">
                                        <td className="px-6 py-4">
                                            <p className="font-medium text-neutral-800">{product.productName}</p>
                                            <p className="text-xs text-neutral-400">
                                                ID: {product.productId.slice(0, 8)}...
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 text-neutral-600">
                                            {product.supplierName}
                                        </td>
                                        <td className="px-6 py-4 text-neutral-600">
                                            {product.category || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="font-bold text-neutral-800">
                                                {product.currentStock}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <StockBadge stock={product.currentStock} size="sm" showCount={false} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer Stats */}
            <div className="text-sm text-neutral-500 text-center">
                {t('inventory.showing', { count: filteredProducts.length, total: products.length }) ||
                    `Showing ${filteredProducts.length} of ${products.length} products`}
            </div>
        </div>
    );
};

export default InventoryDashboard;
