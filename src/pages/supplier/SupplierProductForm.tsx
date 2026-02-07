import { logger } from '@/src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Product } from '../../types/types';
import { masterProductService, MasterProduct } from '../../services/masterProductService';
import { generateSKU } from '../../utils/skuGenerator';

interface SupplierProductFormProps {
    product: Partial<Product>;
    onBack: () => void;
    onSave: () => void;
    onChange: (updates: Partial<Product>) => void;
}

export const SupplierProductForm: React.FC<SupplierProductFormProps> = ({
    product,
    onBack,
    onSave,
    onChange
}) => {
    const { t } = useTranslation();

    const updateField = (field: keyof Product, value: any) => {
        onChange({ [field]: value });
    };

    const [suggestions, setSuggestions] = useState<MasterProduct[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (!product.name || product.name.length < 2) {
                setSuggestions([]);
                setShowSuggestions(false);
                return;
            }
            try {
                const results = await masterProductService.getMasterProducts(undefined, product.name);
                setSuggestions(results || []);
                setShowSuggestions(true);
            } catch (err) {
                logger.error("Error fetching suggestions:", err);
            }
        };
        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [product.name]);

    const handleSelectSuggestion = (mp: MasterProduct) => {
        onChange({
            name: mp.name,
            description: mp.description || product.description,
            category: mp.category,
            subcategory: mp.subcategory || product.subcategory,
            image: mp.image_url || product.image,
            brand: mp.brand || product.brand,
            sku: mp.model_number || product.sku
        });
        setShowSuggestions(false);
    };

    return (
        <div className="max-w-6xl mx-auto px-6 pb-20 animate-in fade-in duration-300">
            {/* Breadcrumbs (Nav) */}
            <nav className="flex items-center space-x-2 text-sm text-slate-500 mb-8">
                <button onClick={onBack} className="hover:text-[#137fec] transition-colors">{t('supplier.products.supplierPortal')}</button>
                <span className="material-symbols-outlined text-sm">chevron_right</span>
                <button onClick={onBack} className="hover:text-[#137fec] transition-colors">{t('supplier.products.inventory')}</button>
                <span className="material-symbols-outlined text-sm">chevron_right</span>
                <span className="font-medium text-slate-900">{product.id ? t('common.edit') : t('supplier.products.newProduct')}</span>
            </nav>

            {/* Header */}
            <header className="mb-10">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
                    {product.id ? t('supplier.products.editProduct') : t('supplier.products.newProduct')}
                </h1>
                <p className="text-slate-600">
                    {t('supplier.products.uploadHint') || 'Create a new product listing for the mwrd marketplace. All new submissions require admin approval.'}
                </p>
            </header>

            <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
                {/* Section 1: Product Info */}
                <section className="bg-white p-8 rounded-xl shadow border border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Product Name & Smart Match */}
                        <div className="space-y-4">
                            <label className="block text-sm font-semibold text-slate-700" htmlFor="product-name">
                                {t('supplier.products.itemName')}
                            </label>
                            <div className="relative group">
                                <input
                                    className="block w-full px-4 py-3 rounded-lg border-slate-300 focus:ring-[#137fec] focus:border-[#137fec] transition-all sm:text-sm"
                                    id="product-name"
                                    type="text"
                                    placeholder={t('supplier.products.namePlaceholder')}
                                    value={product.name || ''}
                                    onChange={e => updateField('name', e.target.value)}
                                />
                                <div className="mt-2 block">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">{t('supplier.products.smartMatch') || 'Smart Match Suggestions'}</label>
                                    <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden relative">
                                        {suggestions.length > 0 ? (
                                            <div className="max-h-40 overflow-y-auto">
                                                {suggestions.map((s) => (
                                                    <button
                                                        key={s.id}
                                                        className="w-full flex items-center px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors text-left border-b border-slate-100 last:border-0"
                                                        type="button"
                                                        onClick={() => handleSelectSuggestion(s)}
                                                    >
                                                        <span className="material-symbols-outlined text-lg mr-2 text-[#137fec]">auto_awesome</span>
                                                        <span className="truncate flex-1">{s.name}</span>
                                                        {s.brand && <span className="text-xs text-slate-400 ml-2">{s.brand}</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="px-4 py-3 text-sm text-slate-400 italic text-center">
                                                {product.name && product.name.length >= 2
                                                    ? (t('common.noResults') || 'No matches found in catalog')
                                                    : (t('supplier.products.startTyping') || 'Start typing to see suggestions...')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Categories */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-4">
                                <label className="block text-sm font-semibold text-slate-700" htmlFor="category">{t('supplier.products.category')}</label>
                                <select
                                    className="block w-full px-4 py-3 rounded-lg border-slate-300 focus:ring-[#137fec] focus:border-[#137fec] sm:text-sm"
                                    id="category"
                                    value={product.category || 'Office'}
                                    onChange={e => {
                                        const newCategory = e.target.value;
                                        const updates: Partial<Product> = { category: newCategory, subcategory: '' };
                                        // Auto-update SKU if it's a new product or doesn't have one yet
                                        if (!product.id || product.id.startsWith('new-')) {
                                            updates.sku = generateSKU(newCategory);
                                        }
                                        onChange(updates);
                                    }}
                                >
                                    <option value="Office">{t('supplier.products.officeSupplies')}</option>
                                    <option value="IT Supplies">{t('supplier.products.itTechnology')}</option>
                                    <option value="Breakroom">{t('supplier.products.breakroom')}</option>
                                    <option value="Janitorial">{t('supplier.products.janitorialCleaning')}</option>
                                    <option value="Maintenance">{t('supplier.products.maintenanceMRO')}</option>
                                    <option value="General">{t('supplier.products.general')}</option>
                                </select>
                            </div>
                            <div className="space-y-4">
                                <label className="block text-sm font-semibold text-slate-700" htmlFor="sub-category">{t('supplier.products.subCategory')}</label>
                                <select
                                    className="block w-full px-4 py-3 rounded-lg border-slate-300 focus:ring-[#137fec] focus:border-[#137fec] sm:text-sm"
                                    id="sub-category"
                                    value={product.subcategory || ''}
                                    onChange={e => updateField('subcategory', e.target.value)}
                                >
                                    <option value="">{t('supplier.products.selectSubCategory') || 'Select Sub-Category'}</option>
                                    {(() => {
                                        const CATEGORY_HIERARCHY: Record<string, string[]> = {
                                            'Office': ['Desks & Chairs', 'Filing & Storage', 'Writing Instruments', 'Paper & Notebooks', 'Desk Accessories'],
                                            'IT Supplies': ['Laptops & Computers', 'Monitors & Displays', 'Peripherals', 'Networking', 'Software'],
                                            'Breakroom': ['Coffee & Tea', 'Snacks & Beverages', 'Cutlery & Plates', 'Appliances', 'Cleaning Essentials'],
                                            'Janitorial': ['Cleaning Solutions', 'Paper Products', 'Trash Bags & Liners', 'Tools', 'Personal Care'],
                                            'Maintenance': ['Hand Tools', 'Power Tools', 'Safety Gear', 'Electrical', 'Plumbing', 'Fasteners']
                                        };
                                        const subs = CATEGORY_HIERARCHY[product.category || 'Office'] || [];
                                        return subs.map(sub => <option key={sub} value={sub}>{sub}</option>);
                                    })()}
                                </select>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 2: Product Media */}
                <section className="bg-white p-8 rounded-xl shadow border border-slate-200">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <h2 className="text-lg font-bold text-slate-900">{t('supplier.products.productImages')}</h2>
                        <div className="flex flex-wrap gap-2">
                            <button className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors" type="button">
                                <span className="material-symbols-outlined text-base mr-2">upload_file</span>
                                {t('supplier.products.clickToUpload')}
                            </button>
                            <button className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors" type="button">
                                <span className="material-symbols-outlined text-base mr-2">grid_view</span>
                                {t('supplier.products.adminGallery')}
                            </button>
                            <button
                                onClick={() => {
                                    const url = prompt(t('supplier.products.addImagesUrl'));
                                    if (url) updateField('image', url);
                                }}
                                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
                                type="button"
                            >
                                <span className="material-symbols-outlined text-base mr-2">link</span>
                                {t('supplier.products.addImagesUrl')}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {product.image ? (
                            <div className="aspect-square rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center relative group overflow-hidden">
                                <img alt="Product Preview" className="object-contain w-full h-full" src={product.image} />
                                <button
                                    onClick={() => updateField('image', null)}
                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                    type="button"
                                >
                                    <span className="material-symbols-outlined text-white">delete</span>
                                </button>
                            </div>
                        ) : (
                            <div className="aspect-square rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
                                <span className="material-symbols-outlined text-slate-300 text-3xl">image</span>
                            </div>
                        )}
                        {/* Placeholders */}
                        <div className="aspect-square rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
                            <span className="material-symbols-outlined text-slate-300 text-3xl">image</span>
                        </div>
                        <div className="aspect-square rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
                            <span className="material-symbols-outlined text-slate-300 text-3xl">image</span>
                        </div>

                        <label className="aspect-square rounded-lg border-2 border-dashed border-[#137fec]/30 bg-[#137fec]/5 hover:bg-[#137fec]/10 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 group">
                            <input className="hidden" type="file" />
                            <span className="material-symbols-outlined text-[#137fec] group-hover:scale-110 transition-transform">cloud_upload</span>
                            <span className="text-xs font-semibold text-[#137fec]">{t('supplier.products.uploadZone')}</span>
                        </label>
                    </div>
                </section>

                {/* Section 3: Technical Specifications */}
                <section className="bg-white p-8 rounded-xl shadow border border-slate-200">
                    <h2 className="text-lg font-bold text-slate-900 mb-6">{t('supplier.products.technicalSpecs') || 'Technical Specifications'}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-slate-700" htmlFor="sku">{t('supplier.products.productId') || 'SKU Number'}</label>
                            <input
                                className="block w-full px-4 py-3 rounded-lg border-slate-300 focus:ring-[#137fec] focus:border-[#137fec] sm:text-sm"
                                id="sku"
                                type="text"
                                placeholder={t('supplier.products.skuPlaceholder')}
                                value={product.sku || ''}
                                disabled
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-slate-700" htmlFor="material">{t('supplier.products.material') || 'Material'}</label>
                            <input
                                className="block w-full px-4 py-3 rounded-lg border-slate-300 focus:ring-[#137fec] focus:border-[#137fec] sm:text-sm"
                                id="material"
                                type="text"
                                placeholder={t('supplier.products.materialPlaceholder') || 'e.g. Forged Steel, Polymer'}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-slate-700" htmlFor="weight">{t('supplier.products.weight') || 'Weight'}</label>
                            <div className="relative">
                                <input
                                    className="block w-full px-4 py-3 rounded-lg border-slate-300 focus:ring-[#137fec] focus:border-[#137fec] sm:text-sm"
                                    id="weight"
                                    type="text"
                                    placeholder="0.00"
                                />
                                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                                    <span className="text-slate-500 text-sm">{t('common.lbs')}</span>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-slate-700" htmlFor="price">{t('supplier.products.costPrice')}</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                    <span className="text-slate-500 text-sm">SAR</span>
                                </div>
                                <input
                                    className="block w-full pl-12 pr-4 py-3 rounded-lg border-slate-300 focus:ring-[#137fec] focus:border-[#137fec] sm:text-sm"
                                    id="price"
                                    type="number"
                                    placeholder="0.00"
                                    value={product.supplierPrice || ''}
                                    onChange={e => updateField('supplierPrice', parseFloat(e.target.value))}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Footer Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-4">
                    <button
                        onClick={onBack}
                        className="w-full sm:w-auto px-8 py-3 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                        type="button"
                    >
                        {t('common.cancel') || 'Discard Draft'}
                    </button>
                    <button
                        type="submit"
                        className="w-full sm:w-auto bg-[#137fec] hover:bg-blue-700 text-white px-10 py-3 rounded-lg font-bold shadow-lg shadow-[#137fec]/20 transition-all flex items-center justify-center"
                    >
                        <span className="material-symbols-outlined text-lg mr-2">send</span>
                        {t('supplier.products.saveChanges') || 'Submit for Admin Approval'}
                    </button>
                </div>
            </form>
        </div>
    );
};
