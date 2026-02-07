import { logger } from '@/src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { masterProductService, MasterProduct } from '../../services/masterProductService';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';

interface MasterProductGalleryProps {
    onBack: () => void;
}

export const MasterProductGallery: React.FC<MasterProductGalleryProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const toast = useToast();
    const { currentUser } = useStore();
    const [products, setProducts] = useState<MasterProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [categories, setCategories] = useState<string[]>(['Electronics', 'Industrial Tools', 'Office Supplies', 'Medical', 'Hardware']); // Mock initial categories + loaded ones

    // Claim Modal State
    const [claimingProduct, setClaimingProduct] = useState<MasterProduct | null>(null);
    const [claimData, setClaimData] = useState({
        price: 0,
        stock: 0,
        sku: '',
        leadTime: '3-5 Days (Standard)' // UI only for now
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadProducts();
    }, [searchTerm, selectedCategory]);

    const loadInitialData = async () => {
        try {
            const cats = await masterProductService.getCategories();
            // Merge unique categories
            setCategories(prev => Array.from(new Set([...prev, ...cats])));
        } catch (error) {
            logger.error('Failed to load categories', error);
        }
    };

    const loadProducts = async () => {
        setLoading(true);
        try {
            const data = await masterProductService.getMasterProducts(selectedCategory || undefined, searchTerm || undefined);
            setProducts(data || []);
        } catch (error) {
            logger.error('Failed to load master products', error);
            toast.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenClaimModal = (product: MasterProduct) => {
        setClaimingProduct(product);
        setClaimData({
            price: 0,
            stock: 0,
            sku: product.model_number || '',
            leadTime: '3-5 Days (Standard)'
        });
    };

    const handleClaimProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!claimingProduct || !currentUser) return;

        try {
            setSubmitting(true);
            await masterProductService.addToMyProducts(
                currentUser.id,
                claimingProduct,
                claimData.price,
                claimData.sku,
                claimData.stock
            );
            toast.success(t('supplier.products.addedFromMaster') || 'Product added to your catalog');
            setClaimingProduct(null);
            // We can optionally redirect back or just close modal
        } catch (error) {
            logger.error('Error adding product:', error);
            toast.error('Failed to add product');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-[1280px] mx-auto py-8 px-10 animate-in fade-in zoom-in-95 duration-300">
            {/* Page Heading */}
            <div className="flex flex-wrap justify-between items-end gap-3 mb-8">
                <div className="flex min-w-72 flex-col gap-2">
                    <p className="text-[#111418] text-4xl font-black leading-tight tracking-[-0.033em]">Join Master Catalog</p>
                    <p className="text-[#617589] text-base font-normal leading-normal max-w-2xl">
                        Browse admin-approved products. Link them to your store with your own pricing and stock level to start selling instantly.
                    </p>
                </div>
                <button
                    onClick={onBack}
                    className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-6 bg-white border border-[#dce0e5] text-[#111418] text-sm font-bold leading-normal shadow-sm hover:bg-slate-50 transition-all"
                >
                    <span className="truncate">View My Catalog</span>
                </button>
            </div>

            {/* Search & Filter Area */}
            <div className="bg-white rounded-xl shadow-sm border border-[#f0f2f4] mb-8 overflow-hidden">
                <div className="p-4 border-b border-[#f0f2f4]">
                    <label className="flex flex-col h-12 w-full">
                        <div className="flex w-full flex-1 items-stretch rounded-lg h-full border border-slate-200">
                            <div className="text-[#617589] flex bg-white items-center justify-center pl-4 rounded-l-lg" data-icon="search">
                                <span className="material-symbols-outlined">search</span>
                            </div>
                            <input
                                className="flex w-full min-w-0 flex-1 border-none bg-white focus:ring-0 text-[#111418] h-full placeholder:text-[#617589] px-4 text-base font-normal outline-none"
                                placeholder="Search by Product Name, SKU, or Category..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <div className="flex items-center px-4 bg-slate-50 border-l border-slate-200 cursor-pointer rounded-r-lg hover:bg-slate-100 transition-colors">
                                <span className="text-sm font-medium text-[#111418]">Advanced Filters</span>
                            </div>
                        </div>
                    </label>
                </div>
                <div className="flex gap-3 p-4 flex-wrap bg-slate-50/50">
                    {categories.slice(0, 5).map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
                            className={`flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-lg border px-4 transition-colors ${selectedCategory === cat
                                ? 'bg-blue-50 border-blue-500 text-blue-700'
                                : 'bg-white border-slate-200 text-[#111418] hover:border-[#137fec]'
                                }`}
                        >
                            <p className="text-sm font-medium">{cat}</p>
                            {selectedCategory === cat && <span className="material-symbols-outlined text-sm">check</span>}
                        </button>
                    ))}

                    <div className="h-9 w-px bg-slate-200 mx-2"></div>
                    <button
                        onClick={() => { setSelectedCategory(''); setSearchTerm(''); }}
                        className="flex h-9 items-center text-[#137fec] text-sm font-semibold hover:underline"
                    >
                        Clear all filters
                    </button>
                </div>
            </div>

            {/* List Header */}
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-[#111418] text-xl font-bold">Master Product List ({products.length} items)</h2>
                <div className="flex items-center gap-2 text-sm text-[#617589]">
                    <span>Sort by:</span>
                    <select className="bg-transparent border-none focus:ring-0 text-[#137fec] font-semibold py-0 cursor-pointer outline-none">
                        <option>Newest Added</option>
                        <option>Product Name (A-Z)</option>
                        <option>Category</option>
                    </select>
                </div>
            </div>

            {/* Product List */}
            <div className="flex flex-col gap-4">
                {loading ? (
                    [1, 2, 3].map(i => (
                        <div key={i} className="bg-white p-5 rounded-xl border border-[#f0f2f4] h-32 animate-pulse" />
                    ))
                ) : products.length === 0 ? (
                    <div className="text-center py-20 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                        <span className="material-symbols-outlined text-4xl text-neutral-400 mb-2">inventory_2</span>
                        <p className="text-neutral-600 font-medium">No products found.</p>
                    </div>
                ) : (
                    products.map(product => (
                        <div key={product.id} className="bg-white p-5 rounded-xl border border-[#f0f2f4] shadow-sm flex items-center gap-6 group hover:border-[#137fec]/50 transition-all">
                            <div className="w-24 h-24 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 border border-slate-100">
                                {product.image_url ? (
                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                        <span className="material-symbols-outlined text-3xl">image</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                                        {product.category}
                                    </span>
                                    {product.model_number && (
                                        <span className="text-xs text-[#617589]">SKU: {product.model_number}</span>
                                    )}
                                </div>
                                <h3 className="text-[#111418] text-lg font-bold truncate">{product.name}</h3>
                                <p className="text-[#617589] text-sm line-clamp-1 mt-1">{product.description}</p>
                                <div className="flex gap-4 mt-3">
                                    <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                                        <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                                        <span>Master ID: {product.id.substring(0, 8)}...</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                                        <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                                        <span>Standard Lead Time: 3-5 Days</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-3 px-4">
                                <button
                                    onClick={() => handleOpenClaimModal(product)}
                                    className="bg-[#137fec] text-white px-6 py-2.5 rounded-lg font-bold text-sm shadow-md shadow-blue-500/20 hover:bg-blue-600 transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[20px]">add_circle</span>
                                    Sell this item
                                </button>
                                <span className="text-[11px] text-[#617589] font-medium uppercase tracking-tighter">Available to list</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination Mock */}
            <div className="mt-4 flex items-center justify-between py-4">
                <p className="text-sm text-[#617589]">Showing <span className="font-bold text-[#111418]">1 - {products.length}</span> of <span className="font-bold text-[#111418]">{products.length}</span> products</p>
                <div className="flex gap-2">
                    <button
                        onClick={() => toast.info(t('common.previousPage') || 'Previous page is not available yet')}
                        className="size-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-[#137fec] transition-colors"
                    >
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button disabled className="size-10 rounded-lg bg-[#137fec] text-white font-bold text-sm flex items-center justify-center">1</button>
                    <button
                        onClick={() => toast.info(t('common.nextPage') || 'Next page is not available yet')}
                        className="size-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-[#137fec] transition-colors"
                    >
                        2
                    </button>
                    <button
                        onClick={() => toast.info(t('common.nextPage') || 'Next page is not available yet')}
                        className="size-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-[#137fec] transition-colors"
                    >
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
            </div>

            {/* Modal Overlay */}
            {claimingProduct && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-xl font-bold text-[#111418]">List Product for Sale</h3>
                            <button onClick={() => setClaimingProduct(null)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="px-8 py-6">
                            {/* Locked Info Section */}
                            <div className="flex gap-4 p-4 bg-[#137fec]/5 rounded-xl border border-[#137fec]/10 mb-6">
                                <div className="w-16 h-16 bg-white rounded-lg border border-slate-200 overflow-hidden flex-shrink-0">
                                    {claimingProduct.image_url ? (
                                        <img src={claimingProduct.image_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <span className="material-symbols-outlined text-slate-300">image</span>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#137fec] mb-0.5">
                                        <span className="material-symbols-outlined text-[14px]">lock</span>
                                        <span>MASTER CATALOG DATA</span>
                                    </div>
                                    <h4 className="text-[#111418] font-bold text-sm leading-tight">{claimingProduct.name}</h4>
                                    <p className="text-slate-500 text-xs mt-1">SKU: {claimingProduct.model_number || 'N/A'} | Category: {claimingProduct.category}</p>
                                </div>
                            </div>

                            {/* Form Fields */}
                            <form onSubmit={handleClaimProduct} className="space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-[#111418]">Your Selling Price (SAR)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">SAR</span>
                                            <input
                                                className="w-full pl-7 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] outline-none transition-all"
                                                placeholder="0.00"
                                                step="0.01"
                                                type="number"
                                                required
                                                value={claimData.price || ''}
                                                onChange={(e) => setClaimData({ ...claimData, price: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <p className="text-[11px] text-slate-500">Admin MSRP: Calculated</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-[#111418]">Stock Availability</label>
                                        <input
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] outline-none transition-all"
                                            placeholder="0 Units"
                                            type="number"
                                            required
                                            value={claimData.stock || ''}
                                            onChange={(e) => setClaimData({ ...claimData, stock: parseInt(e.target.value) })}
                                        />
                                        <p className="text-[11px] text-slate-500">Current on hand</p>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-bold text-[#111418]">Lead Time (Processing Days)</label>
                                    <select
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] outline-none transition-all"
                                        value={claimData.leadTime}
                                        onChange={(e) => setClaimData({ ...claimData, leadTime: e.target.value })}
                                    >
                                        <option>1-2 Days (Immediate)</option>
                                        <option>3-5 Days (Standard)</option>
                                        <option>7-10 Days (Extended)</option>
                                        <option>14+ Days (Custom Order)</option>
                                    </select>
                                    <p className="text-[11px] text-slate-500">Days to ship after order receipt</p>
                                </div>
                                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                                    <span className="material-symbols-outlined text-amber-500 text-[20px]">info</span>
                                    <p className="text-[11px] text-slate-600 leading-normal">
                                        By listing this item, you agree to fulfill orders using the master product descriptions, images, and technical specifications provided by the marketplace administrator.
                                    </p>
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setClaimingProduct(null)}
                                        className="flex-1 py-3 bg-white border border-slate-200 text-[#111418] font-bold rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="flex-1 py-3 bg-[#137fec] text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 hover:bg-blue-600 transition-all disabled:opacity-50"
                                    >
                                        {submitting ? 'Saving...' : 'Save & List Item'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
