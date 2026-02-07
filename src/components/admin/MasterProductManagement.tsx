import { logger } from '@/src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { masterProductService, MasterProduct, MasterProductInsert } from '../../services/masterProductService';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabase';
import { generateSKU } from '../../utils/skuGenerator';
import { ConfirmDialog } from '../ui/ConfirmDialog';


const MasterProductManagement = () => {
    const { t } = useTranslation();
    const toast = useToast();
    const [products, setProducts] = useState<MasterProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState(''); // Filter state
    // Category Data
    const CATEGORY_HIERARCHY: Record<string, string[]> = {
        'Office': ['Paper', 'Pens', 'Notepads & Notebooks', 'Desk Accessories', 'Filing & Storage', 'Printers & Ink'],
        'IT Supplies': ['Laptops', 'Monitors', 'Audio', 'Networking', 'Peripherals', 'Storage'],
        'Breakroom': ['Coffee & Tea', 'Snacks & Food', 'Drinks'],
        'Janitorial': ['Cleaning Chemicals', 'Paper Products', 'Waste Liners & Receptacles', 'Cleaning Tools', 'Mops & Buckets', 'Hand Sanitizers & Dispensers', 'Restroom Supplies', 'Safety Gear & Apparel'],
        'Maintenance': ['Plumbing', 'Electrical', 'Lighting', 'Tools', 'HVAC']
    };
    const categories = Object.keys(CATEGORY_HIERARCHY);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<MasterProduct | null>(null);
    const [pendingDeleteProduct, setPendingDeleteProduct] = useState<MasterProduct | null>(null);
    const [isDeletingProduct, setIsDeletingProduct] = useState(false);

    // Form state with subcategory support
    const [formData, setFormData] = useState<Partial<MasterProductInsert> & { subcategory?: string }>({
        name: '',
        description: '',
        category: '',
        // @ts-ignore - subcategory might not be in DB types yet
        subcategory: '',
        brand: '',
        model_number: '',
        image_url: ''
    });

    // Mock tech specs state
    const [techSpecs, setTechSpecs] = useState<{ key: string, value: string }[]>([
        { key: 'Material', value: 'Stainless Steel 316' },
        { key: 'Voltage', value: '220V / 3-Phase' }
    ]);

    useEffect(() => {
        loadData();
    }, [category, search]);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await masterProductService.getMasterProducts(category, search);
            setProducts(data || []);
        } catch (error) {
            logger.error('Error loading master products:', error);
            toast.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    const generateSKU = (category: string = '') => {
        const prefix = category ? category.substring(0, 3).toUpperCase() : 'MWRD';
        const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        return `${prefix}-${random}`;
    };

    const handleOpenModal = (product?: MasterProduct) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.name,
                description: product.description,
                category: product.category,
                // @ts-ignore
                subcategory: product.subcategory || '',
                brand: product.brand,
                model_number: product.model_number,
                image_url: product.image_url
            });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '',
                description: '',
                category: '',
                // @ts-ignore
                subcategory: '',
                brand: '',
                model_number: generateSKU(), // Auto-generate SKU
                image_url: ''
            });
            setTechSpecs([
                { key: 'Material', value: 'Stainless Steel 316' },
                { key: 'Voltage', value: '220V / 3-Phase' }
            ]);
        }
        setIsModalOpen(true);
    };

    const handleAddSpec = () => {
        setTechSpecs([...techSpecs, { key: '', value: '' }]);
    };

    const handleRemoveSpec = (index: number) => {
        setTechSpecs(techSpecs.filter((_, i) => i !== index));
    };

    const handleSpecChange = (index: number, field: 'key' | 'value', val: string) => {
        const newSpecs = [...techSpecs];
        newSpecs[index][field] = val;
        setTechSpecs(newSpecs);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (!formData.name || !formData.category) {
                toast.error(t('admin.masterProducts.errors.nameCategoryRequired'));
                return;
            }

            // Append specs to description for now since they aren't in schema
            const specsText = techSpecs.map(s => `${s.key}: ${s.value}`).join('\n');
            const fullDescription = formData.description ? formData.description : specsText;
            // Better logic: If description is empty, use specs. If not, keeping as is for now implies manual update.
            // Actually, let's just make sure we are not losing data.
            // Ideally, update standard description logic.

            const submitData = {
                ...formData,
                // description: fullDescription  // Optional: override description with combined data if desired
            };

            if (editingProduct) {
                await masterProductService.updateMasterProduct(editingProduct.id, submitData);
                toast.success(t('admin.masterProducts.success.productUpdated'));
            } else {
                await masterProductService.createMasterProduct(submitData as MasterProductInsert);
                toast.success(t('admin.masterProducts.success.productCreated'));
            }
            setIsModalOpen(false);
            loadData();
        } catch (error) {
            logger.error('Error saving product:', error);
            toast.error(t('admin.masterProducts.errors.saveFailed'));
        }
    };

    const handleDelete = async (id: string) => {
        const product = products.find((item) => item.id === id);
        if (!product) return;
        setPendingDeleteProduct(product);
    };

    const handleConfirmDelete = async () => {
        if (!pendingDeleteProduct) return;

        try {
            setIsDeletingProduct(true);
            await masterProductService.deleteMasterProduct(pendingDeleteProduct.id);
            toast.success(t('admin.masterProducts.success.productDeleted'));
            setPendingDeleteProduct(null);
            loadData();
        } catch (error) {
            logger.error('Error deleting product:', error);
            toast.error(t('admin.masterProducts.errors.deleteFailed'));
        } finally {
            setIsDeletingProduct(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-800">{t('admin.masterProducts.title')}</h1>
                    <p className="text-neutral-500">{t('admin.masterProducts.subtitle')}</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-bold shadow-sm"
                >
                    <span className="material-symbols-outlined">add</span>
                    {t('admin.masterProducts.addNew')}
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-4 bg-white p-4 rounded-xl border border-neutral-200">
                <div className="flex-1 relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">search</span>
                    <input
                        type="text"
                        placeholder={t('admin.masterProducts.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[200px]"
                >
                    <option value="">{t('admin.masterProducts.allCategories')}</option>
                    {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                            <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('admin.masterProducts.table.product')}</th>
                            <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('admin.masterProducts.table.category')}</th>
                            <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('admin.masterProducts.table.brandModel')}</th>
                            <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('admin.masterProducts.table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-neutral-500">{t('common.loading')}</td>
                            </tr>
                        ) : products.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-neutral-500">{t('admin.masterProducts.noProducts')}</td>
                            </tr>
                        ) : (
                            products.map(product => (
                                <tr key={product.id} className="hover:bg-neutral-50">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center overflow-hidden border border-neutral-200">
                                                {product.image_url ? (
                                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="material-symbols-outlined text-neutral-400">image</span>
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-medium text-neutral-800">{product.name}</div>
                                                <div className="text-xs text-neutral-500 truncate max-w-[200px]">{product.description}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-neutral-600">{product.category}</td>
                                    <td className="px-6 py-4 text-sm text-neutral-600">
                                        {product.brand && <div className="font-medium">{product.brand}</div>}
                                        {product.model_number && <div className="text-xs text-neutral-500">{product.model_number}</div>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleOpenModal(product)}
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                title="Edit"
                                            >
                                                <span className="material-symbols-outlined text-lg">edit</span>
                                            </button>
                                            <button
                                                onClick={() => handleDelete(product.id)}
                                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                title="Delete"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Full Screen Create/Edit Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-background-light dark:bg-background-dark z-[100] overflow-y-auto animate-in slide-in-from-bottom-10 duration-200">
                    <form onSubmit={handleSubmit} className="min-h-screen flex flex-col bg-slate-50">
                        {/* Header */}
                        <header className="flex items-center justify-between border-b border-solid border-[#f0f2f4] bg-white px-8 py-4 sticky top-0 z-50 shadow-sm">
                            <div className="flex items-center gap-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                    <span className="material-symbols-outlined text-gray-600">close</span>
                                </button>
                                <h1 className="text-[#111418] text-xl font-bold leading-tight">
                                    {editingProduct ? t('admin.masterProducts.editProduct') : t('admin.masterProducts.createProduct')}
                                </h1>
                            </div>
                            <div className="flex items-center gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 transition-all">
                                    {t('common.cancel')}
                                </button>
                                <button type="submit" className="px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-bold shadow-sm hover:bg-primary/90 transition-all flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">save</span>
                                    {editingProduct ? t('admin.masterProducts.updateProduct') : t('admin.masterProducts.saveProduct')}
                                </button>
                            </div>
                        </header>

                        <main className="max-w-[1200px] mx-auto p-8 flex flex-col gap-8 pb-20 w-full">
                            {/* Product Identity */}
                            <section className="bg-white rounded-xl border border-[#dbe0e6] shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-gray-100">
                                    <h2 className="text-lg font-bold">{t('admin.masterProducts.identity.title')}</h2>
                                    <p className="text-sm text-gray-500 mt-1">{t('admin.masterProducts.identity.description')}</p>
                                </div>
                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold mb-2 text-gray-700">{t('admin.masterProducts.identity.globalName')}</label>
                                        <input
                                            className="w-full rounded-lg border-gray-200 focus:ring-primary focus:border-primary px-4 py-2.5"
                                            placeholder="e.g. High-Pressure Industrial Centrifugal Pump"
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-2 text-gray-700">{t('admin.masterProducts.identity.sku')}</label>
                                        <div className="relative">
                                            <input
                                                className="w-full rounded-lg border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed px-4 py-2.5"
                                                placeholder="Auto-generated"
                                                type="text"
                                                readOnly
                                                disabled
                                                value={formData.model_number || ''}
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-gray-400 font-medium bg-gray-200 px-2 py-0.5 rounded">AUTO</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-2 text-gray-700">{t('admin.masterProducts.identity.category')}</label>
                                        <div className="relative">
                                            <select
                                                className="w-full rounded-lg border-gray-200 focus:ring-primary focus:border-primary px-4 py-2.5 appearance-none"
                                                required
                                                value={formData.category}
                                                onChange={e => {
                                                    const newCategory = e.target.value;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        category: newCategory,
                                                        subcategory: '', // Reset subcategory when category changes
                                                        // Auto-update SKU if creating new product
                                                        model_number: !editingProduct ? generateSKU(newCategory) : prev.model_number
                                                    }));
                                                }}
                                            >
                                                <option value="">{t('admin.masterProducts.identity.selectCategory')}</option>
                                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <span className="material-symbols-outlined absolute right-3 top-2.5 text-gray-400 pointer-events-none">expand_more</span>
                                        </div>
                                    </div>
                                    {formData.category && (
                                        <div>
                                            <label className="block text-sm font-semibold mb-2 text-gray-700">{t('admin.masterProducts.identity.subCategory')}</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full rounded-lg border-gray-200 focus:ring-primary focus:border-primary px-4 py-2.5 appearance-none"
                                                    value={formData.subcategory || ''}
                                                    onChange={e => setFormData({ ...formData, subcategory: e.target.value })}
                                                >
                                                    <option value="">{t('admin.masterProducts.identity.selectSubCategory')}</option>
                                                    {CATEGORY_HIERARCHY[formData.category]?.map(sc => (
                                                        <option key={sc} value={sc}>{sc}</option>
                                                    ))}
                                                </select>
                                                <span className="material-symbols-outlined absolute right-3 top-2.5 text-gray-400 pointer-events-none">expand_more</span>
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-semibold mb-2 text-gray-700">{t('admin.masterProducts.identity.brand')}</label>
                                        <input
                                            className="w-full rounded-lg border-gray-200 focus:ring-primary focus:border-primary px-4 py-2.5"
                                            placeholder="e.g. Bosch"
                                            type="text"
                                            value={formData.brand || ''}
                                            onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Standard Assets Gallery */}
                            <section className="bg-white rounded-xl border border-[#dbe0e6] shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-lg font-bold">{t('admin.masterProducts.assets.title')}</h2>
                                        <p className="text-sm text-gray-500 mt-1">{t('admin.masterProducts.assets.description')}</p>
                                    </div>
                                    <button type="button" className="text-primary text-sm font-bold flex items-center gap-1">
                                        <span className="material-symbols-outlined text-base">cloud_upload</span>
                                        {t('admin.masterProducts.assets.bulkUpload')}
                                    </button>
                                </div>
                                <div className="p-6">
                                    <div className="mb-4">
                                        <label className="block text-sm font-semibold mb-2 text-gray-700">{t('admin.masterProducts.assets.primaryUrl')}</label>
                                        <input
                                            type="url"
                                            className="w-full rounded-lg border-gray-200 focus:ring-primary focus:border-primary px-4 py-2.5"
                                            placeholder="https://..."
                                            value={formData.image_url || ''}
                                            onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        <div className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary hover:text-primary transition-all cursor-pointer bg-gray-50/50">
                                            <span className="material-symbols-outlined text-3xl">add_photo_alternate</span>
                                            <span className="text-xs font-bold text-center px-4">{t('admin.masterProducts.assets.dragDrop')}</span>
                                        </div>
                                        {formData.image_url && (
                                            <div className="relative aspect-square rounded-xl border border-gray-200 overflow-hidden group">
                                                <img alt="Product" className="w-full h-full object-cover" src={formData.image_url} />
                                                <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 flex items-center justify-between">
                                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                                        <input defaultChecked className="rounded-full text-primary focus:ring-0 w-3.5 h-3.5" type="checkbox" />
                                                        <span className="text-[10px] text-white font-bold uppercase">{t('admin.masterProducts.assets.primary')}</span>
                                                    </label>
                                                    <button type="button" onClick={() => setFormData({ ...formData, image_url: '' })} className="text-white/80 hover:text-white">
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        {/* Placeholders for grid visual */}
                                        <div className="aspect-square rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                                            <span className="text-xs text-gray-300">Slot 2</span>
                                        </div>
                                        <div className="aspect-square rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                                            <span className="text-xs text-gray-300">Slot 3</span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Technical Specifications */}
                                <section className="bg-white rounded-xl border border-[#dbe0e6] shadow-sm overflow-hidden flex flex-col">
                                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                        <div>
                                            <h2 className="text-lg font-bold">{t('admin.masterProducts.specs.title')}</h2>
                                            <p className="text-sm text-gray-500 mt-1">{t('admin.masterProducts.specs.description')}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAddSpec}
                                            className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-gray-200 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-sm">add</span>
                                            {t('admin.masterProducts.specs.addPair')}
                                        </button>
                                    </div>
                                    <div className="p-6 flex flex-col gap-3">
                                        {techSpecs.map((spec, idx) => (
                                            <div key={idx} className="flex gap-3">
                                                <input
                                                    className="flex-1 rounded-lg border-gray-200 focus:ring-primary px-4 py-2 text-sm"
                                                    type="text"
                                                    placeholder={t('admin.masterProducts.specs.keyPlaceholder')}
                                                    value={spec.key}
                                                    onChange={e => handleSpecChange(idx, 'key', e.target.value)}
                                                />
                                                <input
                                                    className="flex-1 rounded-lg border-gray-200 focus:ring-primary px-4 py-2 text-sm"
                                                    type="text"
                                                    placeholder={t('admin.masterProducts.specs.valuePlaceholder')}
                                                    value={spec.value}
                                                    onChange={e => handleSpecChange(idx, 'value', e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSpec(idx)}
                                                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined">remove_circle_outline</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Standardized Description */}
                                <section className="bg-white rounded-xl border border-[#dbe0e6] shadow-sm overflow-hidden flex flex-col">
                                    <div className="p-6 border-b border-gray-100">
                                        <h2 className="text-lg font-bold">{t('admin.masterProducts.description.title')}</h2>
                                        <p className="text-sm text-gray-500 mt-1">{t('admin.masterProducts.description.subtitle')}</p>
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-4">
                                            <div className="flex items-center gap-1 border-r border-gray-200 pr-4">
                                                <button type="button" className="p-1 hover:bg-gray-200 rounded text-gray-500"><span className="material-symbols-outlined text-xl">format_bold</span></button>
                                                <button type="button" className="p-1 hover:bg-gray-200 rounded text-gray-500"><span className="material-symbols-outlined text-xl">format_italic</span></button>
                                                <button type="button" className="p-1 hover:bg-gray-200 rounded text-gray-500"><span className="material-symbols-outlined text-xl">format_underlined</span></button>
                                            </div>
                                            <div className="flex items-center gap-1 border-r border-gray-200 pr-4">
                                                <button type="button" className="p-1 hover:bg-gray-200 rounded text-gray-500"><span className="material-symbols-outlined text-xl">format_list_bulleted</span></button>
                                                <button type="button" className="p-1 hover:bg-gray-200 rounded text-gray-500"><span className="material-symbols-outlined text-xl">format_list_numbered</span></button>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button type="button" className="p-1 hover:bg-gray-200 rounded text-gray-500"><span className="material-symbols-outlined text-xl">link</span></button>
                                                <button type="button" className="p-1 hover:bg-gray-200 rounded text-gray-500"><span className="material-symbols-outlined text-xl">image</span></button>
                                            </div>
                                        </div>
                                        <textarea
                                            className="flex-1 w-full border-none focus:ring-0 p-6 text-sm leading-relaxed min-h-[200px]"
                                            placeholder={t('admin.masterProducts.description.placeholder')}
                                            value={formData.description || ''}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        />
                                    </div>
                                </section>
                            </div>
                        </main>
                    </form>
                </div>
            )}

            <ConfirmDialog
                isOpen={Boolean(pendingDeleteProduct)}
                onClose={() => setPendingDeleteProduct(null)}
                onConfirm={handleConfirmDelete}
                title={t('admin.masterProducts.confirmDeleteTitle', 'Delete Product')}
                message={t('admin.masterProducts.confirmDelete')}
                confirmText={t('common.delete', 'Delete')}
                type="danger"
                isLoading={isDeletingProduct}
            />
        </div>
    );
};

export default MasterProductManagement;
