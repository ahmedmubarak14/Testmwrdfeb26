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
import { canTransitionOrderStatus, getAllowedOrderStatusTransitions } from '../../services/orderStatusService';
import { logger } from '../../utils/logger';
import { getUserFacingError } from '../../utils/errorMessages';
import { SupplierCustomRequests } from '../../components/supplier/SupplierCustomRequests';
import { categoryService } from '../../services/categoryService';
import { calculateSimilarity } from '../../utils/stringMatch';
import {
  PortalPageHeader,
  PortalMetricCard,
  PortalPageShell,
  PortalSection
} from '../../components/ui/PortalDashboardShell';

interface SupplierPortalProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

export const SupplierPortal: React.FC<SupplierPortalProps> = ({ activeTab, onNavigate }) => {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const {
    products: allProducts,
    rfqs: allRfqs,
    quotes: allQuotes,
    orders: allOrders,
    users,
    currentUser,
    addProduct,
    deleteProduct,
    loadProducts,
    loadQuotes,
    loadRFQs,
    loadOrders,
    loadUsers,
  } = useStore();
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [selectedQuoteRFQId, setSelectedQuoteRFQId] = useState<string | null>(null);
  const [smartMatchCatalog, setSmartMatchCatalog] = useState<Array<{ id: string; name: string; brand?: string; category?: string }>>([]);
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

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'SUPPLIER') return;

    const loadSupplierData = async () => {
      const results = await Promise.allSettled([
        loadProducts(),
        loadRFQs(),
        loadQuotes(),
        loadOrders(),
        loadUsers(),
      ]);
      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) {
        toast.error(t('supplier.fallback.loadError', 'Some dashboard data failed to load. Please refresh again.'));
      }
    };

    void loadSupplierData();
  }, [activeTab, currentUser?.id, currentUser?.role, loadOrders, loadProducts, loadQuotes, loadRFQs, loadUsers]);

  useEffect(() => {
    let isActive = true;

    const loadSmartMatchCatalog = async () => {
      try {
        const rows = await masterProductService.getMasterProducts();
        if (!isActive) return;
        const mappedRows = (rows || []).map((row: MasterProduct) => ({
          id: `master-${row.id}`,
          name: row.name,
          brand: row.brand || undefined,
          category: row.category || undefined,
        }));
        if (mappedRows.length > 0) {
          setSmartMatchCatalog(mappedRows);
          return;
        }

        setSmartMatchCatalog(
          allProducts.map((product) => ({
            id: `product-${product.id}`,
            name: product.name,
            brand: product.brand || undefined,
            category: product.category || undefined,
          }))
        );
      } catch (error) {
        logger.warn('Smart Match catalog fallback unavailable', error);
        if (!isActive) return;
        setSmartMatchCatalog(
          allProducts.map((product) => ({
            id: `product-${product.id}`,
            name: product.name,
            brand: product.brand || undefined,
            category: product.category || undefined,
          }))
        );
      }
    };

    void loadSmartMatchCatalog();
    return () => {
      isActive = false;
    };
  }, [allProducts]);

  const handleDraftQuote = (rfqId: string) => {
    setSelectedQuoteRFQId(rfqId);
    onNavigate('quotes');
  };

  const isAutoQuoteSubmittedForRfq = (rfqId: string) => {
    if (!currentUser) return false;
    const existingQuote = allQuotes.find((quote) => quote.supplierId === currentUser.id && quote.rfqId === rfqId);
    if (!existingQuote) return false;
    const quoteWithType = existingQuote as Quote & { type?: 'auto' | 'custom' };
    if (quoteWithType.type === 'auto') return true;
    // Legacy fallback: treat as auto-quote if RFQ was auto-triggered and supplier quote is already client-visible.
    const rfq = allRfqs.find((item) => item.id === rfqId);
    return Boolean(rfq?.autoQuoteTriggered && existingQuote.status === 'SENT_TO_CLIENT');
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
    reader.onload = async () => {
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

      const createTasks: Promise<boolean>[] = [];
      rows.slice(1).forEach((row, index) => {
        const cells = row.split(',').map((value) => value.trim());
        const name = cells[nameIndex];
        if (!name) return;

        const parsedCost = Number(cells[costPriceIndex] || '0');
        const costPrice = Number.isFinite(parsedCost) ? parsedCost : 0;
        if (costPrice <= 0) return;

        createTasks.push(addProduct({
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
        }).then(() => true).catch(() => false));
      });

      if (createTasks.length === 0) {
        toast.error(t('supplier.products.bulkUploadNoValidRows') || 'No valid product rows were found in the CSV file.');
      } else {
        const results = await Promise.all(createTasks);
        const createdCount = results.filter(Boolean).length;
        const failedCount = results.length - createdCount;

        if (createdCount === 0) {
          toast.error(t('errors.saveFailed') || 'Failed to save data');
          return;
        }

        toast.success(
          t('supplier.products.bulkUploadCreated', { count: createdCount })
          || `Imported ${createdCount} product${createdCount === 1 ? '' : 's'} successfully.`
        );

        if (failedCount > 0) {
          toast.error(
            t('supplier.products.bulkUploadPartialFailure', { count: failedCount })
            || `${failedCount} product${failedCount === 1 ? '' : 's'} failed to import.`
          );
        }
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

    const normalizedSupplierPrice = Number(editingProduct.supplierPrice ?? 0);
    if (!Number.isFinite(normalizedSupplierPrice) || normalizedSupplierPrice <= 0) {
      toast.error(t('supplier.products.pricePositiveRequired'));
      return;
    }

    try {
      if (editingProduct.id) {
        // Update existing
        const updated = await api.updateProduct(editingProduct.id, {
          ...editingProduct,
          supplierPrice: Math.round(normalizedSupplierPrice * 100) / 100,
        });
        if (!updated) {
          throw new Error('Unable to update product');
        }
        await loadProducts();
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
          supplierPrice: Math.round(normalizedSupplierPrice * 100) / 100,
          sku: editingProduct.sku || `SKU-${Date.now()}`,

        };
        const created = await api.createProduct(newProduct);
        if (!created) {
          throw new Error('Unable to create product');
        }
        await loadProducts();
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
    const acceptedQuotesCount = supplierQuotes.filter((quote) => quote.status === 'ACCEPTED').length;
    const quoteWinRate = supplierQuotes.length > 0 ? (acceptedQuotesCount / supplierQuotes.length) * 100 : 0;
    const supplierOrders = allOrders.filter((order) => supplierId && order.supplierId === supplierId);
    const completedOrders = supplierOrders.filter((order) => (
      order.status === OrderStatus.DELIVERED || order.status === OrderStatus.COMPLETED
    ));
    const activeOrders = supplierOrders.filter((order) => ![
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
      OrderStatus.REFUNDED,
    ].includes(order.status));
    const pendingPayoutOrders = completedOrders.filter((order) => {
      const referenceDate = new Date(order.updatedAt || order.createdAt || order.date);
      if (Number.isNaN(referenceDate.getTime())) return false;
      const payoutDate = new Date(referenceDate);
      payoutDate.setDate(referenceDate.getDate() + 7);
      return payoutDate > new Date();
    });
    // Financial metrics state
    const [stats, setStats] = useState({
      earnings: completedOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
      pendingPayouts: pendingPayoutOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
      ordersCount: completedOrders.length
    });

    useEffect(() => {
      let active = true;
      const fetchFinancials = async () => {
        if (supplierId) {
          try {
            const data = await api.getSupplierFinancials(supplierId);
            if (active) {
              setStats({
                earnings: data.totalEarnings,
                pendingPayouts: data.pendingPayouts,
                ordersCount: data.completedOrders
              });
            }
          } catch (e) {
            logger.warn('Failed to fetch exact financials, falling back to local calculation');
          }
        }
      };
      fetchFinancials();
      return () => { active = false; };
    }, [supplierId]);

    const pendingPayoutAmount = stats.pendingPayouts;
    const totalTransactionValue = stats.earnings;
    const supplierRating = Number(currentUser?.rating || users.find((user) => user.id === supplierId)?.rating || 0);
    const quotePendingAdminCount = supplierQuotes.filter((quote) => quote.status === 'PENDING_ADMIN').length;
    const quotedRfqIds = new Set(supplierQuotes.map((quote) => quote.rfqId));
    const openRfqs = allRfqs
      .filter((rfq) => rfq.status === 'OPEN' && !quotedRfqIds.has(rfq.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const pendingRFQs = openRfqs.slice(0, 4);
    const supplierProductsCount = allProducts.filter((product) => supplierId && product.supplierId === supplierId).length;
    const recentOrders = [...supplierOrders]
      .sort((a, b) => new Date(b.date || b.updatedAt || b.createdAt || '').getTime() - new Date(a.date || a.updatedAt || a.createdAt || '').getTime())
      .slice(0, 5);
    const sarFormatter = new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-SA' : 'en-SA', {
      style: 'currency',
      currency: 'SAR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const getClientLabel = (clientId: string) => {
      const client = users.find((user) => user.id === clientId);
      return client?.publicId || t('admin.overview.unknownClient');
    };

    return (
      <div data-testid="supplier-dashboard-view">
        <PortalPageShell className="animate-in fade-in duration-500">
          <PortalPageHeader
            portalLabel={t('sidebar.supplierPortal')}
            title={t('supplier.dashboard.title')}
            subtitle={t('supplier.dashboard.welcomeMessage', { company: currentUser?.companyName || currentUser?.name || '' })}
            actions={(
              <button
                onClick={() => onNavigate('orders')}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <span className="material-symbols-outlined text-base">receipt_long</span>
                {t('supplier.dashboard.goToOrders')}
              </button>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <PortalMetricCard
              label={t('supplier.dashboard.transactionsPrimary')}
              value={completedOrders.length}
              icon="payments"
              tone="primary"
              hint={`${sarFormatter.format(totalTransactionValue)} · ${t('supplier.dashboard.transactionsPrimaryHint')}`}
            />
            <PortalMetricCard
              label={t('supplier.dashboard.newRfqs')}
              value={openRfqs.length}
              icon="new_releases"
              tone="warning"
              action={(
                <button
                  data-testid="supplier-dashboard-view-rfqs-button"
                  onClick={() => onNavigate('requests')}
                  className="text-sm font-semibold text-[#137fec] hover:underline"
                >
                  {t('supplier.dashboard.viewRfqs')}
                </button>
              )}
            />
            <PortalMetricCard
              label={t('supplier.dashboard.quotesSubmitted')}
              value={supplierQuotes.length}
              icon="receipt_long"
              tone="neutral"
              action={(
                <button
                  data-testid="supplier-dashboard-view-quotes-button"
                  onClick={() => onNavigate('quotes')}
                  className="text-sm font-semibold text-[#137fec] hover:underline"
                >
                  {t('supplier.dashboard.viewQuotes')}
                </button>
              )}
            />
            <PortalMetricCard
              label={t('supplier.dashboard.pendingPayouts')}
              value={sarFormatter.format(pendingPayoutAmount)}
              icon="account_balance_wallet"
              tone="success"
              hint={t('supplier.dashboard.pendingPayoutHint', 'Payments currently being processed')}
            />
            <PortalMetricCard
              label={t('supplier.dashboard.ratingAndOrders')}
              value={supplierRating.toFixed(1)}
              icon="star"
              tone="neutral"
              hint={t('supplier.dashboard.ordersCount', { count: supplierOrders.length })}
            />
            <PortalMetricCard
              label={t('supplier.dashboard.quoteWinRate')}
              value={`${quoteWinRate.toFixed(1)}%`}
              icon="monitoring"
              tone="info"
              action={(
                <div className="inline-flex items-center gap-1 text-xs font-semibold text-[#137fec]">
                  <span className="material-symbols-outlined text-base">
                    {quoteWinRate >= 50 ? 'trending_up' : 'trending_down'}
                  </span>
                  <span>
                    {quoteWinRate >= 50
                      ? t('supplier.dashboard.winRateTrendPositive')
                      : t('supplier.dashboard.winRateTrendNegative')}
                  </span>
                </div>
              )}
            />
            <PortalMetricCard
              label={t('supplier.dashboard.manageProducts')}
              value={supplierProductsCount}
              icon="inventory_2"
              tone="neutral"
              action={(
                <button
                  data-testid="supplier-dashboard-view-catalog-button"
                  onClick={() => onNavigate('products')}
                  className="text-sm font-semibold text-[#137fec] hover:underline"
                >
                  {t('supplier.dashboard.viewCatalog')}
                </button>
              )}
            />
          </div>

          <PortalSection
            title={t('supplier.dashboard.pendingActions')}
            action={quotePendingAdminCount > 0 ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                {t('supplier.dashboard.quotesAwaitingAdmin', { count: quotePendingAdminCount })}
              </span>
            ) : undefined}
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-neutral-50 border-y border-neutral-200">
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
                        <div className="space-y-1">
                          <StatusBadge status={rfq.status === 'OPEN' ? 'pending' : rfq.status.toLowerCase()} size="sm" />
                          {isAutoQuoteSubmittedForRfq(rfq.id) && (
                            <p className="text-[11px] text-blue-700 font-medium">{t('supplier.rfqs.autoQuoteSubmitted')}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button data-testid={`supplier-dashboard-view-and-quote-${rfq.id}`} onClick={() => handleDraftQuote(rfq.id)} className="text-[#137fec] font-semibold hover:underline flex items-center gap-1">
                          {t('supplier.dashboard.viewAndQuote')} <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pendingRFQs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center">
                        <p className="text-sm font-semibold text-neutral-700">{t('supplier.dashboard.noPendingActions')}</p>
                        <p className="text-xs text-neutral-500 mt-1">{t('supplier.dashboard.noPendingActionsHint')}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PortalSection>

          <PortalSection
            title={t('supplier.dashboard.recentOrderActivity')}
            action={(
              <button
                onClick={() => onNavigate('orders')}
                className="text-sm font-semibold text-[#137fec] hover:underline"
              >
                {t('supplier.dashboard.goToOrders')}
              </button>
            )}
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-neutral-50 border-y border-neutral-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-neutral-500">{t('supplier.orders.orderId')}</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-neutral-500">{t('supplier.orders.client')}</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-neutral-500">{t('supplier.orders.amount')}</th>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-neutral-500">{t('supplier.orders.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-3 text-sm font-semibold text-neutral-800">{order.id}</td>
                      <td className="px-6 py-3 text-sm text-neutral-700">{getClientLabel(order.clientId)}</td>
                      <td className="px-6 py-3 text-sm text-neutral-800">{sarFormatter.format(order.amount || 0)}</td>
                      <td className="px-6 py-3">
                        <StatusBadge status={order.status.toLowerCase().replace(/_/g, '_')} size="sm" />
                      </td>
                    </tr>
                  ))}
                  {recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-neutral-500 text-sm">
                        {t('supplier.dashboard.noOrdersYet')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PortalSection>
        </PortalPageShell>
      </div>
    );
  };







  const ProductsView = () => {
    const [showGallery, setShowGallery] = useState(false);
    const [activeCategory, setActiveCategory] = useState('All');
    const [activeSubCategory, setActiveSubCategory] = useState('All');
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [categoryTreeMap, setCategoryTreeMap] = useState<Record<string, string[]>>({});
    const [productsPage, setProductsPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBrand, setSelectedBrand] = useState('');
    const [stockModalProduct, setStockModalProduct] = useState<{
      id: string;
      name: string;
      stock: number;
    } | null>(null);

    const handleStockUpdated = async () => {
      setStockModalProduct(null);
      try {
        await loadProducts();
      } catch (error) {
        logger.error('Failed to refresh products after stock update:', error);
        toast.error(t('supplier.products.loadError'));
      }
    };

    useEffect(() => {
      let isMounted = true;

      const loadCategoryFilters = async () => {
        try {
          const [mainCategories, tree] = await Promise.all([
            categoryService.getMainCategories(),
            categoryService.getCategoryTree(),
          ]);

          if (!isMounted) return;

          setAvailableCategories(mainCategories || []);
          const mappedTree: Record<string, string[]> = {};
          Object.entries(tree || {}).forEach(([category, subcategories]) => {
            mappedTree[category] = (subcategories || []).map((subcategory) => subcategory.name);
          });
          setCategoryTreeMap(mappedTree);
        } catch (error) {
          logger.error('Failed to load supplier product category filters:', error);
        }
      };

      loadCategoryFilters();
      return () => {
        isMounted = false;
      };
    }, []);

    useEffect(() => {
      setProductsPage(1);
    }, [activeCategory, activeSubCategory, searchTerm, selectedBrand]);

    useEffect(() => {
      setActiveSubCategory('All');
    }, [activeCategory]);

    if (showGallery) {
      return <MasterProductGallery onBack={() => setShowGallery(false)} />;
    }

    const supplierProducts = allProducts.filter(p => currentUser && p.supplierId === currentUser.id);

    const categoryOptions = React.useMemo(() => {
      const categorySet = new Set<string>(availableCategories);
      supplierProducts.forEach((product) => {
        if (product.category) categorySet.add(product.category);
      });
      return ['All', ...Array.from(categorySet).sort((a, b) => a.localeCompare(b))];
    }, [availableCategories, supplierProducts]);

    const subCategoryOptions = React.useMemo(() => {
      const subcategorySet = new Set<string>();

      if (activeCategory === 'All') {
        Object.values(categoryTreeMap).forEach((subcategories) => {
          subcategories.forEach((subcategory) => subcategorySet.add(subcategory));
        });
      } else {
        (categoryTreeMap[activeCategory] || []).forEach((subcategory) => subcategorySet.add(subcategory));
      }

      supplierProducts.forEach((product) => {
        if (!product.subcategory) return;
        if (activeCategory !== 'All' && product.category !== activeCategory) return;
        subcategorySet.add(product.subcategory);
      });

      return ['All', ...Array.from(subcategorySet).sort((a, b) => a.localeCompare(b))];
    }, [activeCategory, categoryTreeMap, supplierProducts]);

    const availableBrands = React.useMemo(
      () =>
        [...new Set(
          supplierProducts
            .map((product) => product.brand?.trim())
            .filter((brand): brand is string => Boolean(brand))
        )].sort((a, b) => a.localeCompare(b)),
      [supplierProducts]
    );

    const normalizeTaxonomyKey = (value: string) =>
      String(value || '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '')
        .trim();

    const toCamelCase = (value: string) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase());

    const translateTaxonomyLabel = (label: string, candidateKeys: string[]) => {
      for (const key of candidateKeys) {
        if (key && i18n.exists(key)) {
          return t(key);
        }
      }
      return label;
    };

    // Helper to map category to translation key
    const getCategoryLabel = (cat: string) => {
      if (cat === 'All') return t('common.all');
      const keyMap: Record<string, string> = {
        Office: 'office',
        'IT Supplies': 'itSupplies',
        Breakroom: 'breakroom',
        Janitorial: 'janitorial',
        Maintenance: 'maintenance',
        General: 'general',
      };
      const normalized = normalizeTaxonomyKey(cat);
      const mapped = keyMap[cat] || normalized;

      return translateTaxonomyLabel(cat, [
        `categories.${mapped}.label`,
        `categories.sub.${mapped}`,
        `categories.office.subcategories.${mapped}.label`,
        `categories.it.subcategories.${mapped}.label`,
        `categories.breakroom.subcategories.${mapped}.label`,
        `categories.janitorial.subcategories.${mapped}.label`,
        `categories.maintenance.subcategories.${mapped}.label`,
        `subcategories.office.${toCamelCase(cat)}`,
        `subcategories.it.${toCamelCase(cat)}`,
        `subcategories.breakroom.${toCamelCase(cat)}`,
        `subcategories.janitorial.${toCamelCase(cat)}`,
        `subcategories.maintenance.${toCamelCase(cat)}`,
      ]);
    };

    // Helper to map subcategory to translation key
    const getSubCategoryLabel = (sub: string) => {
      if (sub === 'All') return t('common.all');
      const keyMap: Record<string, string> = {
        All: 'all',
        Tools: 'tools',
        Electrical: 'electrical',
        Plumbing: 'plumbing',
        Hardware: 'hardware',
        'Safety Equipment': 'safetyEquipment',
        Janitorial: 'janitorial',
      };
      const normalized = normalizeTaxonomyKey(sub);
      const mapped = keyMap[sub] || normalized;
      const camel = toCamelCase(sub);

      return translateTaxonomyLabel(sub, [
        `categories.sub.${mapped}`,
        `categories.office.subcategories.${mapped}.label`,
        `categories.it.subcategories.${mapped}.label`,
        `categories.breakroom.subcategories.${mapped}.label`,
        `categories.janitorial.subcategories.${mapped}.label`,
        `categories.maintenance.subcategories.${mapped}.label`,
        `subcategories.office.${camel}`,
        `subcategories.it.${camel}`,
        `subcategories.breakroom.${camel}`,
        `subcategories.janitorial.${camel}`,
        `subcategories.maintenance.${camel}`,
      ]);
    };

    let filteredProducts = supplierProducts.filter((product) => {
      if (activeCategory !== 'All' && product.category !== activeCategory) return false;
      if (activeSubCategory !== 'All' && product.subcategory !== activeSubCategory) return false;
      if (selectedBrand && product.brand !== selectedBrand) return false;

      const normalizedSearch = searchTerm.trim().toLowerCase();
      if (!normalizedSearch) return true;

      const searchableFields = [
        product.name,
        product.description,
        product.sku,
        product.brand,
        product.category,
        product.subcategory
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableFields.includes(normalizedSearch);
    });

    const productsPerPage = 12;
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
          {/* Category / Sub-category Filters & Bulk Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                <span className="text-sm font-medium text-slate-700 mr-2 whitespace-nowrap">{t('supplier.products.category')}</span>
                {categoryOptions.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap border transition-colors ${activeCategory === category
                      ? 'text-blue-700 bg-white border-blue-600'
                      : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    {getCategoryLabel(category)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                <span className="text-sm font-medium text-slate-700 mr-2 whitespace-nowrap">{t('supplier.products.subCategory')}</span>
                {subCategoryOptions.map((subcategory) => (
                  <button
                    key={subcategory}
                    onClick={() => setActiveSubCategory(subcategory)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap border transition-colors ${activeSubCategory === subcategory
                      ? 'text-blue-700 bg-white border-blue-600'
                      : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    {getSubCategoryLabel(subcategory)}
                  </button>
                ))}
              </div>
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

        <div className="flex-1 px-4 md:px-8 pb-8 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-6 mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <SearchBar
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder={t('supplier.rfqs.searchPlaceholder')}
                  size="md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('client.browse.brand')}
                </label>
                <select
                  value={selectedBrand}
                  onChange={(event) => setSelectedBrand(event.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                  aria-label={t('client.browse.brand')}
                >
                  <option value="">{t('client.browse.allBrands')}</option>
                  {availableBrands.map((brand) => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {t('supplier.products.showingItems', { start: showingStart, end: showingEnd, total: filteredProducts.length })}
              </p>
              {(searchTerm || selectedBrand || activeCategory !== 'All' || activeSubCategory !== 'All') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedBrand('');
                    setActiveCategory('All');
                    setActiveSubCategory('All');
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-base">filter_alt_off</span>
                  {t('client.browse.clearFilters')}
                </button>
              )}
            </div>
          </div>

          {paginatedProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {paginatedProducts.map((product) => {
                const stock = product.stock ?? 0;
                const status = product.status || 'PENDING';
                const isApproved = status.toUpperCase() === 'APPROVED';
                const isRejected = status.toUpperCase() === 'REJECTED';
                const availabilityClass = stock === 0
                  ? 'bg-red-100 text-red-700'
                  : stock < 10
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-100 text-green-700';

                return (
                  <div key={product.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    <button
                      type="button"
                      onClick={() => setEditingProduct(product)}
                      className="w-full h-44 bg-slate-50 border-b border-slate-200 flex items-center justify-center p-4"
                      aria-label={`${t('common.edit')} ${product.name}`}
                    >
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="max-h-full w-auto object-contain" />
                      ) : (
                        <span className="material-symbols-outlined text-slate-300 text-5xl">image</span>
                      )}
                    </button>
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 line-clamp-2">{product.name}</h3>
                          <p className="text-xs text-slate-500 truncate">{product.sku || t('common.notAvailable')}</p>
                        </div>
                        <span className="text-sm font-bold text-[#0A2540]">SAR {Number(product.supplierPrice || 0).toFixed(2)}</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {getCategoryLabel(product.category)}
                        </span>
                        {!!product.subcategory && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            {getSubCategoryLabel(product.subcategory)}
                          </span>
                        )}
                        {!!product.brand && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                            {product.brand}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-medium ${availabilityClass}`}>
                          {stock} {t('supplier.products.units')}
                        </span>
                        <button
                          onClick={() => setStockModalProduct({ id: product.id, name: product.name, stock })}
                          className="text-[#137fec] font-semibold hover:underline"
                        >
                          {t('supplier.products.update')}
                        </button>
                      </div>

                      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${isApproved ? 'text-green-700 bg-green-100' : isRejected ? 'text-red-700 bg-red-100' : 'text-yellow-700 bg-yellow-100'}`}>
                        <span className="material-symbols-outlined text-sm">
                          {isApproved ? 'check_circle' : isRejected ? 'cancel' : 'schedule'}
                        </span>
                        {isApproved ? t('supplier.products.live') : isRejected ? t('supplier.products.rejected') : t('supplier.products.pending')}
                      </div>

                      {isRejected && (
                        <p className="text-xs text-slate-500">
                          {t('supplier.products.reason')}: {t('supplier.products.adminReview')}
                        </p>
                      )}

                      <div className="pt-2 flex items-center gap-2">
                        <button
                          onClick={() => setEditingProduct(product)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 text-xs font-semibold rounded-lg text-slate-700 bg-white hover:bg-slate-50"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleRemoveProduct(product)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 text-xs font-semibold rounded-lg text-slate-700 bg-white hover:bg-slate-50"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          {t('supplier.products.remove')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <EmptyState type="products" title={t('common.noResults')} />
            </div>
          )}

          <div className="mt-6 px-2 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-600">{t('supplier.products.showingItems', { start: showingStart, end: showingEnd, total: filteredProducts.length })}</p>
            <nav className="flex items-center rounded-md border border-slate-300 bg-white">
              <button
                onClick={() => setProductsPage((prev) => Math.max(1, prev - 1))}
                disabled={currentProductPage <= 1}
                className="px-3 py-2 text-slate-500 hover:bg-slate-50 rounded-l-md border-r border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('supplier.orders.previous')}
              >
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <button disabled className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border-r border-slate-300">{currentProductPage}</button>
              <button
                onClick={() => setProductsPage((prev) => Math.min(totalProductPages, prev + 1))}
                disabled={currentProductPage >= totalProductPages}
                className="px-3 py-2 text-slate-500 hover:bg-slate-50 rounded-r-md disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('common.next')}
              >
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </nav>
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
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
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
                    <div className="space-y-1">
                      <StatusBadge status={rfq.status === 'OPEN' ? 'pending' : rfq.status.toLowerCase()} size="sm" />
                      {isAutoQuoteSubmittedForRfq(rfq.id) && (
                        <p className="text-[11px] text-blue-700 font-medium">{t('supplier.rfqs.autoQuoteSubmitted')}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleDraftQuote(rfq.id)} className="text-[#137fec] font-bold text-sm hover:underline">{t('supplier.rfqs.submitQuote')}</button>
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

                    {isAutoQuoteSubmittedForRfq(rfq.id) && (
                      <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {t('supplier.rfqs.autoQuoteSubmitted')}
                      </div>
                    )}

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
    // Per-item pricing state: keyed by item index
    const [itemPricing, setItemPricing] = useState<Record<number, { unitPrice: string; leadTime: string; notes: string }>>({});
    const [quoteShipping, setQuoteShipping] = useState('');
    const [quoteTax, setQuoteTax] = useState('');
    const [quoteNotes, setQuoteNotes] = useState('');
    const [quoteValidityDays, setQuoteValidityDays] = useState('7');
    const [alternativeItems, setAlternativeItems] = useState<Record<number, { isAlternative: boolean; alternativeName: string }>>({});

    const pendingRFQs = allRfqs.filter(rfq => rfq.status === 'OPEN');
    const rfq = selectedRFQ ? allRfqs.find(r => r.id === selectedRFQ) : null;

    // Initialize item pricing when RFQ changes
    React.useEffect(() => {
      if (rfq) {
        const initial: Record<number, { unitPrice: string; leadTime: string; notes: string }> = {};
        rfq.items.forEach((_, idx) => {
          initial[idx] = { unitPrice: '', leadTime: '', notes: '' };
        });
        setItemPricing(initial);
      }
    }, [rfq?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const updateItemField = (idx: number, field: 'unitPrice' | 'leadTime' | 'notes', value: string) => {
      setItemPricing(prev => ({
        ...prev,
        [idx]: { ...prev[idx], [field]: value }
      }));
    };

    const isItemQuoted = (idx: number) => {
      const pricing = itemPricing[idx];
      const unitPrice = parseFloat(pricing?.unitPrice || '0');
      const leadTime = (pricing?.leadTime || '').trim();
      return Number.isFinite(unitPrice) && unitPrice > 0 && leadTime.length > 0;
    };

    const quotedItemsCount = rfq
      ? rfq.items.filter((_, idx) => isItemQuoted(idx)).length
      : 0;

    const calculateSubtotal = () => {
      if (!rfq) return 0;
      return rfq.items.reduce((sum, item, idx) => {
        if (!isItemQuoted(idx)) return sum;
        const price = parseFloat(itemPricing[idx]?.unitPrice || '0');
        return sum + (price * item.quantity);
      }, 0);
    };

    const calculateTotal = () => {
      const subtotal = calculateSubtotal();
      const shipping = parseFloat(quoteShipping || '0');
      const tax = parseFloat(quoteTax || '0');
      return subtotal + shipping + tax;
    };

    const getSmartMatchSuggestions = (requestedProductId: string, searchTerm: string) => {
      return getSmartMatchSuggestionsWithFuzzy(requestedProductId, searchTerm);
    };

    const getSmartMatchSuggestionsOld = (requestedProductId: string, searchTerm: string) => {
      const requestedProduct = allProducts.find((product) => product.id === requestedProductId);
      const query = searchTerm.trim().toLowerCase();
      const fallbackQuery = `${requestedProduct?.name || ''} ${requestedProduct?.brand || ''} ${requestedProduct?.category || ''}`
        .trim()
        .toLowerCase();
      const tokens = (query || fallbackQuery)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);

      if (tokens.length === 0) return [];

      const catalogPool = [
        ...allProducts.map((product) => ({
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
        })),
        ...smartMatchCatalog,
      ];

      return catalogPool
        .filter((product) => product.id !== requestedProductId)
        .map((product) => {
          const name = String(product.name || '').toLowerCase();
          const brand = String(product.brand || '').toLowerCase();
          const category = String(product.category || '').toLowerCase();
          let score = 0;

          tokens.forEach((token) => {
            if (name.includes(token)) score += 3;
            if (brand.includes(token)) score += 2;
            if (category.includes(token)) score += 1;
          });

          if (requestedProduct?.category && product.category === requestedProduct.category) {
            score += 2;
          }
          if (requestedProduct?.brand && product.brand === requestedProduct.brand) {
            score += 2;
          }

          return { product, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.product);
    };

    // Use fuzzy matching for smart suggestions
    const getSmartMatchSuggestionsWithFuzzy = (requestedProductId: string, searchTerm: string) => {
      const requestedProduct = allProducts.find((product) => product.id === requestedProductId);
      const query = searchTerm.trim().toLowerCase();

      // If empty query, use requested product name as fallback context
      const searchContext = query || `${requestedProduct?.name || ''} ${requestedProduct?.brand || ''}`.trim().toLowerCase();

      if (!searchContext) return [];

      const catalogPool = [
        ...allProducts.filter(p => p.id !== requestedProductId),
        ...smartMatchCatalog
      ];

      return catalogPool
        .map(product => {
          const productName = (product.name || '').toLowerCase();
          const productBrand = (product.brand || '').toLowerCase();
          const productCategory = (product.category || '').toLowerCase();

          // Calculate similarity scores using fuzzy logic
          const nameScore = calculateSimilarity(productName, searchContext);
          const brandScore = calculateSimilarity(productBrand, searchContext);

          let totalScore = (nameScore * 0.6) + (brandScore * 0.3); // Weighted score

          // Exact logic boosts
          if (product.category === requestedProduct?.category) totalScore += 0.2;
          if (product.brand === requestedProduct?.brand) totalScore += 0.1;

          return { product, score: totalScore };
        })
        .filter(item => item.score > 0.3) // Threshold for relevance
        .sort((a, b) => b.score - a.score)
        .slice(0, 5) // Top 5 suggestions
        .map(item => item.product);
    };


    const handleSubmitQuote = async () => {
      if (!selectedRFQ || !currentUser || !rfq) return;

      try {
        const quoteItems: import('../../types/types').QuoteItem[] = rfq.items.flatMap((item, idx) => {
          if (!isItemQuoted(idx)) return [];
          const pricing = itemPricing[idx] || { unitPrice: '0', leadTime: '', notes: '' };
          const product = allProducts.find(p => p.id === item.productId);
          const unitPrice = parseFloat(pricing.unitPrice || '0');
          const altInfo = alternativeItems[idx];
          return [{
            id: `qi-${Date.now()}-${idx}`,
            productId: item.productId,
            productName: altInfo?.isAlternative ? altInfo.alternativeName : (product?.name || item.productId),
            brand: product?.brand,
            unitPrice,
            quantity: item.quantity,
            lineTotal: unitPrice * item.quantity,
            leadTime: pricing.leadTime,
            notes: pricing.notes,
            isAlternative: altInfo?.isAlternative || false,
            alternativeProductName: altInfo?.isAlternative ? altInfo.alternativeName : undefined,
          }];
        });

        if (quoteItems.length === 0) {
          toast.error(t('supplier.quotes.atLeastOneItemRequired'));
          return;
        }

        const hasInvalidQuoteValues = quoteItems.some((item) => (
          !Number.isFinite(item.unitPrice)
          || item.unitPrice <= 0
          || !Number.isFinite(item.quantity)
          || item.quantity <= 0
        ));
        if (hasInvalidQuoteValues) {
          toast.error(t('supplier.quotes.invalidItemValues'));
          return;
        }

        const subtotal = quoteItems.reduce((s, qi) => s + qi.lineTotal, 0);
        const shipping = parseFloat(quoteShipping || '0');
        const tax = parseFloat(quoteTax || '0');
        const supplierPrice = subtotal + shipping + tax;

        // Aggregate lead time: use the longest individual lead time
        const aggregateLeadTime = quoteItems
          .map(qi => qi.leadTime || '')
          .filter(Boolean)
          .join('; ') || '';

        // Check if there's an existing auto-quote from this supplier for this RFQ
        const existingAutoQuote = allQuotes.find(
          q => q.rfqId === selectedRFQ &&
            q.supplierId === currentUser.id &&
            q.type === 'auto'
        );

        if (existingAutoQuote) {
          const updatedQuote = await api.updateQuote(existingAutoQuote.id, {
            supplierPrice,
            leadTime: aggregateLeadTime,
            status: 'PENDING_ADMIN',
            marginPercent: 0,
            finalPrice: supplierPrice,
            type: 'custom',
            notes: quoteNotes || undefined,
            shippingCost: shipping || undefined,
            tax: tax || undefined,
            quoteItems,
          });
          if (!updatedQuote) {
            throw new Error('Failed to override auto quote');
          }
          toast.success(t('supplier.quotes.autoQuoteOverridden'));
        } else {
          const createdQuote = await api.createQuote({
            rfqId: selectedRFQ,
            supplierId: currentUser.id,
            supplierPrice,
            leadTime: aggregateLeadTime,
            status: 'PENDING_ADMIN',
            marginPercent: 0,
            finalPrice: supplierPrice,
            type: 'custom',
            notes: quoteNotes || undefined,
            shippingCost: shipping || undefined,
            tax: tax || undefined,
            quoteItems,
          });
          if (!createdQuote) {
            throw new Error('Failed to create quote');
          }
          toast.success(t('supplier.quotes.quoteSubmitted'));
        }

        await loadQuotes();
        setSelectedRFQ(null);
        setItemPricing({});
        setQuoteShipping('');
        setQuoteTax('');
        setQuoteNotes('');
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
                      {isAutoQuoteSubmittedForRfq(rfq.id) && (
                        <p className="text-xs text-blue-700 font-medium">{t('supplier.rfqs.autoQuoteSubmitted')}</p>
                      )}
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

                {/* Per-Item Pricing */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-neutral-600 uppercase mb-3">{t('supplier.quotes.requestedItems')}</h3>
                  <div className="space-y-4">
                    {rfq?.items.map((item, idx) => {
                      const product = allProducts.find(p => p.id === item.productId);
                      const pricing = itemPricing[idx] || { unitPrice: '', leadTime: '', notes: '' };
                      const lineTotal = (parseFloat(pricing.unitPrice || '0') * item.quantity);
                      return (
                        <div key={idx} className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/50">
                          {/* Item header */}
                          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-neutral-200">
                            <img src={product?.image} alt={product?.name} className="w-12 h-12 object-cover rounded" />
                            <div className="flex-1">
                              <p className="font-semibold text-neutral-800">{product?.name}</p>
                              <p className="text-sm text-neutral-500">{product?.brand} &middot; {t('supplier.quotes.quantity')}: {item.quantity}</p>
                            </div>
                            {lineTotal > 0 && (
                              <span className="text-sm font-bold text-neutral-800">
                                {t('common.currency')} {lineTotal.toFixed(2)}
                              </span>
                            )}
                          </div>
                          {/* Per-item fields */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-neutral-500 mb-1">{t('supplier.quotes.unitPrice')} <span className="text-red-500">*</span></label>
                              <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400 text-sm">{t('common.currency')}</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="w-full pl-8 pr-4 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                                  placeholder="0.00"
                                  value={pricing.unitPrice}
                                  onChange={(e) => updateItemField(idx, 'unitPrice', e.target.value)}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-neutral-500 mb-1">{t('supplier.quotes.leadTime')} <span className="text-red-500">*</span></label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                                placeholder={t('supplier.quotes.leadTimePlaceholder')}
                                value={pricing.leadTime}
                                onChange={(e) => updateItemField(idx, 'leadTime', e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="mt-2">
                            <label className="block text-xs font-medium text-neutral-500 mb-1">{t('supplier.quotes.itemNotes')}</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                              placeholder={t('supplier.quotes.itemNotesPlaceholder')}
                              value={pricing.notes}
                              onChange={(e) => updateItemField(idx, 'notes', e.target.value)}
                            />
                          </div>
                          {/* Smart Match — Alternative Product Suggestion from Master Catalog */}
                          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={alternativeItems[idx]?.isAlternative || false}
                                onChange={(e) => setAlternativeItems(prev => ({
                                  ...prev,
                                  [idx]: { isAlternative: e.target.checked, alternativeName: prev[idx]?.alternativeName || '' }
                                }))}
                                className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                              />
                              <span className="text-xs font-medium text-amber-800">{t('supplier.quotes.suggestAlternative')}</span>
                              <span className="text-xs text-amber-600 ml-auto">{t('supplier.quotes.smartMatch')}</span>
                            </label>
                            {alternativeItems[idx]?.isAlternative && (
                              <div className="mt-2 space-y-2">
                                <input
                                  type="text"
                                  className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
                                  placeholder={t('supplier.quotes.searchCatalog')}
                                  value={alternativeItems[idx]?.alternativeName || ''}
                                  onChange={(e) => setAlternativeItems(prev => ({
                                    ...prev,
                                    [idx]: { ...prev[idx], alternativeName: e.target.value }
                                  }))}
                                />
                                {/* Show matching catalog products */}
                                {(() => {
                                  const searchTerm = alternativeItems[idx]?.alternativeName || '';
                                  const matches = getSmartMatchSuggestions(item.productId, searchTerm);
                                  if (matches.length === 0) return null;
                                  return (
                                    <div className="bg-white border border-amber-200 rounded-lg overflow-hidden shadow-sm">
                                      <p className="text-xs font-medium text-amber-700 px-3 py-1.5 bg-amber-50 border-b border-amber-100">
                                        {t('supplier.quotes.catalogMatches')}
                                      </p>
                                      {matches.map((matchedProduct) => (
                                        <button
                                          key={matchedProduct.id}
                                          type="button"
                                          onClick={() => setAlternativeItems(prev => ({
                                            ...prev,
                                            [idx]: { ...prev[idx], alternativeName: matchedProduct.name }
                                          }))}
                                          className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0"
                                        >
                                          <span className="font-medium text-slate-800">{matchedProduct.name}</span>
                                          <span className="text-xs text-slate-400">{matchedProduct.category}{matchedProduct.brand ? ` · ${matchedProduct.brand}` : ''}</span>
                                        </button>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Shipping, Tax, Notes */}
                <div className="space-y-4 border-t border-neutral-200 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-600 mb-2">{t('supplier.quotes.shippingCost')}</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">{t('common.currency')}</span>
                        <input
                          type="number"
                          className="w-full pl-8 pr-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                          placeholder="0.00"
                          value={quoteShipping}
                          onChange={(e) => setQuoteShipping(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-600 mb-2">{t('supplier.quotes.tax')}</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">{t('common.currency')}</span>
                        <input
                          type="number"
                          className="w-full pl-8 pr-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                          placeholder="0.00"
                          value={quoteTax}
                          onChange={(e) => setQuoteTax(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-2">{t('supplier.quotes.quoteValidity')}</label>
                    <div className="flex items-center gap-3">
                      <select
                        value={quoteValidityDays}
                        onChange={(e) => setQuoteValidityDays(e.target.value)}
                        className="px-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec] bg-white"
                      >
                        <option value="3">3 {t('common.days')}</option>
                        <option value="5">5 {t('common.days')}</option>
                        <option value="7">7 {t('common.days')}</option>
                        <option value="14">14 {t('common.days')}</option>
                        <option value="30">30 {t('common.days')}</option>
                      </select>
                      <p className="text-xs text-neutral-400">{t('supplier.quotes.validityHelp')}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-2">{t('supplier.quotes.additionalNotes')}</label>
                    <textarea
                      className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#137fec] focus:border-[#137fec]"
                      rows={3}
                      placeholder={t('supplier.quotes.notesPlaceholder')}
                      value={quoteNotes}
                      onChange={(e) => setQuoteNotes(e.target.value)}
                    ></textarea>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-28 bg-white rounded-xl border border-neutral-200 p-6">
                <h3 className="text-lg font-bold text-neutral-800 mb-4">{t('supplier.quotes.quoteSummary')}</h3>

                {/* Per-item line totals */}
                <div className="space-y-2 mb-4">
                  {rfq?.items.map((item, idx) => {
                    const product = allProducts.find(p => p.id === item.productId);
                    const price = parseFloat(itemPricing[idx]?.unitPrice || '0');
                    const lineTotal = price * item.quantity;
                    return (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-neutral-500 truncate max-w-[140px]">{product?.name || item.productId}</span>
                        <span className="font-medium text-neutral-700">{t('common.currency')} {lineTotal.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3 mb-6 border-t border-neutral-200 pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">{t('supplier.quotes.subtotal')}</span>
                    <span className="font-medium text-neutral-800">
                      {t('common.currency')} {calculateSubtotal().toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">{t('supplier.quotes.shipping')}</span>
                    <span className="font-medium text-neutral-800">{t('common.currency')} {parseFloat(quoteShipping || '0').toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">{t('supplier.quotes.tax')}</span>
                    <span className="font-medium text-neutral-800">{t('common.currency')} {parseFloat(quoteTax || '0').toFixed(2)}</span>
                  </div>
                  <div className="border-t border-neutral-200 pt-3 flex justify-between">
                    <span className="font-bold text-neutral-800">{t('supplier.quotes.total')}</span>
                    <span className="font-bold text-xl text-neutral-800">{t('common.currency')} {calculateTotal().toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className={`text-xs text-center font-medium ${rfq && quotedItemsCount < rfq.items.length ? 'text-amber-700' : 'text-emerald-700'
                    }`}>
                    {t('supplier.quotes.itemsQuotedSummary', {
                      quoted: quotedItemsCount,
                      total: rfq?.items.length || 0,
                    })}
                  </p>
                  {rfq && quotedItemsCount < rfq.items.length && (
                    <p className="text-[11px] text-center text-neutral-500">
                      {t('supplier.quotes.partialQuoteAllowed')}
                    </p>
                  )}
                  <button
                    onClick={handleSubmitQuote}
                    disabled={quotedItemsCount === 0}
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
    const { currentUser, orders, users, products, updateOrder } = useStore();
    const [activeOrderTab, setActiveOrderTab] = useState<'pending' | 'completed' | 'won'>('won');
    const [selectedOrderDetails, setSelectedOrderDetails] = useState<{ id: string; date: string; amount: number; status: string } | null>(null);
    // Resolve the full Order object from the store for pickup details & delivery location
    const fullOrderDetails = selectedOrderDetails ? orders.find(o => o.id === selectedOrderDetails.id) : null;
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

    const getStatusLabel = (status: string) => {
      const key = `status.${status.toLowerCase().replace(/_/g, '')}`;
      return t(key, status.replace(/_/g, ' '));
    };

    const parseOrderDate = (value: string) => {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const orderDateValue = (order: Order) => order.createdAt || order.updatedAt || order.date;

    const getClientLabel = (clientId?: string) => {
      if (!clientId) return t('admin.overview.unknownClient');
      const client = users.find((user) => user.id === clientId);
      return client?.publicId || `Client-${clientId.slice(0, 8)}`;
    };

    const formatItemsSummary = (items?: Array<{ quantity?: number }>) => {
      if (!items || items.length === 0) return '-';
      const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      return t('supplier.orders.itemsSummary', { itemCount: items.length, unitCount: totalUnits });
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

    type OrderSummaryRow = {
      id: string;
      client: string;
      items: string;
      date: string;
      status: string;
      amount: number;
      quoteId?: string;
      clientId?: string;
      shipment?: Order['shipment'];
      itemsData?: Array<{ productId?: string; name?: string; quantity?: number }>;
    };

    const handlePrintShippingLabel = (row: Order | OrderSummaryRow) => {
      const linkedOrder = 'supplierId' in row
        ? row
        : orders.find((candidate) => candidate.id === row.id);
      const quoteId = linkedOrder?.quoteId || ('quoteId' in row ? row.quoteId : undefined);
      const clientId = linkedOrder?.clientId || ('clientId' in row ? row.clientId : undefined);
      const shipment = linkedOrder?.shipment || ('shipment' in row ? row.shipment : undefined);
      const printableDate = linkedOrder ? orderDateValue(linkedOrder) : row.date;
      const rowItemsData = 'itemsData' in row ? row.itemsData : undefined;
      const itemsData = Array.isArray(linkedOrder?.items)
        ? (linkedOrder.items as Array<{ productId?: string; name?: string; quantity?: number }>)
        : rowItemsData;

      const supplierInfo = currentUser;
      const clientInfo = users.find((u) => u.id === clientId);
      const relatedQuote = quoteId ? allQuotes.find((q) => q.id === quoteId) : null;
      const relatedRfq = relatedQuote ? allRfqs.find(r => r.id === relatedQuote.rfqId) : null;

      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        toast.error(t('supplier.orders.printBlocked'));
        return;
      }

      const itemsList = Array.isArray(itemsData)
        ? itemsData
          .map((item, i) => {
            const productName = item.name
              || products.find((product) => product.id === item.productId)?.name
              || item.productId
              || '-';
            return `<tr><td style="padding:6px 12px;border:1px solid #e2e8f0;">${i + 1}</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${productName}</td><td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center;">${item.quantity || 1}</td></tr>`;
          })
          .join('')
        : '<tr><td colspan="3" style="padding:6px 12px;text-align:center;">No items data</td></tr>';

      const totalItems = Array.isArray(itemsData)
        ? itemsData.reduce((s, i) => s + (i.quantity || 1), 0)
        : 0;

      printWindow.document.write(`<!DOCTYPE html><html><head><title>Shipping Label - ${row.id.slice(0, 8)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; color: #1e293b; }
  .label { max-width: 700px; margin: 0 auto; border: 2px solid #0f172a; padding: 0; }
  .header { background: #0f172a; color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { margin: 0; font-size: 20px; } .header .order-id { font-size: 14px; opacity: 0.8; }
  .body { padding: 24px; }
  .row { display: flex; gap: 24px; margin-bottom: 20px; }
  .col { flex: 1; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 6px; font-weight: 700; }
  .section-value { font-size: 14px; font-weight: 600; line-height: 1.5; }
  .address { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f1f5f9; padding: 8px 12px; border: 1px solid #e2e8f0; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .barcode { text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-family: monospace; font-size: 18px; letter-spacing: 4px; }
  .footer { text-align: center; padding: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
  @media print { body { padding: 0; } .no-print { display: none !important; } }
</style></head><body>
<div style="text-align:center;margin-bottom:16px;" class="no-print">
  <button onclick="window.print()" style="padding:10px 32px;background:#0f172a;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
    Print Label
  </button>
</div>
<div class="label">
  <div class="header">
    <div><h1>MWRD Shipping Label</h1><div class="order-id">Order: ${row.id.slice(0, 12).toUpperCase()}</div></div>
    <div style="text-align:right"><div style="font-size:12px">Date: ${new Date(printableDate).toLocaleDateString()}</div>
    <div style="font-size:12px">${shipment?.carrier || 'Standard Delivery'}</div></div>
  </div>
  <div class="body">
    <div class="row">
      <div class="col address">
        <div class="section-title">From (Supplier)</div>
        <div class="section-value">${supplierInfo?.companyName || supplierInfo?.name || 'Supplier'}</div>
        <div style="font-size:13px;color:#475569;margin-top:4px">${supplierInfo?.email || ''}</div>
      </div>
      <div class="col address">
        <div class="section-title">To (Client)</div>
        <div class="section-value">${clientInfo?.companyName || clientInfo?.name || getClientLabel(clientId)}</div>
        <div style="font-size:13px;color:#475569;margin-top:4px">${relatedRfq?.deliveryLocation || clientInfo?.email || ''}</div>
      </div>
    </div>
    ${shipment?.trackingNumber ? `
    <div style="margin-bottom:20px;">
      <div class="section-title">Tracking Number</div>
      <div class="section-value" style="font-family:monospace;font-size:16px;letter-spacing:2px;">${shipment.trackingNumber}</div>
    </div>` : ''}
    <div>
      <div class="section-title" style="margin-bottom:8px">Package Contents (${totalItems} units)</div>
      <table><thead><tr><th>#</th><th>Item</th><th style="text-align:center">Qty</th></tr></thead><tbody>${itemsList}</tbody></table>
    </div>
    <div class="barcode">
      ||||| ${row.id.slice(0, 12).toUpperCase()} |||||
    </div>
  </div>
  <div class="footer">MWRD B2B Marketplace &bull; Shipping Manifest &bull; Handle With Care</div>
</div></body></html>`);
      printWindow.document.close();
    };

    const pendingOrders = orders.filter(o => o.supplierId === currentUser?.id && o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
    const normalizedHeaderSearch = orderHeaderSearch.trim().toLowerCase();
    const normalizedPendingSearch = pendingSearchTerm.trim().toLowerCase();
    const filteredPendingOrders = pendingOrders.filter((order) => {
      const clientLabel = getClientLabel(order.clientId);
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
          status: linkedOrder?.status || 'ACCEPTED',
          amount: linkedOrder?.amount ?? quote.finalPrice,
          quoteId: quote.id,
          clientId: linkedOrder?.clientId || linkedRfq?.clientId,
          shipment: linkedOrder?.shipment,
          itemsData: Array.isArray(summaryItems)
            ? (summaryItems as Array<{ productId?: string; name?: string; quantity?: number }>)
            : undefined,
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
          quoteId: order.quoteId,
          clientId: order.clientId || linkedRfq?.clientId,
          shipment: order.shipment,
          itemsData: Array.isArray(summaryItems)
            ? (summaryItems as Array<{ productId?: string; name?: string; quantity?: number }>)
            : undefined,
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
            <nav aria-label={t('supplier.orders.tabsNavigation')} className="-mb-px flex space-x-6">
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
                      <option value="PAYMENT_CONFIRMED">{t('status.paymentConfirmed')}</option>
                      <option value="PROCESSING">{t('status.processing')}</option>
                      <option value="READY_FOR_PICKUP">{t('status.readyForPickup')}</option>
                      <option value="SHIPPED">{t('status.shipped')}</option>
                      <option value="IN_TRANSIT">{t('status.inTransit')}</option>
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
                      <option value="LAST_30_DAYS">{t('admin.users.last30Days')}</option>
                      <option value="LAST_90_DAYS">{t('admin.users.last90Days')}</option>
                      <option value="THIS_YEAR">{t('admin.users.thisYear')}</option>
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
                          <td className="px-6 py-4">{getClientLabel(order.clientId)}</td>
                          <td className="px-6 py-4">{t('common.currency')} {order.amount.toLocaleString()}</td>
                          <td className="px-6 py-4">{order.date}</td>
                          <td className="px-6 py-4">
                            <select
                              value={order.status}
                              onChange={(e) => handleStatusChange(order.id, e.target.value)}
                              className={`border-none text-xs font-bold uppercase rounded-full px-3 py-1 cursor-pointer outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${order.status === 'DELIVERED' || order.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                                  order.status === 'PICKED_UP' ? 'bg-teal-100 text-teal-800' :
                                    'bg-blue-100 text-blue-700'
                                }`}
                            >
                              <option value={order.status}>{getStatusLabel(order.status)}</option>
                              {getAllowedOrderStatusTransitions(order.status).map((status) => (
                                <option key={status} value={status}>
                                  {getStatusLabel(status)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handlePrintShippingLabel(order)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                                title={t('supplier.orders.printLabel')}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>print</span>
                              </button>
                              <button
                                onClick={() => setSelectedOrderDetails(order)}
                                className="inline-flex items-center gap-2 text-sm font-medium text-[#137fec] hover:underline"
                              >
                                <span>{t('supplier.orders.viewDetails')}</span>
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                              </button>
                            </div>
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
                      <option value="LAST_30_DAYS">{t('admin.users.last30Days')}</option>
                      <option value="LAST_90_DAYS">{t('admin.users.last90Days')}</option>
                      <option value="THIS_YEAR">{t('admin.users.thisYear')}</option>
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
                            <StatusBadge status={order.status} size="sm" />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handlePrintShippingLabel(order)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                                title={t('supplier.orders.printLabel')}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>print</span>
                              </button>
                              <button
                                onClick={() => setSelectedOrderDetails(order)}
                                className="inline-flex items-center gap-2 text-sm font-medium text-[#137fec] hover:underline"
                              >
                                <span>{t('supplier.orders.viewDetails')}</span>
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                              </button>
                            </div>
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
                <nav aria-label={t('supplier.orders.tableNavigation')} className="flex items-center justify-between p-4">
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
                      <option value="DELIVERED">{t('status.delivered')}</option>
                      <option value="CLOSED">{t('status.closed')}</option>
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
                      <option value="LAST_30_DAYS">{t('admin.users.last30Days')}</option>
                      <option value="LAST_90_DAYS">{t('admin.users.last90Days')}</option>
                      <option value="THIS_YEAR">{t('admin.users.thisYear')}</option>
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
                              {order.status === 'DELIVERED' ? (t('status.delivered')) : (t('status.closed'))}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handlePrintShippingLabel(order)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                                title={t('supplier.orders.printLabel')}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>print</span>
                              </button>
                              <button
                                onClick={() => setSelectedOrderDetails(order)}
                                className="inline-flex items-center gap-2 text-sm font-medium text-[#137fec] hover:underline"
                              >
                                <span>{t('supplier.orders.viewDetails')}</span>
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                              </button>
                            </div>
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
                <nav aria-label={t('supplier.orders.tableNavigation')} className="flex items-center justify-between p-4">
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
                  <p>{t('supplier.orders.chatAvailableMessage')}</p>
                  <p>{t('supplier.orders.chatLinkedMessage')}</p>
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
                  <p><span className="font-semibold">{t('supplier.orders.amount')}:</span> {t('common.currency')} {selectedOrderDetails.amount.toLocaleString()}</p>
                  <p><span className="font-semibold">{t('supplier.orders.status')}:</span> {selectedOrderDetails.status}</p>

                  {/* Gap #26: Pickup details display */}
                  {fullOrderDetails?.pickupDetails && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-blue-600">local_shipping</span>
                        <h4 className="font-bold text-blue-800">{t('supplier.orders.pickupDetails')}</h4>
                      </div>
                      {fullOrderDetails.pickupDetails.driverName && (
                        <p>
                          <span className="font-semibold">{t('supplier.orders.driverName')}:</span>{' '}
                          {fullOrderDetails.pickupDetails.driverName}
                        </p>
                      )}
                      {fullOrderDetails.pickupDetails.driverContact && (
                        <p>
                          <span className="font-semibold">{t('supplier.orders.driverContact')}:</span>{' '}
                          <a href={`tel:${fullOrderDetails.pickupDetails.driverContact}`} className="text-blue-600 hover:underline">
                            {fullOrderDetails.pickupDetails.driverContact}
                          </a>
                        </p>
                      )}
                      {fullOrderDetails.pickupDetails.scheduledPickupTime && (
                        <p>
                          <span className="font-semibold">{t('supplier.orders.scheduledPickupTime')}:</span>{' '}
                          {new Date(fullOrderDetails.pickupDetails.scheduledPickupTime).toLocaleString()}
                        </p>
                      )}
                      {fullOrderDetails.pickupDetails.pickupNotes && (
                        <p>
                          <span className="font-semibold">{t('supplier.orders.pickupNotes')}:</span>{' '}
                          {fullOrderDetails.pickupDetails.pickupNotes}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Show delivery location from RFQ if available */}
                  {(() => {
                    const relatedQuote = fullOrderDetails?.quoteId
                      ? allQuotes.find(q => q.id === fullOrderDetails.quoteId)
                      : null;
                    const relatedRfq = relatedQuote ? allRfqs.find(r => r.id === relatedQuote.rfqId) : null;
                    if (relatedRfq?.deliveryLocation) {
                      return (
                        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="material-symbols-outlined text-green-600">location_on</span>
                            <h4 className="font-bold text-green-800">{t('supplier.orders.deliveryLocation')}</h4>
                          </div>
                          <p className="text-green-700">{relatedRfq.deliveryLocation}</p>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="p-4 border-t border-slate-200 flex justify-between">
                  {fullOrderDetails && (
                    <button
                      onClick={() => handlePrintShippingLabel(fullOrderDetails)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A2540] text-white hover:bg-[#0A2540]/90 font-medium text-sm transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>print</span>
                      {t('supplier.orders.printLabel')}
                    </button>
                  )}
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

    const loadData = async () => {
      if (!currentUser) {
        setTransactions([]);
        setFinancials({ balance: 0, creditLimit: 0 });
        setLoading(false);
        return;
      }

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
        toast.error(t('supplier.financials.loadError'));
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      void loadData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.id]);

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
            <p className="text-3xl font-bold text-neutral-800 mt-2">{t('common.currency')} {financials.balance.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <p className="text-sm text-neutral-500 font-medium">{t('supplier.financials.creditLimit') || 'Credit Limit'}</p>
            <p className="text-3xl font-bold text-neutral-800 mt-2">{t('common.currency')} {financials.creditLimit.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <p className="text-sm text-neutral-500 font-medium">{t('supplier.financials.availableCredit') || 'Available Credit'}</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{t('common.currency')} {(financials.creditLimit - financials.balance).toLocaleString()}</p>
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
                        {['PAYMENT', 'REFUND'].includes(tx.type) ? '+' : '-'}{t('common.currency')} {tx.amount.toLocaleString()}
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
      phone: '',
      businessType: 'Manufacturer'
    });
    const [passwordData, setPasswordData] = useState({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });

    // KYC upload state
    const [kycUploading, setKycUploading] = useState<Record<string, boolean>>({});
    const [kycUploaded, setKycUploaded] = useState<Record<string, string>>(
      currentUser?.kycDocuments || {}
    );

    // Payment settings state
    const [paymentSettings, setPaymentSettings] = useState({
      bankName: currentUser?.paymentSettings?.bankName || '',
      accountHolder: currentUser?.paymentSettings?.accountHolder || '',
      iban: currentUser?.paymentSettings?.iban || '',
      swiftCode: currentUser?.paymentSettings?.swiftCode || '',
    });
    const [isSavingPayment, setIsSavingPayment] = useState(false);
    const KYC_STORAGE_BUCKET_CANDIDATES = ['kyc-documents', 'public-assets', 'custom-request-files', 'product-images'];
    const KYC_STORAGE_PREFIX = 'kyc-documents';

    useEffect(() => {
      setFormData({
        companyName: currentUser?.companyName || '',
        email: currentUser?.email || '',
        phone: '',
        businessType: 'Manufacturer'
      });
      setPaymentSettings({
        bankName: currentUser?.paymentSettings?.bankName || '',
        accountHolder: currentUser?.paymentSettings?.accountHolder || '',
        iban: currentUser?.paymentSettings?.iban || '',
        swiftCode: currentUser?.paymentSettings?.swiftCode || '',
      });
      setKycUploaded(currentUser?.kycDocuments || {});
    }, [currentUser]);

    const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setPaymentSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSavePaymentSettings = async () => {
      if (!currentUser) return;
      const trimmedIban = paymentSettings.iban.trim();
      const trimmedSwift = paymentSettings.swiftCode.trim();

      if (trimmedIban && !/^SA\d{22}$/i.test(trimmedIban)) {
        toast.error(t('supplier.settings.invalidIban'));
        return;
      }

      if (trimmedSwift && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(trimmedSwift)) {
        toast.error(t('supplier.settings.invalidSwift'));
        return;
      }

      setIsSavingPayment(true);
      try {
        const updatedUser = await updateUser(currentUser.id, {
          paymentSettings: {
            ...paymentSettings,
            iban: trimmedIban,
            swiftCode: trimmedSwift,
          },
        });
        if (!updatedUser) {
          throw new Error('Unable to persist payment settings');
        }
        toast.success(t('supplier.settings.paymentSaved'));
      } catch (error) {
        logger.error('Error saving payment settings:', error);
        toast.error(t('supplier.settings.paymentSaveFailed'));
      } finally {
        setIsSavingPayment(false);
      }
    };

    const handleKycUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
      const file = e.target.files?.[0];
      if (!file || !currentUser) return;

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast.error(t('supplier.settings.fileTooLarge'));
        return;
      }

      setKycUploading(prev => ({ ...prev, [docType]: true }));
      try {
        // Use the API service to handle the upload logic (bucket selection, path generation)
        const publicUrl = await api.uploadKYCDocument(currentUser.id, file);

        if (!publicUrl) {
          throw new Error('Upload failed: No URL returned');
        }

        const newDocs = { ...kycUploaded, [docType]: publicUrl };
        setKycUploaded(newDocs);

        // Update user profile with new document URL
        const updatedUser = await updateUser(currentUser.id, { kycDocuments: newDocs });

        if (!updatedUser) {
          throw new Error('Unable to persist document URL to user profile');
        }
        toast.success(t('supplier.settings.fileUploaded'));
      } catch (error: any) {
        logger.error(`Failed to upload KYC document (${docType}):`, error);
        toast.error(getUserFacingError(error, t('supplier.settings.uploadFailed')));
      } finally {
        setKycUploading(prev => ({ ...prev, [docType]: false }));
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
      if (!currentUser) return;
      setIsSaving(true);
      try {
        const updatedUser = await updateUser(currentUser.id, {
          companyName: formData.companyName,
          // phone: formData.phone, // Uncomment when User type has phone
          // businessType: formData.businessType
        });
        if (!updatedUser) {
          throw new Error('Unable to persist supplier settings');
        }
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
        toast.error(getUserFacingError(error, t('supplier.settings.passwordUpdateFailed') || 'Failed to update password'));
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


        {/* KYC Documents */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-2">{t('supplier.settings.kycDocuments')}</h3>
          <p className="text-sm text-slate-500 mb-6">{t('supplier.settings.kycDocumentsDesc')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'cr', label: t('supplier.settings.commercialRegistration') },
              { key: 'tax', label: t('supplier.settings.taxCertificate') },
              { key: 'license', label: t('supplier.settings.businessLicense') },
              { key: 'bank_letter', label: t('supplier.settings.bankLetter') },
            ].map(({ key, label }) => (
              <div key={key} className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${kycUploaded[key] ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-blue-300'
                }`}>
                <span className="material-symbols-outlined text-3xl mb-2" style={{ color: kycUploaded[key] ? '#16a34a' : '#94a3b8' }}>
                  {kycUploaded[key] ? 'check_circle' : 'upload_file'}
                </span>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                {kycUploaded[key] ? (
                  <p className="text-xs text-green-600 mt-1">{t('supplier.settings.uploaded')}</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">{t('supplier.settings.uploadPdf')}</p>
                )}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  id={`${key}-upload`}
                  onChange={(e) => handleKycUpload(e, key)}
                  disabled={kycUploading[key]}
                />
                <label htmlFor={`${key}-upload`} className={`mt-3 inline-block px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${kycUploading[key]
                  ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                  : kycUploaded[key]
                    ? 'text-green-600 bg-green-100 hover:bg-green-200'
                    : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                  }`}>
                  {kycUploading[key]
                    ? t('supplier.settings.uploading')
                    : kycUploaded[key]
                      ? t('supplier.settings.replace')
                      : t('supplier.settings.chooseFile')}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Settings */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-2">{t('supplier.settings.paymentSettings')}</h3>
          <p className="text-sm text-slate-500 mb-6">{t('supplier.settings.paymentSettingsDesc')}</p>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.bankName')}</label>
                <input type="text" name="bankName" value={paymentSettings.bankName} onChange={handlePaymentChange} placeholder={t('supplier.settings.bankNamePlaceholder')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.accountHolder')}</label>
                <input type="text" name="accountHolder" value={paymentSettings.accountHolder} onChange={handlePaymentChange} placeholder={t('supplier.settings.accountHolderPlaceholder')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.iban')}</label>
                <input type="text" name="iban" value={paymentSettings.iban} onChange={handlePaymentChange} placeholder={t('supplier.settings.ibanPlaceholder')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('supplier.settings.swiftCode')}</label>
                <input type="text" name="swiftCode" value={paymentSettings.swiftCode} onChange={handlePaymentChange} placeholder={t('supplier.settings.swiftPlaceholder')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={handleSavePaymentSettings}
                disabled={isSavingPayment}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingPayment && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                {t('common.save')}
              </button>
            </div>
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
  if (activeTab === 'custom-requests') return <SupplierCustomRequests />;
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
