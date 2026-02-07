import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, Product, Quote, OrderStatus } from '../../types/types';
import { api } from '../../services/api';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ProfilePictureUpload } from '../../components/ProfilePictureUpload';
import { SearchBar } from '../../components/ui/SearchBar';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';
import { masterProductService, MasterProduct } from '../../services/masterProductService';
import { transactionsService, Transaction } from '../../services/transactionsService';
import { StockUpdateModal } from '../../components/inventory/StockUpdateModal';
import { SupplierInventory } from '../../components/supplier/SupplierInventory';
import { MasterProductGallery } from '../../components/supplier/MasterProductGallery';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { generateSKU } from '../../utils/skuGenerator';
import { supabase } from '../../lib/supabase';
import { SupplierProductForm } from './SupplierProductForm';
import { canTransitionOrderStatus } from '../../services/orderStatusService';
import { logger } from '../../utils/logger';

interface SupplierPortalProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

export const SupplierPortal: React.FC<SupplierPortalProps> = ({ activeTab, onNavigate }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { products: allProducts, rfqs: allRfqs, quotes: allQuotes, currentUser, addProduct, updateProduct, deleteProduct, addQuote } = useStore();
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [selectedQuoteRFQId, setSelectedQuoteRFQId] = useState<string | null>(null);
  const [pendingRemoveProduct, setPendingRemoveProduct] = useState<Product | null>(null);
  const [isRemovingProduct, setIsRemovingProduct] = useState(false);
  const bulkUploadInputRef = useRef<HTMLInputElement>(null);

  // Reset editing state when changing tabs
  useEffect(() => {
    if (activeTab !== 'products') {
      setEditingProduct(null);
    }
    if (activeTab !== 'quotes') {
      setSelectedQuoteRFQId(null);
    }
  }, [activeTab]);

  const handleDraftQuote = (rfqId: string) => {
    setSelectedQuoteRFQId(rfqId);
    onNavigate('quotes');
  };

  const handleRemoveProduct = async (product: Product) => {
    setPendingRemoveProduct(product);
  };

  const handleConfirmRemoveProduct = async () => {
    if (!pendingRemoveProduct) return;
    try {
      setIsRemovingProduct(true);
      await deleteProduct(pendingRemoveProduct.id);
      toast.success(t('supplier.products.removed') || 'Product removed');
      setPendingRemoveProduct(null);
    } catch (error) {
      logger.error('Error removing product:', error);
      toast.error(t('errors.deleteFailed') || 'Failed to remove product');
    } finally {
      setIsRemovingProduct(false);
    }
  };

  const handleBulkUploadClick = () => {
    bulkUploadInputRef.current?.click();
  };

  const handleBulkUploadSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!currentUser) {
      toast.error(t('errors.unauthorized') || 'You must be signed in');
      e.target.value = '';
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'csv') {
      toast.info(t('supplier.products.bulkUploadCsvOnly') || 'Please upload a CSV file for bulk import.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const rows = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (rows.length < 2) {
        toast.error(t('supplier.products.bulkUploadEmpty') || 'CSV must include a header and at least one product row.');
        return;
      }

      const headers = rows[0].split(',').map((value) => value.trim().toLowerCase());
      const getIndex = (key: string, fallback: number) => {
        const index = headers.indexOf(key);
        return index >= 0 ? index : fallback;
      };

      const nameIndex = getIndex('name', 0);
      const descriptionIndex = getIndex('description', 1);
      const categoryIndex = getIndex('category', 2);
      const subcategoryIndex = getIndex('subcategory', 3);
      const costPriceIndex = getIndex('costprice', 4);
      const skuIndex = getIndex('sku', 5);
      const imageIndex = getIndex('image', 6);

      let createdCount = 0;
      rows.slice(1).forEach((row, index) => {
        const cells = row.split(',').map((value) => value.trim());
        const name = cells[nameIndex];
        if (!name) return;

        const parsedCost = Number(cells[costPriceIndex] || '0');
        const costPrice = Number.isFinite(parsedCost) ? parsedCost : 0;
        addProduct({
          id: `prod-bulk-${Date.now()}-${index}`,
          supplierId: currentUser.id,
          name,
          description: cells[descriptionIndex] || '',
          category: cells[categoryIndex] || 'General',
          subcategory: cells[subcategoryIndex] || '',
          image: cells[imageIndex] || 'https://images.unsplash.com/photo-1586769852044-692d6e3703f0?auto=format&fit=crop&q=80&w=800',
          status: 'PENDING',
          supplierPrice: costPrice,
          sku: cells[skuIndex] || `SKU-BULK-${Date.now()}-${index}`,
        });
        createdCount += 1;
      });

      if (createdCount === 0) {
        toast.error(t('supplier.products.bulkUploadNoValidRows') || 'No valid product rows were found in the CSV file.');
      } else {
        toast.success(
          t('supplier.products.bulkUploadCreated', { count: createdCount })
          || `Imported ${createdCount} product${createdCount === 1 ? '' : 's'} successfully.`
        );
      }
    };

    reader.onerror = () => {
      toast.error(t('errors.saveFailed') || 'Failed to read uploaded file');
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveProduct = async () => {
    if (!editingProduct || !editingProduct.name || !currentUser) {
      toast.error(t('errors.requiredFields'));
      return;
    }

    try {
      if (editingProduct.id) {
        // Update existing
        await updateProduct(editingProduct.id, editingProduct);
        toast.success(t('supplier.products.changesSaved'));
      } else {
        // Create new
        const newProduct: Product = {
          id: `prod-${Date.now()}`,
          supplierId: currentUser.id,
          name: editingProduct.name,
          description: editingProduct.description || '',
          category: editingProduct.category || 'General',
          subcategory: editingProduct.subcategory,
          image: editingProduct.image || 'https://images.unsplash.com/photo-1586769852044-692d6e3703f0?auto=format&fit=crop&q=80&w=800',
          status: 'PENDING',
          supplierPrice: editingProduct.supplierPrice || 0,
          sku: editingProduct.sku || `SKU-${Date.now()}`,

        };
        await addProduct(newProduct);
        toast.success(t('supplier.products.created') || 'Product created successfully');
      }
      setEditingProduct(null);
    } catch (error) {
      logger.error('Error saving product:', error);
      toast.error(t('errors.saveFailed'));
    }
  };

  // --- VIEWS ---

  const DashboardView = () => {
    const supplierId = currentUser?.id;
    const supplierQuotes = allQuotes.filter((quote) => supplierId && quote.supplierId === supplierId);
    const quotedRfqIds = new Set(supplierQuotes.map((quote) => quote.rfqId));
    const openRfqs = allRfqs
      .filter((rfq) => rfq.status === 'OPEN' && !quotedRfqIds.has(rfq.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const pendingRFQs = openRfqs.slice(0, 4);
    const supplierProductsCount = allProducts.filter((product) => supplierId && product.supplierId === supplierId).length;

    return (
      <div data-testid="supplier-dashboard-view" className="space-y-8 animate-in fade-in duration-500 p-4 md:p-8 lg:p-12">
        {/* Header Section */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-neutral-800 text-3xl font-bold tracking-tight">{t('supplier.dashboard.title')}</h1>
            <p className="text-neutral-500 text-base font-normal">{t('supplier.dashboard.welcomeMessage')}</p>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-xl p-6 border border-neutral-200 bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <p className="text-neutral-700 text-base font-medium leading-normal">{t('supplier.dashboard.newRfqs')}</p>
              <span className="material-symbols-outlined text-amber-500">new_releases</span>
            </div>
            <p className="text-amber-500 tracking-tight text-4xl font-bold leading-tight">{openRfqs.length}</p>
            <button data-testid="supplier-dashboard-view-rfqs-button" onClick={() => onNavigate('requests')} className="text-sm font-medium text-[#137fec] hover:underline mt-2 text-left">{t('supplier.dashboard.viewRfqs')}</button>
          </div>
          <div className="flex flex-col gap-2 rounded-xl p-6 border border-neutral-200 bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <p className="text-neutral-700 text-base font-medium leading-normal">{t('supplier.dashboard.quotesSubmitted')}</p>
              <span className="material-symbols-outlined text-neutral-500">receipt_long</span>
            </div>
            <p className="text-neutral-800 tracking-tight text-4xl font-bold leading-tight">{supplierQuotes.length}</p>
            <button data-testid="supplier-dashboard-view-quotes-button" onClick={() => onNavigate('quotes')} className="text-sm font-medium text-[#137fec] hover:underline mt-2 text-left">{t('supplier.dashboard.viewQuotes')}</button>
          </div>
          <div className="flex flex-col gap-2 rounded-xl p-6 border border-neutral-200 bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <p className="text-neutral-700 text-base font-medium leading-normal">{t('supplier.dashboard.manageProducts')}</p>
              <span className="material-symbols-outlined text-neutral-500">inventory_2</span>
            </div>
            <p className="text-neutral-800 tracking-tight text-4xl font-bold leading-tight">{supplierProductsCount}</p>
            <button data-testid="supplier-dashboard-view-catalog-button" onClick={() => onNavigate('products')} className="text-sm font-medium text-[#137fec] hover:underline mt-2 text-left">{t('supplier.dashboard.viewCatalog')}</button>
          </div>
        </div>

        {/* Pending Actions Table */}
        <div className="space-y-6">
          <h2 className="text-neutral-800 text-xl font-bold leading-tight tracking-tight">{t('supplier.dashboard.pendingActions')}</h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-neutral-500">{t('supplier.dashboard.rfqId')}</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-neutral-500">{t('supplier.dashboard.dueDate')}</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-neutral-500">{t('supplier.dashboard.status')}</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-neutral-500">{t('supplier.dashboard.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {pendingRFQs.map((rfq) => (
                  <tr key={rfq.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-neutral-800 text-sm font-medium">RFQ-{rfq.id.toUpperCase()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-neutral-500 text-sm">{rfq.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={rfq.status === 'OPEN' ? 'pending' : rfq.status.toLowerCase()} size="sm" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button data-testid={`supplier-dashboard-view-and-quote-${rfq.id}`} onClick={() => handleDraftQuote(rfq.id)} className="text-[#137fec] font-semibold hover:underline flex items-center gap-1">
                        {t('supplier.dashboard.viewAndQuote')} <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };







  const ProductsView = () => {
    const [showGallery, setShowGallery] = useState(false);
    const [activeSubCategory, setActiveSubCategory] = useState('All');
    const [productsPage, setProductsPage] = useState(1);
    const [stockModalProduct, setStockModalProduct] = useState<{
      id: string;
      name: string;
      stock: number;
    } | null>(null);

    const handleStockUpdated = () => {
      setStockModalProduct(null);
    };

    useEffect(() => {
      setProductsPage(1);
    }, [activeSubCategory]);

    if (showGallery) {
      return <MasterProductGallery onBack={() => setShowGallery(false)} />;
    }

    const supplierProducts = allProducts.filter(p => currentUser && p.supplierId === currentUser.id);

    // Mock Sub-categories for the filter (based on HTML reference + generic fallback)
    const subCategories = ['All', 'Tools', 'Electrical', 'Plumbing', 'Hardware', 'Safety Equipment', 'Janitorial'];

    // Helper to map category to translation key
    const getCategoryLabel = (cat: string) => {
      const keyMap: Record<string, string> = {
        'Office': 'office',
        'IT Supplies': 'itSupplies',
        'Breakroom': 'breakroom',
        'Janitorial': 'janitorial',
        'Maintenance': 'maintenance',
        'General': 'general'
      };
      const key = keyMap[cat] || cat.toLowerCase();
      return t(`categories.${key}.label`, cat);
    };

    // Helper to map subcategory to translation key
    const getSubCategoryLabel = (sub: string) => {
      const keyMap: Record<string, string> = {
        'All': 'all',
        'Tools': 'tools',
        'Electrical': 'electrical',
        'Plumbing': 'plumbing',
        'Hardware': 'hardware',
        'Safety Equipment': 'safetyEquipment',
        'Janitorial': 'janitorial'
      };
      // fallback for other specific subcategories not yet in sub map: just show them or try a generic key
      const key = keyMap[sub];
      return key ? t(`categories.sub.${key}`, sub) : sub;
    };

    const filteredProducts = activeSubCategory === 'All'
      ? supplierProducts
      : supplierProducts.filter(p => p.subcategory === activeSubCategory || p.category === activeSubCategory);
    const productsPerPage = 10;
    const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
    const currentProductPage = Math.min(productsPage, totalProductPages);
    const paginatedProducts = filteredProducts.slice(
      (currentProductPage - 1) * productsPerPage,
      currentProductPage * productsPerPage
    );
    const showingStart = filteredProducts.length === 0 ? 0 : ((currentProductPage - 1) * productsPerPage) + 1;
    const showingEnd = Math.min(currentProductPage * productsPerPage, filteredProducts.length);

    return (
      <div data-testid="supplier-products-view" className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50 animate-in fade-in duration-300">
        {/* BEGIN: Header & Filters Section */}
        <header className="flex-shrink-0 px-8 pt-8 pb-4">
          {/* Breadcrumbs */}
          <div className="mb-2">
            <span className="text-sm font-medium text-slate-500">{t('supplier.products.supplierPortal')}</span>
          </div>
          {/* Title & Main Action */}
          <div className="flex items-start justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-900 max-w-4xl leading-tight">
              {t('supplier.products.title') || 'Category Product Management'}
            </h1>
            <button
              onClick={() => setEditingProduct({
                name: '',
                description: '',
                category: 'Office',
                subcategory: '',
                supplierPrice: 0,
                image: '',
                sku: ''
              })}
              className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors whitespace-nowrap flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              {t('supplier.products.addNewProduct')}
            </button>
          </div>
          {/* Sub-category Filters & Bulk Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              <span className="text-sm font-medium text-slate-700 mr-2 whitespace-nowrap">{t('supplier.products.subCategory')}</span>
              {subCategories.map(sub => (
                <button
                  key={sub}
                  onClick={() => setActiveSubCategory(sub)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap border transition-colors ${activeSubCategory === sub
                    ? 'text-blue-700 bg-white border-blue-600'
                    : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  {getSubCategoryLabel(sub)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowGallery(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-sm whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base text-slate-500">library_add</span>
                {t('supplier.products.masterCatalog')}
              </button>
              <button
                onClick={handleBulkUploadClick}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-sm whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base text-slate-500">upload_file</span>
                {t('supplier.products.bulkUpload')}
              </button>
              <input
                ref={bulkUploadInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleBulkUploadSelected}
              />
            </div>
          </div>
        </header>

        {/* BEGIN: Data Table Container */}
        <div className="flex-1 px-8 pb-8 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-900 uppercase tracking-wider">
                  <th className="px-6 py-4 w-24">{t('supplier.products.image')}</th>
                  <th className="px-6 py-4 w-1/5">{t('supplier.products.itemName')}</th>
                  <th className="px-6 py-4 w-2/5">{t('supplier.products.itemMetadata')}</th>
                  <th className="px-6 py-4 w-32">{t('supplier.products.costPrice')}</th>
                  <th className="px-6 py-4 w-40">{t('supplier.products.status')}</th>
                  <th className="px-6 py-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedProducts.map(product => {
                  const stock = product.stock ?? 0;
                  const status = product.status || 'PENDING';
                  const isApproved = status.toUpperCase() === 'APPROVED';
                  const isRejected = status.toUpperCase() === 'REJECTED';

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 align-top">
                        <div className="w-16 h-16 bg-white border border-slate-200 rounded-md p-1 flex items-center justify-center">
                          {product.image ? (
                            <img alt={product.name} className="max-w-full max-h-full object-contain" src={product.image} />
                          ) : (
                            <span className="material-symbols-outlined text-slate-300 text-3xl">image</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <span className="text-sm font-semibold text-slate-900 block">{product.name}</span>
                        <div className="mt-1 text-xs text-slate-500">{product.description && product.description.substring(0, 60)}...</div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="text-xs text-slate-600 space-y-1">
                          <p><span className="font-medium text-slate-900">{t('supplier.products.sku')}:</span> {product.sku || 'N/A'}</p>
                          <p><span className="font-medium text-slate-900">{t('supplier.products.category')}:</span> {getCategoryLabel(product.category)} / {getSubCategoryLabel(product.subcategory || '')}</p>
                          <p className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{t('supplier.products.stock')}:</span>
                            <span className={stock === 0 ? 'text-red-600 font-bold' : stock < 10 ? 'text-amber-600' : 'text-slate-600'}>{stock} {t('supplier.products.units')}</span>
                            <button
                              onClick={() => setStockModalProduct({ id: product.id, name: product.name, stock })}
                              className="text-blue-600 hover:underline"
                            >
                              {t('supplier.products.update')}
                            </button>
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <span className="text-sm font-medium text-slate-900">SAR {product.supplierPrice?.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className={`flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded w-fit ${isApproved ? 'text-green-600 bg-green-50' :
                          isRejected ? 'text-red-700 bg-red-50' : 'text-yellow-600 bg-yellow-50'
                          }`}>
                          <span className={`material-symbols-outlined text-sm ${isApproved ? 'bg-green-600 text-white rounded-full p-[1px]' : ''
                            }`}>
                            {isApproved ? 'check' : isRejected ? 'close' : 'hourglass_empty'}
                          </span>
                          {isApproved ? t('supplier.products.live') : isRejected ? t('supplier.products.rejected') : t('supplier.products.pending')}
                        </div>
                        {isRejected && <span className="text-xs text-slate-500 block mt-1">{t('supplier.products.reason')}: {t('supplier.products.adminReview')}</span>}
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingProduct(product)}
                            className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50"
                          >
                            <span className="material-symbols-outlined text-sm mr-1.5 text-slate-500">edit</span>
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => handleRemoveProduct(product)}
                            className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50"
                          >
                            <span className="material-symbols-outlined text-sm mr-1.5 text-slate-500">delete</span>
                            {t('supplier.products.remove')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Table Footer (Pagination Mock) */}
            <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-slate-600">{t('supplier.products.showingItems', { start: showingStart, end: showingEnd, total: filteredProducts.length })}</p>
              <nav className="flex items-center rounded-md border border-slate-300 bg-white">
                <button
                  onClick={() => setProductsPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentProductPage <= 1}
                  className="px-3 py-2 text-slate-500 hover:bg-slate-50 rounded-l-md border-r border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                <button disabled className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border-r border-slate-300">{currentProductPage}</button>
                <button
                  onClick={() => setProductsPage((prev) => Math.min(totalProductPages, prev + 1))}
                  disabled={currentProductPage >= totalProductPages}
                  className="px-3 py-2 text-slate-500 hover:bg-slate-50 rounded-r-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* Stock Update Modal */}
        {
          stockModalProduct && currentUser && (
            <StockUpdateModal
              isOpen={true}
              onClose={() => setStockModalProduct(null)}
              productId={stockModalProduct.id}
              productName={stockModalProduct.name}
              currentStock={stockModalProduct.stock}
              onStockUpdated={handleStockUpdated}
              userId={currentUser.id}
            />
          )
        }

        <ConfirmDialog
          isOpen={Boolean(pendingRemoveProduct)}
          onClose={() => setPendingRemoveProduct(null)}
          onConfirm={handleConfirmRemoveProduct}
          title={t('supplier.products.remove') || 'Remove product'}
          message={
            t('supplier.products.confirmRemove', {
              name: pendingRemoveProduct?.name || ''
            }) || `Remove ${pendingRemoveProduct?.name || 'this product'}?`
          }
          confirmText={t('common.delete', 'Delete')}
          cancelText={t('common.cancel', 'Cancel')}
          type="danger"
          isLoading={isRemovingProduct}
        />
      </div >
    );
  };

  const RequestsView = () => {
    return (
      <div data-testid="supplier-requests-view" className="p-4 md:p-8 lg:p-12 animate-in fade-in duration-300">
        <h1 className="text-2xl font-bold text-neutral-800 mb-6">{t('supplier.rfqs.title')}</h1>
        <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto shadow-sm">
          <table className="w-full text-left min-w-[600px]">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-6 py-3 text-xs font-bold text-neutral-500 uppercase">{t('supplier.dashboard.rfqId')}</th>
                <th className="px-6 py-3 text-xs font-bold text-neutral-500 uppercase">{t('supplier.rfqs.date')}</th>
                <th className="px-6 py-3 text-xs font-bold text-neutral-500 uppercase">{t('supplier.rfqs.items')}</th>
                <th className="px-6 py-3 text-xs font-bold text-neutral-500 uppercase">{t('supplier.dashboard.status')}</th>
                <th className="px-6 py-3 text-xs font-bold text-neutral-500 uppercase">{t('supplier.dashboard.action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {allRfqs.map(rfq => (
                <tr key={rfq.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 font-medium text-neutral-800">#{rfq.id.toUpperCase()}</td>
                  <td className="px-6 py-4 text-neutral-500">{rfq.date}</td>
                  <td className="px-6 py-4 text-neutral-500">{rfq.items.length} {t('supplier.rfqs.items')}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={rfq.status === 'OPEN' ? 'pending' : rfq.status.toLowerCase()} size="sm" />
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => onNavigate('quotes')} className="text-[#137fec] font-bold text-sm hover:underline">{t('supplier.rfqs.submitQuote')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const BrowseRFQsView = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [openOnly, setOpenOnly] = useState(false);
    const allRFQs = allRfqs; // In production, this would fetch from API
    const filteredRFQs = allRFQs.filter(rfq =>
      rfq.id.toLowerCase().includes(searchTerm.toLowerCase())
      && (!openOnly || rfq.status === 'OPEN')
    );

    return (
      <div className="p-4 md:p-8 lg:p-12 font-display text-[#0d141b] animate-in fade-in duration-300">
        <div className="flex flex-col gap-8">
          {/* Header */}
          <div className="flex flex-wrap justify-between gap-4 items-center">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl md:text-4xl font-black tracking-[-0.033em]">{t('supplier.rfqs.browseTitle')}</h1>
              <p className="text-[#4c739a] text-base">{t('supplier.rfqs.browseSubtitle')}</p>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-grow">
              <SearchBar
                placeholder={t('supplier.rfqs.searchPlaceholder')}
                value={searchTerm}
                onChange={setSearchTerm}
                size="lg"
              />
            </div>
            <button
              onClick={() => setOpenOnly((prev) => !prev)}
              className={`flex h-12 shrink-0 items-center justify-center gap-x-2 rounded-lg border px-4 transition-colors ${openOnly
                ? 'bg-[#137fec]/10 border-[#137fec] text-[#137fec]'
                : 'bg-white border-[#e7edf3] hover:border-[#4c739a]'
                }`}
            >
              <span className="material-symbols-outlined text-xl">filter_list</span>
              <p className="text-sm font-medium">
                {openOnly ? (t('supplier.rfqs.openOnly') || 'Open only') : t('supplier.rfqs.filters')}
              </p>
            </button>
          </div>

          {/* RFQ Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredRFQs.map(rfq => {
              const firstItem = allProducts.find(p => p.id === rfq.items[0]?.productId);
              return (
                <div key={rfq.id} className="group flex flex-col rounded-xl border border-[#e7edf3] bg-white overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                  <div className="p-6 flex flex-col gap-4 flex-grow">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <h3 className="font-bold text-lg text-[#0d141b]">RFQ-{rfq.id.toUpperCase()}</h3>
                        <p className="text-sm text-[#4c739a]">{firstItem?.name || t('supplier.rfqs.multipleItems')}</p>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${rfq.status === 'OPEN' ? 'bg-green-100 text-green-800' :
                        rfq.status === 'QUOTED' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                        {rfq.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex flex-col gap-1">
                        <p className="text-[#4c739a]">{t('supplier.rfqs.postedDate')}</p>
                        <p className="font-medium text-[#0d141b]">{rfq.date}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[#4c739a]">{t('supplier.rfqs.items')}</p>
                        <p className="font-medium text-[#0d141b]">{rfq.items.length} {t('supplier.rfqs.items')}</p>
                      </div>
                    </div>

                    <div className="border-t border-[#e7edf3] pt-4 mt-auto">
                      <p className="text-xs text-[#4c739a] line-clamp-2">
                        {rfq.items.map((item, idx) => {
                          const prod = allProducts.find(p => p.id === item.productId);
                          return prod ? `${prod.name} (${item.quantity}x)` : '';
                        }).filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-[#f6f7f8] border-t border-[#e7edf3]">
                    <button
                      onClick={() => handleDraftQuote(rfq.id)}
                      className="w-full flex items-center justify-center rounded-lg h-10 px-4 text-sm font-bold bg-[#137fec] text-white hover:bg-[#137fec]/90 transition-colors"
                    >
                      <span className="material-symbols-outlined text-base mr-2">rate_review</span>
                      {t('supplier.rfqs.submitQuote')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredRFQs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 bg-[#f6f7f8] rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-4xl text-[#4c739a]">search_off</span>
              </div>
              <h3 className="text-xl font-bold text-[#0d141b]">{t('supplier.rfqs.noRfqsFound')}</h3>
              <p className="text-[#4c739a] max-w-md mt-2">{t('supplier.rfqs.noRfqsHint')}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const QuotesView = () => {
    const selectedRFQ = selectedQuoteRFQId;
    const setSelectedRFQ = setSelectedQuoteRFQId;
    const [quoteDetails, setQuoteDetails] = useState({
      unitPrice: '',
      shippingCost: '',
      tax: '',
      leadTime: '',
      notes: ''
    });

    const pendingRFQs = allRfqs.filter(rfq => rfq.status === 'OPEN');
    const rfq = selectedRFQ ? allRfqs.find(r => r.id === selectedRFQ) : null;

    const calculateTotal = () => {
      if (!rfq) return 0;
      const totalItems = rfq.items.reduce((sum, item) => sum + item.quantity, 0);
      const subtotal = parseFloat(quoteDetails.unitPrice || '0') * totalItems;
      const shipping = parseFloat(quoteDetails.shippingCost || '0');
      const tax = parseFloat(quoteDetails.tax || '0');
      return subtotal + shipping + tax;
    };

    const handleSubmitQuote = async () => {
      if (!selectedRFQ || !currentUser) return;

      try {
        const itemQuantity = rfq?.items.reduce((sum, i) => sum + i.quantity, 0) || 1;
        const subtotal = parseFloat(quoteDetails.unitPrice || '0') * itemQuantity;
        const shipping = parseFloat(quoteDetails.shippingCost || '0');
        const tax = parseFloat(quoteDetails.tax || '0');
        const supplierPrice = subtotal + shipping + tax;

        await addQuote({
          id: `quote-${Date.now()}`,
          rfqId: selectedRFQ,
          supplierId: currentUser.id,
          supplierPrice,
          leadTime: quoteDetails.leadTime,
          status: 'PENDING_ADMIN',
          marginPercent: 0,
          finalPrice: supplierPrice,

        });

        toast.success(t('supplier.quotes.quoteSubmitted'));
        setSelectedRFQ(null);
        setQuoteDetails({
          unitPrice: '',
          shippingCost: '',
          tax: '',
          leadTime: '',
          notes: ''
        });
      } catch (error) {
        logger.error('Error submitting quote:', error);
        toast.error(t('supplier.quotes.submitError'));
      }
    };

    if (!selectedRFQ) {
      return (
        <div data-testid="supplier-quotes-view" className="p-4 md:p-8 lg:p-12 animate-in fade-in duration-300">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold text-neutral-800">{t('supplier.quotes.createQuote')}</h1>
              <p className="text-neutral-500">{t('supplier.quotes.selectRfq')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pendingRFQs.map(rfq => {
                const firstItem = allProducts.find(p => p.id === rfq.items[0]?.productId);
                return (
                  <div key={rfq.id} className="bg-white rounded-xl border border-neutral-200 p-6 hover:shadow-md transition-all cursor-pointer" onClick={() => setSelectedRFQ(rfq.id)}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-neutral-800">RFQ-{rfq.id.toUpperCase()}</h3>
                        <p className="text-sm text-neutral-500">{rfq.date}</p>
                      </div>
                      <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800">{t('status.open')}</span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-neutral-600">
                        <span className="font-medium">{rfq.items.length}</span> {t('supplier.rfqs.itemsRequested')}
                      </p>
                      <p className="text-xs text-neutral-400 line-clamp-2">
                        {firstItem?.name || t('supplier.rfqs.multipleProducts')}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRFQ(rfq.id);
                      }}
                      className="mt-4 w-full py-2 px-4 bg-[#137fec] text-white rounded-lg font-semibold hover:bg-[#137fec]/90 transition-colors"
                    >
                      {t('supplier.quotes.createQuote')}
                    </button>
                  </div>
                );
              })}
            </div>

            {pendingRFQs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-4xl text-neutral-400">request_quote</span>
                </div>
                <h3 className="text-xl font-bold text-neutral-800">{t('supplier.quotes.noOpenRfqs')}</h3>
                <p className="text-neutral-500 max-w-md mt-2">{t('supplier.quotes.noOpenRfqsHint')}</p>
                <button onClick={() => onNavigate('browse')} className="mt-4 px-6 py-2 bg-[#137fec] text-white rounded-lg font-semibold hover:bg-[#137fec]/90">
                  {t('supplier.quotes.browseRfqs')}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div data-testid="supplier-quotes-view" className="p-4 md:p-8 lg:p-12 animate-in fade-in duration-300">
        <div className="flex flex-col gap-6">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedRFQ(null)} className="text-sm font-medium text-neutral-500 hover:text-[#137fec]">{t('sidebar.quotes')}</button>
            <span className="text-sm text-neutral-400">/</span>
            <span className="text-sm font-medium text-neutral-800">RFQ-{rfq?.id.toUpperCase()}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Quote Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-neutral-200 p-6">
                <h2 className="text-xl font-bold text-neutral-800 mb-4">{t('supplier.quotes.quoteDetails')}</h2>

                {/* RFQ Items */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-neutral-600 uppercase mb-3">{t('supplier.quotes.requestedItems')}</h3>
                  <div className="space-y-2">
                    {rfq?.items.map((item, idx) => {
                      const product = allProducts.find(p => p.id === item.productId);
                      return (
                        <div key={idx} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <img src={product?.image} alt={product?.name} className="w-12 h-12 object-cover rounded" />
                            <div>
                              <p className="font-medium text-neutral-800">{product?.name}</p>
                              <p className="text-sm text-neutral-500">{t('supplier.quotes.quantity')}: {item.quantity}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pricing Form */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-600 mb-2">{t('supplier.quotes.unitPrice')}</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">$</span>
                        <input
                          type="number"
                          className="w-full pl-8 pr-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                          placeholder="0.00"
                          value={quoteDetails.unitPrice}
                          onChange={(e) => setQuoteDetails({ ...quoteDetails, unitPrice: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-600 mb-2">{t('supplier.quotes.leadTime')}</label>
                      <input
                        type="text"
                        className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                        placeholder={t('supplier.quotes.leadTimePlaceholder')}
                        value={quoteDetails.leadTime}
                        onChange={(e) => setQuoteDetails({ ...quoteDetails, leadTime: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-600 mb-2">{t('supplier.quotes.shippingCost')}</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">$</span>
                        <input
                          type="number"
                          className="w-full pl-8 pr-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                          placeholder="0.00"
                          value={quoteDetails.shippingCost}
                          onChange={(e) => setQuoteDetails({ ...quoteDetails, shippingCost: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-600 mb-2">{t('supplier.quotes.tax')}</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">$</span>
                        <input
                          type="number"
                          className="w-full pl-8 pr-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                          placeholder="0.00"
                          value={quoteDetails.tax}
                          onChange={(e) => setQuoteDetails({ ...quoteDetails, tax: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-2">{t('supplier.quotes.additionalNotes')}</label>
                    <textarea
                      className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                      rows={4}
                      placeholder={t('supplier.quotes.notesPlaceholder')}
                      value={quoteDetails.notes}
                      onChange={(e) => setQuoteDetails({ ...quoteDetails, notes: e.target.value })}
                    ></textarea>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-28 bg-white rounded-xl border border-neutral-200 p-6">
                <h3 className="text-lg font-bold text-neutral-800 mb-4">{t('supplier.quotes.quoteSummary')}</h3>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">{t('supplier.quotes.subtotal')}</span>
                    <span className="font-medium text-neutral-800">
                      ${(parseFloat(quoteDetails.unitPrice || '0') * (rfq?.items.reduce((sum, item) => sum + item.quantity, 0) || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">{t('supplier.quotes.shipping')}</span>
                    <span className="font-medium text-neutral-800">${parseFloat(quoteDetails.shippingCost || '0').toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">{t('supplier.quotes.tax')}</span>
                    <span className="font-medium text-neutral-800">${parseFloat(quoteDetails.tax || '0').toFixed(2)}</span>
                  </div>
                  <div className="border-t border-neutral-200 pt-3 flex justify-between">
                    <span className="font-bold text-neutral-800">{t('supplier.quotes.total')}</span>
                    <span className="font-bold text-xl text-neutral-800">${calculateTotal().toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleSubmitQuote}
                    disabled={!quoteDetails.unitPrice || !quoteDetails.leadTime}
                    className="w-full py-3 px-4 bg-[#137fec] text-white rounded-lg font-bold hover:bg-[#137fec]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('supplier.quotes.submitQuote')}
                  </button>
                  <button
                    onClick={() => setSelectedRFQ(null)}
                    className="w-full py-3 px-4 bg-white text-neutral-600 border border-neutral-300 rounded-lg font-semibold hover:bg-neutral-50 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-blue-600 text-lg">info</span>
                    <p className="text-xs text-blue-700">{t('supplier.quotes.quoteReviewNote')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const OrdersView = () => {
    const { currentUser, orders, users, updateOrder } = useStore();
    const [activeOrderTab, setActiveOrderTab] = useState<'pending' | 'completed' | 'won'>('won');
    const [selectedOrderDetails, setSelectedOrderDetails] = useState<{ id: string; date: string; amount: number; status: string } | null>(null);
    const [orderHeaderSearch, setOrderHeaderSearch] = useState('');
    const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
    const [showChatPanel, setShowChatPanel] = useState(false);

    const [pendingSearchTerm, setPendingSearchTerm] = useState('');
    const [pendingStatusFilter, setPendingStatusFilter] = useState('ALL');
    const [pendingDateFilter, setPendingDateFilter] = useState<'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR'>('ALL');

    const [wonSearchTerm, setWonSearchTerm] = useState('');
    const [wonStatusFilter, setWonStatusFilter] = useState<'ALL' | 'ACCEPTED'>('ALL');
    const [wonDateFilter, setWonDateFilter] = useState<'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR'>('ALL');
    const [wonPage, setWonPage] = useState(1);

    const [completedSearchTerm, setCompletedSearchTerm] = useState('');
    const [completedStatusFilter, setCompletedStatusFilter] = useState<'ALL' | 'DELIVERED' | 'CLOSED'>('ALL');
    const [completedDateFilter, setCompletedDateFilter] = useState<'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR'>('ALL');
    const [completedPage, setCompletedPage] = useState(1);

    const parseOrderDate = (value: string) => {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const orderDateValue = (order: Order) => order.createdAt || order.updatedAt || order.date;

    const getClientLabel = (clientId?: string) => {
      if (!clientId) return t('admin.overview.unknownClient', 'Unknown Client');
      const client = users.find((user) => user.id === clientId);
      return client?.companyName || client?.publicId || client?.name || clientId;
    };

    const formatItemsSummary = (items?: Array<{ quantity?: number }>) => {
      if (!items || items.length === 0) return '-';
      const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      return `${items.length} items / ${totalUnits} units`;
    };

    const matchesDateFilter = (value: string, filter: 'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR') => {
      if (filter === 'ALL') return true;
      const date = parseOrderDate(value);
      if (!date) return false;
      const now = new Date();
      if (filter === 'THIS_YEAR') return date.getFullYear() === now.getFullYear();
      const days = filter === 'LAST_30_DAYS' ? 30 : 90;
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - days);
      return date >= threshold;
    };

    const pendingOrders = orders.filter(o => o.supplierId === currentUser?.id && o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
    const normalizedHeaderSearch = orderHeaderSearch.trim().toLowerCase();
    const normalizedPendingSearch = pendingSearchTerm.trim().toLowerCase();
    const filteredPendingOrders = pendingOrders.filter((order) => {
      const clientLabel = users.find((u) => u.id === order.clientId)?.companyName || order.clientId;
      const searchText = `${order.id} ${clientLabel}`.toLowerCase();
      const matchesHeaderSearch = !normalizedHeaderSearch || searchText.includes(normalizedHeaderSearch);
      const matchesLocalSearch = !normalizedPendingSearch || searchText.includes(normalizedPendingSearch);
      const matchesStatus = pendingStatusFilter === 'ALL' || order.status === pendingStatusFilter;
      const matchesDate = matchesDateFilter(order.date, pendingDateFilter);
      return matchesHeaderSearch && matchesLocalSearch && matchesStatus && matchesDate;
    });

    const wonOrders = allQuotes
      .filter((quote) => quote.supplierId === currentUser?.id && quote.status === 'ACCEPTED')
      .map((quote) => {
        const linkedOrder = orders.find((order) => order.quoteId === quote.id);
        const linkedRfq = allRfqs.find((rfq) => rfq.id === quote.rfqId);
        const orderItems = Array.isArray(linkedOrder?.items)
          ? (linkedOrder?.items as Array<{ quantity?: number }>)
          : undefined;
        const summaryItems = orderItems && orderItems.length > 0
          ? orderItems
          : linkedRfq?.items;
        return {
          id: linkedOrder?.id || `QUOTE-${quote.id.toUpperCase()}`,
          client: getClientLabel(linkedOrder?.clientId || linkedRfq?.clientId),
          items: formatItemsSummary(summaryItems),
          date: linkedOrder ? orderDateValue(linkedOrder) : (linkedRfq?.createdAt || linkedRfq?.date || new Date().toISOString()),
          status: 'ACCEPTED' as const,
          amount: linkedOrder?.amount ?? quote.finalPrice,
        };
      })
      .sort((a, b) => (parseOrderDate(b.date)?.getTime() || 0) - (parseOrderDate(a.date)?.getTime() || 0));

    const completedOrders = orders
      .filter((order) => order.supplierId === currentUser?.id && (order.status === 'DELIVERED' || order.status === 'CANCELLED'))
      .map((order) => {
        const linkedQuote = order.quoteId ? allQuotes.find((quote) => quote.id === order.quoteId) : null;
        const linkedRfq = linkedQuote ? allRfqs.find((rfq) => rfq.id === linkedQuote.rfqId) : null;
        const orderItems = Array.isArray(order.items)
          ? (order.items as Array<{ quantity?: number }>)
          : undefined;
        const summaryItems = orderItems && orderItems.length > 0
          ? orderItems
          : linkedRfq?.items;
        return {
          id: order.id,
          client: getClientLabel(order.clientId || linkedRfq?.clientId),
          items: formatItemsSummary(summaryItems),
          date: orderDateValue(order),
          status: order.status === 'DELIVERED' ? 'DELIVERED' : 'CLOSED',
          amount: order.amount,
        };
      })
      .sort((a, b) => (parseOrderDate(b.date)?.getTime() || 0) - (parseOrderDate(a.date)?.getTime() || 0));

    const normalizedWonSearch = wonSearchTerm.trim().toLowerCase();
    const filteredWonOrders = wonOrders.filter((order) => {
      const searchText = `${order.id} ${order.client} ${order.items}`.toLowerCase();
      const matchesHeaderSearch = !normalizedHeaderSearch || searchText.includes(normalizedHeaderSearch);
      const matchesLocalSearch = !normalizedWonSearch || searchText.includes(normalizedWonSearch);
      const matchesStatus = wonStatusFilter === 'ALL' || order.status === wonStatusFilter;
      const matchesDate = matchesDateFilter(order.date, wonDateFilter);
      return matchesHeaderSearch && matchesLocalSearch && matchesStatus && matchesDate;
    });
    const wonPageSize = 3;
    const wonTotalPages = Math.max(1, Math.ceil(filteredWonOrders.length / wonPageSize));
    const currentWonPage = Math.min(wonPage, wonTotalPages);
    const paginatedWonOrders = filteredWonOrders.slice((currentWonPage - 1) * wonPageSize, currentWonPage * wonPageSize);
    const wonStart = filteredWonOrders.length === 0 ? 0 : ((currentWonPage - 1) * wonPageSize) + 1;
    const wonEnd = Math.min(currentWonPage * wonPageSize, filteredWonOrders.length);

    const normalizedCompletedSearch = completedSearchTerm.trim().toLowerCase();
    const filteredCompletedOrders = completedOrders.filter((order) => {
      const searchText = `${order.id} ${order.client} ${order.items}`.toLowerCase();
      const matchesHeaderSearch = !normalizedHeaderSearch || searchText.includes(normalizedHeaderSearch);
      const matchesLocalSearch = !normalizedCompletedSearch || searchText.includes(normalizedCompletedSearch);
      const matchesStatus = completedStatusFilter === 'ALL' || order.status === completedStatusFilter;
      const matchesDate = matchesDateFilter(order.date, completedDateFilter);
      return matchesHeaderSearch && matchesLocalSearch && matchesStatus && matchesDate;
    });
    const completedPageSize = 4;
    const completedTotalPages = Math.max(1, Math.ceil(filteredCompletedOrders.length / completedPageSize));
    const currentCompletedPage = Math.min(completedPage, completedTotalPages);
    const paginatedCompletedOrders = filteredCompletedOrders.slice((currentCompletedPage - 1) * completedPageSize, currentCompletedPage * completedPageSize);
    const completedStart = filteredCompletedOrders.length === 0 ? 0 : ((currentCompletedPage - 1) * completedPageSize) + 1;
    const completedEnd = Math.min(currentCompletedPage * completedPageSize, filteredCompletedOrders.length);

    useEffect(() => {
      setWonPage(1);
    }, [wonSearchTerm, wonStatusFilter, wonDateFilter, orderHeaderSearch]);

    useEffect(() => {
      setCompletedPage(1);
    }, [completedSearchTerm, completedStatusFilter, completedDateFilter, orderHeaderSearch]);

    // Handler for updating order status
    const handleStatusChange = async (orderId: string, newStatus: string) => {
      try {
        const currentOrder = orders.find((order) => order.id === orderId);
        if (currentOrder && !canTransitionOrderStatus(currentOrder.status, newStatus)) {
          toast.error(t('supplier.orders.invalidStatusTransition') || 'Invalid order status transition');
          return;
        }

        await api.updateOrder(orderId, { status: newStatus as OrderStatus });

        // Also update local store
        await updateOrder(orderId, { status: newStatus as any });

        toast.success(t('supplier.orders.statusUpdateSuccess') || 'Order status updated successfully');
      } catch (error) {
        logger.error('Failed to update order status:', error);
        toast.error(t('supplier.orders.statusUpdateError') || 'Failed to update order status');
      }
    };

    return (
      <div className="flex flex-col h-full font-display bg-background-light dark:bg-background-dark animate-in fade-in duration-500">
        <header className="flex items-center justify-between whitespace-nowrap border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark px-8 py-3 sticky top-0 z-10">
          <label className="flex flex-col min-w-40 !h-10 max-w-sm">
            <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
              <div className="text-slate-500 dark:text-slate-400 flex border-none bg-slate-100 dark:bg-slate-800 items-center justify-center pl-3 rounded-l-lg border-r-0">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>search</span>
              </div>
              <input
                className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-0 border-none bg-slate-100 dark:bg-slate-800 focus:border-none h-full placeholder:text-slate-500 dark:placeholder:text-slate-400 px-4 rounded-l-none border-l-0 pl-2 text-sm font-normal leading-normal"
                placeholder={t('common.search')}
                value={orderHeaderSearch}
                onChange={(event) => setOrderHeaderSearch(event.target.value)}
              />
            </div>
          </label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowNotificationsPanel(true)}
              className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 w-10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button
              onClick={() => setShowChatPanel(true)}
              className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 w-10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="material-symbols-outlined">chat_bubble</span>
            </button>
            <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCKElWVK48vCLvGHqhzjpMQ0iLTiTSvfb7xH7tjZBd_FMOshpe_JK6Kr5aDfIYwLAjRz3DR6Ft6PlwcKrX5vpnu0i6p22S0OW0mXY4iXwgH4bTnJ5yqVhNc4-AKky04lXMmjcKrQAzJJKLrFNrOvdPwzVBKkXPzAp_EZqKejKj0Cu8HCmg3NanNyWnT_t6RlmgcKmn4ghEBpDRS-stUffwQY_MMRFrY0FrALkSquFfP8Y_sHBdkkyZUqpVp7ogPoEu1yv_l9TT0HL04")' }}></div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 lg:p-12">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <p className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight">{t('supplier.orders.title')}</p>
            <button
              onClick={() => onNavigate('quotes')}
              className="flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium rounded-lg bg-[#137fec] text-white hover:bg-[#137fec]/90 transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add</span>
              <span>{t('supplier.orders.newOrder')}</span>
            </button>
          </div>
          <div className="border-b border-slate-200 dark:border-slate-800 mb-6">
            <nav aria-label="Tabs" className="-mb-px flex space-x-6">
              <button
                onClick={() => setActiveOrderTab('won')}
                className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold ${activeOrderTab === 'won' ? 'border-[#137fec] text-[#137fec]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('supplier.orders.wonPurchaseOrders')}
              </button>
              <button
                onClick={() => setActiveOrderTab('completed')}
                className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-medium ${activeOrderTab === 'completed' ? 'border-[#137fec] text-[#137fec]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('supplier.orders.completedOrders')}
              </button>
              <button
                onClick={() => setActiveOrderTab('pending')}
                className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-medium ${activeOrderTab === 'pending' ? 'border-[#137fec] text-[#137fec]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('supplier.orders.pendingOrders')}
              </button>
            </nav>
          </div>

          {/* --- PENDING ORDERS TABLE --- */}
          {activeOrderTab === 'pending' && (
            <div>
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <SearchBar
                    placeholder={t('supplier.orders.searchPlaceholder')}
                    value={pendingSearchTerm}
                    onChange={setPendingSearchTerm}
                    size="md"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="relative">
                    <select
                      value={pendingStatusFilter}
                      onChange={(event) => setPendingStatusFilter(event.target.value)}
                      className="h-11 appearance-none rounded-lg border border-slate-200 bg-white pl-4 pr-8 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <option value="ALL">{t('supplier.orders.status')} - {t('common.all') || 'All'}</option>
                      <option value="PAYMENT_CONFIRMED">{t('status.paymentConfirmed', 'Payment Confirmed')}</option>
                      <option value="PROCESSING">{t('status.processing', 'Processing')}</option>
                      <option value="READY_FOR_PICKUP">{t('status.readyForPickup', 'Ready for Pickup')}</option>
                      <option value="SHIPPED">{t('status.shipped', 'Shipped')}</option>
                      <option value="IN_TRANSIT">{t('status.inTransit', 'In Transit')}</option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2.5" style={{ fontSize: '20px' }}>expand_more</span>
                  </div>
                  <div className="relative">
                    <select
                      value={pendingDateFilter}
                      onChange={(event) => setPendingDateFilter(event.target.value as typeof pendingDateFilter)}
                      className="h-11 appearance-none rounded-lg border border-slate-200 bg-white pl-4 pr-8 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <option value="ALL">{t('supplier.orders.dateRange')}</option>
                      <option value="LAST_30_DAYS">Last 30 days</option>
                      <option value="LAST_90_DAYS">Last 90 days</option>
                      <option value="THIS_YEAR">This year</option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2.5" style={{ fontSize: '20px' }}>expand_more</span>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                    <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="p-4" scope="col"><input className="form-checkbox rounded text-[#137fec] focus:ring-[#137fec]/50" type="checkbox" /></th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.orderId')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.client')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.itemsQuantity')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.orderDate')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.status')}</th>
                        <th className="px-6 py-3 text-right" scope="col">{t('supplier.orders.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {/* Real data mapping would go here, currently using mock structure but adapted for logic */}
                      {filteredPendingOrders.map(order => (
                        <tr key={order.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-4"><input className="form-checkbox rounded text-[#137fec] focus:ring-[#137fec]/50" type="checkbox" /></td>
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white whitespace-nowrap">{order.id}</td>
                          <td className="px-6 py-4">{users.find(u => u.id === order.clientId)?.companyName || order.clientId}</td>
                          <td className="px-6 py-4">${order.amount.toLocaleString()}</td>
                          <td className="px-6 py-4">{order.date}</td>
                          <td className="px-6 py-4">
                            <select
                              value={order.status}
                              onChange={(e) => handleStatusChange(order.id, e.target.value)}
                              className={`border-none text-xs font-bold uppercase rounded-full px-3 py-1 cursor-pointer outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${order.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                                order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}
                            >
                              <option value="PAYMENT_CONFIRMED">{t('status.paymentConfirmed', 'Payment Confirmed')}</option>
                              <option value="PROCESSING">{t('status.processing', 'Processing')}</option>
                              <option value="READY_FOR_PICKUP">{t('status.readyForPickup', 'Ready for Pickup')}</option>
                              <option value="SHIPPED">{t('status.shipped', 'Shipped')}</option>
                              <option value="IN_TRANSIT">{t('status.inTransit', 'In Transit')}</option>
                              <option value="DELIVERED">{t('status.delivered', 'Delivered')}</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => setSelectedOrderDetails({
                                id: order.id,
                                date: order.date,
                                amount: order.amount,
                                status: order.status,
                              })}
                              className="inline-flex items-center gap-2 text-sm font-medium text-[#137fec] hover:underline"
                            >
                              <span>{t('supplier.orders.viewDetails')}</span>
                              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {/* Fallback for empty state if no real orders match */}
                      {filteredPendingOrders.length === 0 && (
                        <tr><td colSpan={7}><EmptyState type="orders" /></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- WON ORDERS TABLE --- */}
          {activeOrderTab === 'won' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 max-w-3xl">{t('supplier.orders.wonDescription')}</p>
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <SearchBar
                    placeholder={t('supplier.orders.searchPlaceholder')}
                    value={wonSearchTerm}
                    onChange={setWonSearchTerm}
                    size="md"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="relative">
                    <select
                      value={wonStatusFilter}
                      onChange={(event) => setWonStatusFilter(event.target.value as typeof wonStatusFilter)}
                      className="h-11 appearance-none rounded-lg border border-slate-200 bg-white pl-4 pr-8 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <option value="ALL">{t('supplier.orders.status')} - {t('common.all') || 'All'}</option>
                      <option value="ACCEPTED">{t('supplier.dashboard.quoteAccepted')}</option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2.5" style={{ fontSize: '20px' }}>expand_more</span>
                  </div>
                  <div className="relative">
                    <select
                      value={wonDateFilter}
                      onChange={(event) => setWonDateFilter(event.target.value as typeof wonDateFilter)}
                      className="h-11 appearance-none rounded-lg border border-slate-200 bg-white pl-4 pr-8 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <option value="ALL">{t('supplier.orders.dateRange')}</option>
                      <option value="LAST_30_DAYS">Last 30 days</option>
                      <option value="LAST_90_DAYS">Last 90 days</option>
                      <option value="THIS_YEAR">This year</option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2.5" style={{ fontSize: '20px' }}>expand_more</span>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                    <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="p-4" scope="col"><input className="form-checkbox rounded text-[#137fec] focus:ring-[#137fec]/50" type="checkbox" /></th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.orderId')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.client')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.itemsQuantity')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.acceptanceDate')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.status')}</th>
                        <th className="px-6 py-3 text-right" scope="col">{t('supplier.orders.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {paginatedWonOrders.map((order) => (
                        <tr key={order.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-4"><input className="form-checkbox rounded text-[#137fec] focus:ring-[#137fec]/50" type="checkbox" /></td>
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white whitespace-nowrap">{order.id}</td>
                          <td className="px-6 py-4">{order.client}</td>
                          <td className="px-6 py-4">{order.items}</td>
                          <td className="px-6 py-4">{new Date(order.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
                              <span className="size-1.5 rounded-full bg-emerald-500"></span>{t('supplier.dashboard.quoteAccepted')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => setSelectedOrderDetails({
                                id: order.id,
                                date: order.date,
                                amount: order.amount,
                                status: order.status,
                              })}
                              className="inline-flex items-center gap-2 text-sm font-medium text-[#137fec] hover:underline"
                            >
                              <span>{t('supplier.orders.viewDetails')}</span>
                              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {paginatedWonOrders.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                            {t('common.noResults') || 'No matching won orders'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <nav aria-label="Table navigation" className="flex items-center justify-between p-4">
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">{t('supplier.orders.showing')} <span className="font-semibold text-slate-900 dark:text-white">{wonStart}-{wonEnd}</span> {t('supplier.orders.of')} <span className="font-semibold text-slate-900 dark:text-white">{filteredWonOrders.length}</span></span>
                  <div className="inline-flex items-center -space-x-px">
                    <button
                      onClick={() => setWonPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentWonPage <= 1}
                      className="flex items-center justify-center h-9 px-3 leading-tight text-slate-500 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-l-lg hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('supplier.orders.previous')}
                    </button>
                    <button disabled className="flex items-center justify-center h-9 w-9 leading-tight text-[#137fec] bg-[#137fec]/10 border border-[#137fec] hover:bg-[#137fec]/20 hover:text-[#137fec] dark:bg-slate-700 dark:border-slate-600 dark:text-white transition-colors">{currentWonPage}</button>
                    <button
                      onClick={() => setWonPage((prev) => Math.min(wonTotalPages, prev + 1))}
                      disabled={currentWonPage >= wonTotalPages}
                      className="flex items-center justify-center h-9 w-9 leading-tight text-slate-500 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {Math.min(wonTotalPages, currentWonPage + 1)}
                    </button>
                    <button
                      onClick={() => setWonPage((prev) => Math.min(wonTotalPages, prev + 1))}
                      disabled={currentWonPage >= wonTotalPages}
                      className="flex items-center justify-center h-9 px-3 leading-tight text-slate-500 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-r-lg hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('supplier.orders.next')}
                    </button>
                  </div>
                </nav>
              </div>
            </div>
          )}

          {/* --- COMPLETED ORDERS TABLE --- */}
          {activeOrderTab === 'completed' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 max-w-3xl">{t('supplier.orders.completedDescription')}</p>
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <SearchBar
                    placeholder={t('supplier.orders.searchPlaceholder')}
                    value={completedSearchTerm}
                    onChange={setCompletedSearchTerm}
                    size="md"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="relative">
                    <select
                      value={completedStatusFilter}
                      onChange={(event) => setCompletedStatusFilter(event.target.value as typeof completedStatusFilter)}
                      className="h-11 appearance-none rounded-lg border border-slate-200 bg-white pl-4 pr-8 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <option value="ALL">{t('supplier.orders.status')} - {t('common.all') || 'All'}</option>
                      <option value="DELIVERED">{t('status.delivered', 'Delivered')}</option>
                      <option value="CLOSED">{t('status.closed', 'Closed')}</option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2.5" style={{ fontSize: '20px' }}>expand_more</span>
                  </div>
                  <div className="relative">
                    <select
                      value={completedDateFilter}
                      onChange={(event) => setCompletedDateFilter(event.target.value as typeof completedDateFilter)}
                      className="h-11 appearance-none rounded-lg border border-slate-200 bg-white pl-4 pr-8 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <option value="ALL">{t('supplier.orders.dateRange')}</option>
                      <option value="LAST_30_DAYS">Last 30 days</option>
                      <option value="LAST_90_DAYS">Last 90 days</option>
                      <option value="THIS_YEAR">This year</option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2.5" style={{ fontSize: '20px' }}>expand_more</span>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                    <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="p-4" scope="col"><input className="form-checkbox rounded text-[#137fec] focus:ring-[#137fec]/50" type="checkbox" /></th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.orderId')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.client')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.itemsQuantity')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.deliveryDate')}</th>
                        <th className="px-6 py-3" scope="col">{t('supplier.orders.finalStatus')}</th>
                        <th className="px-6 py-3 text-right" scope="col">{t('supplier.orders.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {paginatedCompletedOrders.map((order) => (
                        <tr key={order.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-4"><input className="form-checkbox rounded text-[#137fec] focus:ring-[#137fec]/50" type="checkbox" /></td>
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white whitespace-nowrap">{order.id}</td>
                          <td className="px-6 py-4">{order.client}</td>
                          <td className="px-6 py-4">{order.items}</td>
                          <td className="px-6 py-4">{new Date(order.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium ${order.status === 'DELIVERED'
                              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              }`}>
                              <span className={`size-1.5 rounded-full ${order.status === 'DELIVERED' ? 'bg-green-500' : 'bg-slate-500'}`}></span>
                              {order.status === 'DELIVERED' ? (t('status.delivered', 'Delivered')) : (t('status.closed', 'Closed'))}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => setSelectedOrderDetails({
                                id: order.id,
                                date: order.date,
                                amount: order.amount,
                                status: order.status,
                              })}
                              className="inline-flex items-center gap-2 text-sm font-medium text-[#137fec] hover:underline"
                            >
                              <span>{t('supplier.orders.viewDetails')}</span>
                              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {paginatedCompletedOrders.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                            {t('common.noResults') || 'No matching completed orders'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <nav aria-label="Table navigation" className="flex items-center justify-between p-4">
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">{t('supplier.orders.showing')} <span className="font-semibold text-slate-900 dark:text-white">{completedStart}-{completedEnd}</span> {t('supplier.orders.of')} <span className="font-semibold text-slate-900 dark:text-white">{filteredCompletedOrders.length}</span></span>
                  <div className="inline-flex items-center -space-x-px">
                    <button
                      onClick={() => setCompletedPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentCompletedPage <= 1}
                      className="flex items-center justify-center h-9 px-3 leading-tight text-slate-500 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-l-lg hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('supplier.orders.previous')}
                    </button>
                    <button disabled className="flex items-center justify-center h-9 w-9 leading-tight text-[#137fec] bg-[#137fec]/10 border border-[#137fec] hover:bg-[#137fec]/20 hover:text-[#137fec] dark:bg-slate-700 dark:border-slate-600 dark:text-white transition-colors">{currentCompletedPage}</button>
                    <button
                      onClick={() => setCompletedPage((prev) => Math.min(completedTotalPages, prev + 1))}
                      disabled={currentCompletedPage >= completedTotalPages}
                      className="flex items-center justify-center h-9 w-9 leading-tight text-slate-500 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {Math.min(completedTotalPages, currentCompletedPage + 1)}
                    </button>
                    <button
                      onClick={() => setCompletedPage((prev) => Math.min(completedTotalPages, prev + 1))}
                      disabled={currentCompletedPage >= completedTotalPages}
                      className="flex items-center justify-center h-9 px-3 leading-tight text-slate-500 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-r-lg hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('supplier.orders.next')}
                    </button>
                  </div>
                </nav>
              </div>
            </div>
          )}

          {showNotificationsPanel && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full">
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{t('common.notifications') || 'Notifications'}</h3>
                  <button onClick={() => setShowNotificationsPanel(false)} className="text-slate-400 hover:text-slate-700">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="p-6 space-y-3 text-sm text-slate-700">
                  <p>{t('supplier.orders.statusUpdateSuccess') || 'Order status updates will appear here.'}</p>
                  <p>{t('supplier.dashboard.pendingActions') || 'New order actions and confirmations are listed in this feed.'}</p>
                </div>
                <div className="p-4 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => setShowNotificationsPanel(false)}
                    className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium text-sm"
                  >
                    {t('common.close') || 'Close'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showChatPanel && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full">
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{t('common.chat') || 'Messages'}</h3>
                  <button onClick={() => setShowChatPanel(false)} className="text-slate-400 hover:text-slate-700">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="p-6 space-y-3 text-sm text-slate-700">
                  <p>{t('supplier.orders.title')} support chat is available during business hours.</p>
                  <p>{t('supplier.orders.viewDetails')} messages are linked to each order record.</p>
                </div>
                <div className="p-4 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => setShowChatPanel(false)}
                    className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium text-sm"
                  >
                    {t('common.close') || 'Close'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedOrderDetails && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full">
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{t('supplier.orders.viewDetails')}</h3>
                  <button onClick={() => setSelectedOrderDetails(null)} className="text-slate-400 hover:text-slate-700">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="p-6 space-y-3 text-sm text-slate-700">
                  <p><span className="font-semibold">{t('supplier.orders.orderId')}:</span> {selectedOrderDetails.id}</p>
                  <p><span className="font-semibold">{t('supplier.orders.orderDate')}:</span> {new Date(selectedOrderDetails.date).toLocaleString()}</p>
                  <p><span className="font-semibold">{t('supplier.orders.amount')}:</span> ${selectedOrderDetails.amount.toLocaleString()}</p>
                  <p><span className="font-semibold">{t('supplier.orders.status')}:</span> {selectedOrderDetails.status}</p>
                </div>
                <div className="p-4 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => setSelectedOrderDetails(null)}
                    className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium text-sm"
                  >
                    {t('common.close') || 'Close'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    )
  }




  const FinancialsView = () => {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [financials, setFinancials] = useState<{ balance: number, creditLimit: number }>({ balance: 0, creditLimit: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      loadData();
    }, []);

    const loadData = async () => {
      if (!currentUser) return;
      setLoading(true);
      try {
        const [txs, bal] = await Promise.all([
          transactionsService.getMyTransactions(currentUser.id),
          transactionsService.getBalance(currentUser.id)
        ]);
        setTransactions(txs || []);
        setFinancials(bal);
      } catch (error) {
        logger.error('Failed to load financials', error);
        toast.error('Failed to load financial data');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="p-4 md:p-8 lg:p-12 animate-in fade-in duration-300 space-y-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-neutral-800">{t('sidebar.financials') || 'Financials'}</h1>
          <p className="text-neutral-500">{t('supplier.financials.subtitle') || 'Manage your balance and view transaction history'}</p>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <p className="text-sm text-neutral-500 font-medium">{t('supplier.financials.currentBalance') || 'Current Balance'}</p>
            <p className="text-3xl font-bold text-neutral-800 mt-2">${financials.balance.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <p className="text-sm text-neutral-500 font-medium">{t('supplier.financials.creditLimit') || 'Credit Limit'}</p>
            <p className="text-3xl font-bold text-neutral-800 mt-2">${financials.creditLimit.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <p className="text-sm text-neutral-500 font-medium">{t('supplier.financials.availableCredit') || 'Available Credit'}</p>
            <p className="text-3xl font-bold text-green-600 mt-2">${(financials.creditLimit - financials.balance).toLocaleString()}</p>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-neutral-200">
            <h3 className="font-bold text-lg text-neutral-800">{t('supplier.financials.history') || 'Transaction History'}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-neutral-500">{t('supplier.financials.date')}</th>
                  <th className="px-6 py-4 font-semibold text-neutral-500">{t('supplier.financials.type')}</th>
                  <th className="px-6 py-4 font-semibold text-neutral-500">{t('supplier.financials.description')}</th>
                  <th className="px-6 py-4 font-semibold text-neutral-500 text-right">{t('supplier.financials.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {loading ? (
                  <tr><td colSpan={4} className="p-8 text-center">{t('supplier.financials.loading')}</td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-neutral-500">{t('supplier.financials.noTransactions')}</td></tr>
                ) : (
                  transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4 text-neutral-500">{new Date(tx.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase ${tx.type === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                          tx.type === 'REFUND' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                          {t(`supplier.financials.types.${tx.type.toLowerCase()}`, tx.type.replace('_', ' '))}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-neutral-700">{tx.description || '-'}</td>
                      <td className={`px-6 py-4 text-right font-mono font-medium ${['PAYMENT', 'REFUND'].includes(tx.type) ? 'text-green-600' : 'text-red-600'
                        }`}>
                        {['PAYMENT', 'REFUND'].includes(tx.type) ? '+' : '-'}${tx.amount.toLocaleString()}
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

  const SettingsView = () => {
    const currentUser = useStore(state => state.currentUser);
    const updateUser = useStore(state => state.updateUser);
    const toast = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [formData, setFormData] = useState({
      companyName: currentUser?.companyName || '',
      email: currentUser?.email || '',
      phone: '', // Add phone to User type if needed, or fetch from profile
      businessType: 'Manufacturer' // Default or fetch
    });
    const [passwordData, setPasswordData] = useState({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
      if (!currentUser) return;
      setIsSaving(true);
      try {
        await updateUser(currentUser.id, {
          companyName: formData.companyName,
          // phone: formData.phone, // Uncomment when User type has phone
          // businessType: formData.businessType
        });
        toast.success(t('supplier.settings.saved') || 'Settings saved successfully');
      } catch (error) {
        logger.error('Error saving settings:', error);
        toast.error(t('supplier.settings.saveFailed') || 'Failed to save settings');
      } finally {
        setIsSaving(false);
      }
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setPasswordData((prev) => ({ ...prev, [name]: value }));
    };

    const handleUpdatePassword = async () => {
      if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
        toast.error(t('supplier.settings.passwordRequired') || 'Please complete all password fields');
        return;
      }

      if (!currentUser?.email) {
        toast.error(t('supplier.settings.passwordUpdateFailed') || 'Failed to update password');
        return;
      }

      if (passwordData.newPassword.length < 8) {
        toast.error(t('supplier.settings.passwordTooShort') || 'Password must be at least 8 characters');
        return;
      }

      if (passwordData.currentPassword === passwordData.newPassword) {
        toast.error(t('supplier.settings.passwordMustDiffer') || 'New password must be different from current password');
        return;
      }

      if (passwordData.newPassword !== passwordData.confirmPassword) {
        toast.error(t('supplier.settings.passwordMismatch') || 'New password and confirmation do not match');
        return;
      }

      setIsUpdatingPassword(true);
      try {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: currentUser.email,
          password: passwordData.currentPassword,
        });
        if (verifyError) {
          throw new Error(t('supplier.settings.invalidCurrentPassword') || 'Current password is incorrect');
        }

        const { error } = await supabase.auth.updateUser({ password: passwordData.newPassword });
        if (error) throw error;

        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        toast.success(t('supplier.settings.passwordUpdated') || 'Password updated successfully');
      } catch (error: any) {
        logger.error('Error updating password:', error);
        toast.error(error?.message || t('supplier.settings.passwordUpdateFailed') || 'Failed to update password');
      } finally {
        setIsUpdatingPassword(false);
      }
    };

    return (
      <div className="space-y-8 animate-in fade-in duration-500 p-4 md:p-8 lg:p-12">
        <div className="flex flex-col gap-1">
          <h1 className="text-neutral-800 text-3xl font-bold tracking-tight">{t('supplier.settings.title')}</h1>
          <p className="text-neutral-500 text-base">{t('supplier.settings.subtitle')}</p>
        </div>

        {/* Profile Picture */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <ProfilePictureUpload
            currentImage={currentUser?.profilePicture}
            userName={currentUser?.name || 'User'}
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-6">{t('supplier.settings.companyInfo')}</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.companyName')}</label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.contactEmail')}</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  disabled
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.phoneNumber')}</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder={t('common.phonePlaceholder')}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.businessType')}</label>
                <select
                  name="businessType"
                  value={formData.businessType}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="Manufacturer">{t('supplier.settings.manufacturer')}</option>
                  <option value="Distributor">{t('supplier.settings.distributor')}</option>
                  <option value="Wholesaler">{t('supplier.settings.wholesaler')}</option>
                </select>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-200 flex justify-end gap-3">
            <button
              onClick={() => setFormData({
                companyName: currentUser?.companyName || '',
                email: currentUser?.email || '',
                phone: '',
                businessType: 'Manufacturer'
              })}
              className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
              {t('common.save')}
            </button>
          </div>
        </div>


        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-6">{t('supplier.settings.notifications')}</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900">{t('supplier.settings.newRfqAlerts')}</p>
                <p className="text-sm text-slate-500">{t('supplier.settings.newRfqAlertsDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ms-4">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors"></div>
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white border border-slate-300 rounded-full shadow transition-all duration-200 peer-checked:left-[22px]"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900">{t('supplier.settings.orderUpdates')}</p>
                <p className="text-sm text-slate-500">{t('supplier.settings.orderUpdatesDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ms-4">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors"></div>
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white border border-slate-300 rounded-full shadow transition-all duration-200 peer-checked:left-[22px]"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900">{t('supplier.settings.paymentNotifications')}</p>
                <p className="text-sm text-slate-500">{t('supplier.settings.paymentNotificationsDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ms-4">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors"></div>
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white border border-slate-300 rounded-full shadow transition-all duration-200 peer-checked:left-[22px]"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-6">{t('supplier.settings.security')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.currentPassword')}</label>
              <input
                type="password"
                name="currentPassword"
                value={passwordData.currentPassword}
                onChange={handlePasswordChange}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={t('supplier.settings.currentPassword')}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.newPassword')}</label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('supplier.settings.newPassword')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.confirmPassword')}</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('supplier.settings.confirmPassword')}
                />
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={handleUpdatePassword}
                disabled={isUpdatingPassword}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {t('supplier.settings.updatePassword')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'dashboard') return <DashboardView />;
  if (activeTab === 'products') {
    if (editingProduct) return (
      <SupplierProductForm
        product={editingProduct}
        onBack={() => setEditingProduct(null)}
        onSave={handleSaveProduct}
        onChange={(updates) => setEditingProduct(prev => prev ? ({ ...prev, ...updates }) : null)}
      />
    );
    return <ProductsView />;
  }
  if (activeTab === 'requests') return <RequestsView />;
  if (activeTab === 'browse') return <BrowseRFQsView />;
  if (activeTab === 'quotes') return <QuotesView />;
  if (activeTab === 'financials') return <FinancialsView />;
  if (activeTab === 'inventory') return <SupplierInventory />;
  if (activeTab === 'orders') return <OrdersView />;
  if (activeTab === 'settings') return <SettingsView />;
  if (activeTab === 'help') {
    return (
      <div className="p-4 md:p-8 lg:p-12 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-2xl font-bold text-slate-900">{t('sidebar.help')}</h2>
          <p className="text-slate-500 mt-2">{t('help.description') || 'Need support? Use one of the options below.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('requests')}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              {t('help.reviewRequests') || 'Review incoming RFQs'}
            </button>
            <button
              onClick={() => onNavigate('settings')}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              {t('help.openSettings') || 'Open account settings'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default / Fallback
  return (
    <div className="p-12 text-center">
      <h2 className="text-xl font-bold text-neutral-700">{t('supplier.fallback.comingSoon')}</h2>
      <p className="text-neutral-500 mt-2">{t('supplier.fallback.workingOn', { section: activeTab })}</p>
    </div>
  );
};
