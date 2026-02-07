import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, Product, RFQ, Quote, OrderStatus, UserRole } from '../../types/types';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { QuickActions } from '../../components/ui/QuickActions';
import { ProfilePictureUpload } from '../../components/ProfilePictureUpload';
import { SearchBar } from '../../components/ui/SearchBar';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';
import { CustomItemRequestForm } from '../../components/CustomItemRequestForm';
import { api } from '../../services/api';
import { QuoteComparison, QuoteWithDetails } from '../../components/QuoteComparison';
import { DualPOFlow } from '../../components/DualPOFlow';
import { ClientFinancials } from '../../components/client/ClientFinancials';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import { categoryService } from '../../services/categoryService';
import { PaymentInstructions } from '../../components/PaymentInstructions';
import bankTransferService from '../../services/bankTransferService';
import { appConfig } from '../../config/appConfig';
import { logger } from '../../utils/logger';

interface ClientPortalProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

interface SelectedItem {
  productId: string;
  quantity: number;
  notes: string;
}

const exportRowsToCSV = (rows: Record<string, unknown>[], filename: string) => {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => JSON.stringify((row as Record<string, unknown>)[header] ?? ''))
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const parseLeadTimeDays = (leadTime: string) => {
  const parsed = Number.parseInt(leadTime, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};

export const ClientPortal: React.FC<ClientPortalProps> = ({ activeTab, onNavigate }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { currentUser, products, rfqs, quotes, orders, users, addRFQ, updateUser, loadOrders } = useStore();
  const [rfqItems, setRfqItems] = useState<string[]>([]);
  const [selectedItemsMap, setSelectedItemsMap] = useState<Record<string, SelectedItem>>({});
  const [submitted, setSubmitted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [rfqSearchTerm, setRfqSearchTerm] = useState('');
  const [selectedRfqId, setSelectedRfqId] = useState<string | null>(null);

  // Quote Comparison State
  const [comparingRFQ, setComparingRFQ] = useState<RFQ | null>(null);
  const [comparisonQuotes, setComparisonQuotes] = useState<QuoteWithDetails[]>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Dual PO Flow State
  const [acceptedQuote, setAcceptedQuote] = useState<Quote | null>(null);
  const [showPOFlow, setShowPOFlow] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [quoteSortBy, setQuoteSortBy] = useState<'price' | 'delivery' | 'rating'>('price');
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);

  // Browse View State (Moved to top level to fix hook violation)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategoryHierarchy, setSubcategoryHierarchy] = useState<Record<string, { name: string; icon: string; translationKey: string }[]>>({});

  useEffect(() => {
    // Load categories from service
    setCategories(categoryService.getMainCategories());
    setSubcategoryHierarchy(categoryService.getCategoryTree());
  }, []);


  const getCategoryKey = (cat: string) => {
    switch (cat) {
      case 'IT Supplies': return 'it';
      case 'Office': return 'office';
      case 'Breakroom': return 'breakroom';
      case 'Janitorial': return 'janitorial';
      case 'Maintenance': return 'maintenance';
      default: return cat.toLowerCase().replace(/\s+/g, '');
    }
  };

  const categoryAssets: Record<string, { color: string, icon: string, heroBg: string, label: string }> = {
    'Office': { color: 'bg-blue-100', icon: 'desk', heroBg: 'bg-gradient-to-b from-blue-500 to-blue-50', label: 'categories.office.label' },
    'IT Supplies': { color: 'bg-indigo-100', icon: 'computer', heroBg: 'bg-[#F3F5F7]', label: 'categories.itSupplies.label' },
    'Breakroom': { color: 'bg-orange-100', icon: 'coffee', heroBg: 'bg-white', label: 'categories.breakroom.label' },
    'Janitorial': { color: 'bg-green-100', icon: 'cleaning_services', heroBg: 'bg-slate-100', label: 'categories.janitorial.label' },
    'Maintenance': { color: 'bg-gray-100', icon: 'build', heroBg: 'bg-blue-50', label: 'categories.maintenance.label' },
  };

  const defaultSupplierRating = React.useMemo(() => {
    const ratings = users
      .filter((user) => user.role === UserRole.SUPPLIER && typeof user.rating === 'number')
      .map((user) => user.rating as number);
    if (ratings.length === 0) return null;
    const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    return Number(average.toFixed(1));
  }, [users]);

  const dashboardClientName = currentUser?.name || t('client.dashboard.client', 'Client');

  // Get subcategories for selected category from hierarchy (not from products)
  const categorySubcategories = React.useMemo(() => {
    if (!selectedCategory) return [];
    return subcategoryHierarchy[selectedCategory] || [];
  }, [selectedCategory, subcategoryHierarchy]);

  const toggleRfqItem = (productId: string) => {
    // Logic for simple list
    if (rfqItems.includes(productId)) {
      setRfqItems(rfqItems.filter(id => id !== productId));
    } else {
      setRfqItems([...rfqItems, productId]);
    }
  };

  const toggleSelectedItem = (product: Product) => {
    if (selectedItemsMap[product.id]) {
      const newMap = { ...selectedItemsMap };
      delete newMap[product.id];
      setSelectedItemsMap(newMap);
    } else {
      setSelectedItemsMap({
        ...selectedItemsMap,
        [product.id]: { productId: product.id, quantity: 1, notes: '' }
      });
    }
  };

  const updateItemDetails = (productId: string, field: 'quantity' | 'notes', value: any) => {
    if (selectedItemsMap[productId]) {
      setSelectedItemsMap({
        ...selectedItemsMap,
        [productId]: { ...selectedItemsMap[productId], [field]: value }
      });
    }
  };

  const submitRfq = async () => {
    if (Object.keys(selectedItemsMap).length === 0) {
      toast.error(t('client.rfq.selectItemsFirst') || 'Please select at least one item');
      return;
    }

    if (!currentUser) {
      toast.error(t('errors.notLoggedIn') || 'Please log in first');
      return;
    }

    setSubmitted(true);

    try {
      // Create RFQ items from selected products
      const items = Object.values(selectedItemsMap).map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes
      }));

      // Create the RFQ
      const rfq: RFQ = {
        id: `rfq-${Date.now()}`,
        clientId: currentUser.id,
        items,
        status: 'OPEN',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      await addRFQ(rfq);

      toast.success(t('client.rfq.rfqSubmitted') || 'RFQ submitted successfully');
      setSelectedItemsMap({});
      setRfqItems([]);
      onNavigate('rfqs');
    } catch (error) {
      logger.error('Failed to submit RFQ:', error);
      toast.error(t('client.rfq.submitError') || 'Failed to submit RFQ');
    } finally {
      setSubmitted(false);
    }
  };

  const loadQuotesForComparison = async (rfqId: string) => {
    setLoadingComparison(true);
    try {
      const quotes = await api.getQuotesWithDetails(rfqId);
      setComparisonQuotes(quotes);
    } catch (error) {
      logger.error('Failed to load quotes:', error);
      toast.error(t('client.quotes.loadError') || 'Failed to load quotes for comparison');
    } finally {
      setLoadingComparison(false);
    }
  };

  const handleCloseComparison = () => {
    setComparingRFQ(null);
    setComparisonQuotes([]);
  };

  const handleAcceptQuote = async (quoteId: string) => {
    if (!currentUser) return;

    try {
      const quote = comparisonQuotes.find(q => q.id === quoteId);
      if (!quote) return;

      // Atomically accept quote, deduct credit, and create order via RPC.
      const { order } = await api.acceptQuote(quoteId);

      if (order) {
        setCreatedOrderId(order.id);
        setAcceptedQuote(quote as any); // Type assertion needed due to QuoteWithDetails vs Quote
        setShowPOFlow(true);
        handleCloseComparison();
      } else {
        toast.error(t('client.orders.createError') || 'Failed to initialize order');
      }
    } catch (error: any) {
      logger.error('Failed to accept quote:', error);
      toast.error(error?.message || t('client.orders.createError') || 'Failed to initialize order');
    }
  };

  const handleAcceptQuoteFromList = async (quote: Quote) => {
    if (!currentUser) return;

    try {
      const { order } = await api.acceptQuote(quote.id);

      if (order) {
        setCreatedOrderId(order.id);
        setAcceptedQuote(quote);
        setShowPOFlow(true);
      } else {
        toast.error(t('client.orders.createError') || 'Failed to initialize order');
      }
    } catch (error: any) {
      logger.error('Failed to accept quote from list:', error);
      toast.error(error?.message || t('client.orders.createError') || 'Failed to initialize order');
    }
  };

  const handleViewQuotes = (rfqId: string) => {
    setSelectedRfqId(rfqId);
    onNavigate('view-quotes');
  };

  const handleSaveRfqDraft = () => {
    if (!currentUser) return;

    try {
      localStorage.setItem(
        `mwrd-rfq-draft-${currentUser.id}`,
        JSON.stringify({
          selectedItemsMap,
          savedAt: new Date().toISOString(),
        })
      );
      toast.success(t('client.rfq.draftSaved') || 'Draft saved');
    } catch (error) {
      logger.error('Failed to save RFQ draft:', error);
      toast.error(t('client.rfq.draftSaveError') || 'Failed to save draft');
    }
  };

  const handleExportRfqs = () => {
    const rows = rfqs.map((rfq) => ({
      id: rfq.id,
      created_at: rfq.date,
      items_count: rfq.items.length,
      status: rfq.status,
      quotes_count: quotes.filter((q) => q.rfqId === rfq.id).length,
    }));

    exportRowsToCSV(rows, 'client_rfqs');
    toast.success(t('client.rfqs.exportSuccess') || 'RFQs exported');
  };

  const handleExportOrders = () => {
    const rows = orders.map((order) => ({
      id: order.id,
      date: order.date,
      amount: order.amount,
      status: order.status,
      supplier_id: order.supplierId,
    }));

    exportRowsToCSV(rows, 'client_orders');
    toast.success(t('client.orders.exportSuccess') || 'Orders exported');
  };

  // --- DASHBOARD VIEW ---
  if (activeTab === 'dashboard') {
    return (
      <div data-testid="client-dashboard-view" className="p-4 md:p-8 lg:p-12">
        {/* Header */}
        <div className="flex flex-wrap items-start sm:items-center justify-between gap-4 border-b border-gray-200 pb-6 sm:pb-8">
          <div className="flex min-w-0 sm:min-w-72 flex-col gap-1">
            <p className="text-[#111827] text-2xl sm:text-3xl font-bold leading-tight tracking-tight">{t('client.dashboard.title')}</p>
            <p className="text-[#6b7280] text-base font-normal leading-normal">{t('client.dashboard.welcomeBack')}, {dashboardClientName}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <button
              data-testid="client-dashboard-browse-button"
              onClick={() => onNavigate('browse')}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-white border border-gray-300 text-[#111827] text-sm font-medium leading-normal tracking-[0.015em] gap-2 hover:bg-gray-50 transition-colors"
            >
              <span className="material-symbols-outlined text-base">search</span>
              <span className="truncate">{t('client.dashboard.browseItems')}</span>
            </button>
            <button
              data-testid="client-dashboard-create-rfq-button"
              onClick={() => onNavigate('create-rfq')}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-[#137fec] text-white text-sm font-medium leading-normal tracking-[0.015em] gap-2 hover:bg-[#137fec]/90 transition-colors"
            >
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
              <span className="truncate">{t('client.dashboard.submitNewRfq')}</span>
            </button>
          </div>
        </div>

        <QuickActions
          onNavigate={onNavigate}
          pendingQuotesCount={quotes.filter(q => q.status === 'SENT_TO_CLIENT').length}
          activeOrdersCount={orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Recent RFQs */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex justify-between items-center">
                <h3 className="text-[#111827] text-lg font-semibold">{t('client.dashboard.recentRfqs')}</h3>
                <button data-testid="client-dashboard-view-all-rfqs-button" onClick={() => onNavigate('rfqs')} className="text-[#137fec] text-sm font-medium hover:underline">{t('common.viewAll')}</button>
              </div>
              <div className="flex flex-col mt-4">
                {rfqs.slice(0, 3).map(rfq => (
                  <div key={rfq.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-medium text-[#111827]">RFQ-{rfq.id.toUpperCase()}</p>
                      <p className="text-sm text-[#6b7280]">{rfq.date}</p>
                    </div>
                    <StatusBadge status={rfq.status === 'OPEN' ? 'pending' : rfq.status.toLowerCase()} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quotes Received */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex justify-between items-center">
                <h3 className="text-[#111827] text-lg font-semibold">{t('client.dashboard.quotesReceived')}</h3>
                <button onClick={() => onNavigate('rfqs')} className="text-[#137fec] text-sm font-medium hover:underline">{t('common.viewAll')}</button>
              </div>
              <div className="flex flex-col mt-4">
                {quotes.slice(0, 5).map(quote => (
                  <div
                    key={quote.id}
                    className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors px-2 -mx-2 rounded"
                    onClick={() => handleViewQuotes(quote.rfqId)}
                  >
                    <div>
                      <p className="font-medium text-[#111827] group-hover:text-[#137fec]">{t('client.dashboard.forRfq')} RFQ-{quote.rfqId.toUpperCase()}</p>
                      <p className="text-sm text-[#6b7280]">{t('client.dashboard.fromSupplier')} {users.find(u => u.id === quote.supplierId)?.publicId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#111827] font-medium">${quote.finalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      <span className="text-xs text-[#137fec] font-medium">{t('client.dashboard.viewQuote')}</span>
                    </div>
                  </div>
                ))}
                {quotes.length === 0 && (
                  <EmptyState type="quotes" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Order History */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex justify-between items-center">
            <h3 className="text-[#111827] text-lg font-semibold">{t('client.dashboard.orderHistory')}</h3>
            <button data-testid="client-dashboard-view-all-orders-button" onClick={() => onNavigate('orders')} className="text-[#137fec] text-sm font-medium hover:underline">{t('common.viewAll')}</button>
          </div>
          <div className="flex flex-col mt-4">
            {orders.map(order => (
              <div key={order.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-medium text-[#111827]">{order.id}</p>
                  <p className="text-sm text-[#6b7280]">${order.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <StatusBadge status={order.status.toLowerCase().replace(/_/g, '_')} size="sm" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW quotes DETAIL ---
  if (activeTab === 'view-quotes') {
    const rfq = rfqs.find(r => r.id === selectedRfqId);
    const rfqQuotes = quotes.filter(q => q.rfqId === selectedRfqId);
    const sortedRfqQuotes = [...rfqQuotes].sort((a, b) => {
      if (quoteSortBy === 'price') {
        return a.finalPrice - b.finalPrice;
      }

      if (quoteSortBy === 'delivery') {
        return parseLeadTimeDays(a.leadTime) - parseLeadTimeDays(b.leadTime);
      }

      const supplierA = users.find((u) => u.id === a.supplierId);
      const supplierB = users.find((u) => u.id === b.supplierId);
      return (supplierB?.rating || 0) - (supplierA?.rating || 0);
    });
    // Helper to get first item name for title
    const firstItem = rfq?.items[0] ? products.find(p => p.id === rfq.items[0].productId) : null;
    const itemTitle = firstItem ? firstItem.name : t('client.rfq.multipleItems');

    if (!rfq) return <div className="p-12 text-center">{t('client.rfq.rfqNotFound')}</div>;

    return (
      <div className="p-4 md:p-8 lg:p-12">
        <div className="flex flex-col gap-8">
          {/* Breadcrumbs & Heading */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onNavigate('dashboard')} className="text-slate-500 text-sm font-medium hover:text-[#137fec]">{t('client.rfq.home')}</button>
              <span className="text-slate-500 text-sm font-medium">/</span>
              <button onClick={() => onNavigate('rfqs')} className="text-slate-500 text-sm font-medium hover:text-[#137fec]">{t('sidebar.rfqs')}</button>
              <span className="text-slate-500 text-sm font-medium">/</span>
              <span className="text-slate-800 text-sm font-medium">RFQ #{rfq.id.toUpperCase()} - {itemTitle}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              <p className="text-slate-900 text-4xl font-black tracking-[-0.033em]">{t('client.rfq.quotesFor')} #{rfq.id.toUpperCase()}</p>
            </div>
          </div>

          {/* RFQ Summary Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-6">
              <div className="flex flex-col gap-1">
                <p className="text-slate-500 text-sm font-normal">{t('client.rfq.rfqTitle')}</p>
                <p className="text-slate-800 text-sm font-medium">{t('client.rfq.orderOf')} {itemTitle}</p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-slate-500 text-sm font-normal">{t('common.status')}</p>
                <p className="text-emerald-600 text-sm font-medium">
                  {rfq.status === 'QUOTED' ? t('client.rfq.awaitingDecision') : t(`status.${rfq.status.toLowerCase()}`)}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-slate-500 text-sm font-normal">{t('client.rfq.submissionDate')}</p>
                <p className="text-slate-800 text-sm font-medium">{rfq.date}</p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-slate-500 text-sm font-normal">{t('client.dashboard.quotesReceived')}</p>
                <p className="text-slate-800 text-sm font-medium">{rfqQuotes.length}</p>
              </div>
            </div>
          </div>

          {/* Sort/Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-slate-600 font-medium">{rfqQuotes.length} {t('client.rfq.quotesFound')}</p>
            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setQuoteSortBy('price')}
                className={`flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-lg border pl-3 pr-2 shadow-sm transition-colors ${quoteSortBy === 'price'
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
              >
                <p className="text-slate-700 text-sm font-medium">{t('client.rfq.priceLowToHigh')}</p>
                <span className="material-symbols-outlined text-lg text-slate-500">arrow_downward</span>
              </button>
              <button
                onClick={() => setQuoteSortBy('delivery')}
                className={`flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-lg border pl-3 pr-2 shadow-sm transition-colors ${quoteSortBy === 'delivery'
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
              >
                <p className="text-slate-700 text-sm font-medium">{t('client.rfq.deliveryTime')}</p>
                <span className="material-symbols-outlined text-lg text-slate-500">swap_vert</span>
              </button>
              <button
                onClick={() => setQuoteSortBy('rating')}
                className={`flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-lg border pl-3 pr-2 shadow-sm transition-colors ${quoteSortBy === 'rating'
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
              >
                <p className="text-slate-700 text-sm font-medium">{t('client.rfq.rating')}</p>
                <span className="material-symbols-outlined text-lg text-slate-500">swap_vert</span>
              </button>
            </div>
          </div>

          {/* Quote Display Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {sortedRfqQuotes.map((quote, idx) => {
              const supplier = users.find(u => u.id === quote.supplierId);
              // For visual distinctness like the design, we highlight one as 'recommended' if it has best rating or price, 
              // or just style them based on index for demo variety
              const isHighlighted = idx === 1;
              const colorNames = ['Violet', 'Indigo', 'Teal', 'Rose', 'Amber'];
              const displayColor = colorNames[idx % colorNames.length];

              return (
                <div key={quote.id} className={`flex flex-col bg-white rounded-xl overflow-hidden transition-all duration-300 ${isHighlighted ? 'border border-[#137fec]/50 ring-2 ring-[#137fec]/20 shadow-lg transform -translate-y-1' : 'border border-slate-200 shadow-sm hover:shadow-md'}`}>
                  <div className="p-6 flex flex-col gap-5 flex-grow">
                    <div className="flex items-center justify-between">
                      <p className={`text-lg font-bold ${isHighlighted ? 'text-[#137fec]' : 'text-slate-800'}`}>
                        {t('client.rfq.supplierName')} {displayColor}
                      </p>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <span className="material-symbols-outlined text-amber-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        <span className="font-medium text-sm">{supplier?.rating ?? defaultSupplierRating ?? '-'}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex flex-col gap-1">
                        <p className="text-slate-500">{t('client.rfq.estimatedDelivery')}</p>
                        <p className="font-medium text-slate-700">{quote.leadTime}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-slate-500">{t('client.rfq.finalPrice')}</p>
                        <p className="font-medium text-slate-700">${quote.finalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-slate-200">
                    <button
                      onClick={() => handleAcceptQuoteFromList(quote)}
                      className="w-full flex items-center justify-center h-10 px-4 rounded-lg bg-[#137fec] text-white text-sm font-bold hover:bg-[#137fec]/90 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2"
                    >
                      {t('client.rfq.acceptQuote')}
                    </button>
                  </div>
                </div>
              );
            })}

            {rfqQuotes.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center text-center bg-white border border-slate-200 rounded-xl shadow-sm p-12 mt-6">
                <div className="p-4 bg-[#137fec]/10 rounded-full mb-4">
                  <span className="material-symbols-outlined text-4xl text-[#137fec]">hourglass_empty</span>
                </div>
                <h3 className="text-xl font-bold text-slate-800">{t('client.rfq.noQuotesYet')}</h3>
                <p className="max-w-md mt-2 text-slate-500">{t('client.rfq.noQuotesDesc')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- CREATE RFQ VIEW ---
  if (activeTab === 'create-rfq') {
    const createRfqProducts = products.filter(p =>
      (p.category === 'Janitorial' || p.category === 'Maintenance' || p.category === 'IT Supplies') &&
      p.name.toLowerCase().includes(rfqSearchTerm.toLowerCase())
    );

    const selectedKeys = Object.keys(selectedItemsMap);

    return (
      <div data-testid="client-create-rfq-view" className="p-4 md:p-8 lg:p-12 font-display text-[#343A40]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {/* Main Content */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            {/* PageHeading */}
            <div className="flex flex-wrap justify-between gap-3">
              <div className="flex flex-col gap-2">
                <p className="text-[#343A40] text-3xl md:text-4xl font-black tracking-[-0.033em]">{t('client.rfq.title')}</p>
                <p className="text-[#6C757D] text-base font-normal">{t('client.rfq.subtitle')}</p>
              </div>
            </div>

            {/* Step 1: Item Selection */}
            <div className="flex flex-col gap-4">
              <h2 className="text-[#343A40] text-xl font-bold tracking-[-0.015em]">{t('client.rfq.step1')}</h2>
              {/* SearchBar */}
              <div className="py-1">
                <label className="flex flex-col min-w-40 h-12 w-full">
                  <div className="flex w-full flex-1 items-stretch rounded-lg h-full border border-[#DEE2E6] focus-within:ring-2 focus-within:ring-[#0052CC]">
                    <div className="text-[#6C757D] flex bg-[#F7F8FA] items-center justify-center pl-4 rounded-l-lg">
                      <span aria-hidden="true" className="material-symbols-outlined">search</span>
                    </div>
                    <input
                      className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-[#343A40] focus:outline-none border-none bg-[#F7F8FA] h-full placeholder:text-[#6C757D] pl-2 text-base font-normal"
                      placeholder={t('client.rfq.searchProducts')}
                      value={rfqSearchTerm}
                      onChange={(e) => setRfqSearchTerm(e.target.value)}
                    />
                  </div>
                </label>
              </div>

              {/* ImageGrid */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
                {createRfqProducts.map(product => {
                  const isSelected = !!selectedItemsMap[product.id];
                  return (
                    <div key={product.id} className={`flex flex-col gap-3 rounded-lg border p-3 group relative ${isSelected ? 'border-2 border-[#0052CC] bg-[#0052CC]/5' : 'border-[#DEE2E6]'}`}>
                      {isSelected && (
                        <div className="absolute top-2 right-2 size-5 bg-[#0052CC] text-white rounded-full flex items-center justify-center">
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check</span>
                        </div>
                      )}
                      <div className="w-full bg-center bg-no-repeat aspect-square bg-cover rounded-md" style={{ backgroundImage: `url('${product.image}')` }}></div>
                      <div>
                        <p className="text-[#343A40] text-base font-medium line-clamp-1">{product.name}</p>
                        <p className="text-[#6C757D] text-sm font-normal truncate">{product.description}</p>
                      </div>
                      <button
                        onClick={() => toggleSelectedItem(product)}
                        disabled={isSelected}
                        className={`mt-1 w-full text-center text-sm font-semibold py-2 px-3 rounded-md transition-colors ${isSelected
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-[#0052CC]/10 text-[#0052CC] hover:bg-[#0052CC]/20'
                          }`}
                      >
                        {isSelected ? t('client.rfq.added') : t('client.rfq.addToRfq')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Specify Details */}
            <div className="flex flex-col gap-6">
              <h2 className="text-[#343A40] text-xl font-bold tracking-[-0.015em] pt-4">{t('client.rfq.step2')}</h2>

              {/* Selected Items Table */}
              <div className="overflow-x-auto bg-[#F7F8FA] rounded-lg border border-[#DEE2E6]">
                <table className="w-full text-left">
                  <thead className="text-sm text-[#6C757D] uppercase">
                    <tr>
                      <th className="px-6 py-3" scope="col">{t('client.rfq.item')}</th>
                      <th className="px-6 py-3 w-32" scope="col">{t('common.quantity')}</th>
                      <th className="px-6 py-3" scope="col">{t('common.notes')}</th>
                      <th className="px-6 py-3" scope="col"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedKeys.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-[#6C757D] text-sm">{t('client.rfq.noItemsSelected')}</td>
                      </tr>
                    ) : (
                      selectedKeys.map(key => {
                        const item = selectedItemsMap[key];
                        const product = products.find(p => p.id === item.productId);
                        return (
                          <tr key={key} className="border-t border-[#DEE2E6]">
                            <td className="px-6 py-4 font-medium text-[#343A40]">{product?.name}</td>
                            <td className="px-6 py-4">
                              <input
                                className="w-24 rounded-md border border-[#DEE2E6] bg-white focus:ring-[#0052CC] focus:border-[#0052CC] px-3 py-1.5 outline-none"
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateItemDetails(key, 'quantity', parseInt(e.target.value) || 1)}
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                className="w-full rounded-md border border-[#DEE2E6] bg-white focus:ring-[#0052CC] focus:border-[#0052CC] px-3 py-1.5 outline-none"
                                placeholder={t('client.rfq.optionalNotes')}
                                type="text"
                                value={item.notes}
                                onChange={(e) => updateItemDetails(key, 'notes', e.target.value)}
                              />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => toggleSelectedItem(product!)}
                                className="text-[#6C757D] hover:text-red-600"
                              >
                                <span aria-hidden="true" className="material-symbols-outlined">delete</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Overall RFQ Info */}
              <div className="flex flex-col gap-6">
                <h3 className="text-[#343A40] text-lg font-bold">{t('client.rfq.overallInfo')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#6C757D] mb-1" htmlFor="rfq-title">{t('client.rfq.rfqTitle')}</label>
                    <input className="w-full rounded-lg border border-[#DEE2E6] bg-[#F7F8FA] focus:ring-[#0052CC] focus:border-[#0052CC] px-4 py-2.5 outline-none" id="rfq-title" placeholder={t('client.rfq.rfqTitlePlaceholder')} type="text" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#6C757D] mb-1" htmlFor="delivery-date">{t('client.rfq.desiredDeliveryDate')}</label>
                    <input className="w-full rounded-lg border border-[#DEE2E6] bg-[#F7F8FA] focus:ring-[#0052CC] focus:border-[#0052CC] px-4 py-2.5 outline-none" id="delivery-date" type="date" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#6C757D] mb-1" htmlFor="requirements">{t('client.rfq.generalRequirements')}</label>
                  <textarea className="w-full rounded-lg border border-[#DEE2E6] bg-[#F7F8FA] focus:ring-[#0052CC] focus:border-[#0052CC] px-4 py-2.5 outline-none" id="requirements" placeholder={t('client.rfq.requirementsPlaceholder')} rows={4}></textarea>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#6C757D] mb-1">{t('client.rfq.attachments')}</label>
                  <div className="flex justify-center items-center w-full px-6 pt-5 pb-6 border-2 border-[#DEE2E6] border-dashed rounded-lg bg-[#F7F8FA]">
                    <div className="space-y-1 text-center">
                      <span className="material-symbols-outlined text-4xl text-[#6C757D] mx-auto">cloud_upload</span>
                      <div className="flex text-sm text-[#6C757D]">
                        <label className="relative cursor-pointer rounded-md font-medium text-[#0052CC] hover:text-[#0052CC]/80 focus-within:outline-none" htmlFor="file-upload">
                          <span>{t('client.rfq.uploadFile')}</span>
                          <input className="sr-only" id="file-upload" name="file-upload" type="file" />
                        </label>
                        <p className="pl-1 rtl:pr-1 rtl:pl-0">{t('client.rfq.orDragAndDrop')}</p>
                      </div>
                      <p className="text-xs text-[#6C757D]/80">{t('client.rfq.fileTypes')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Summary Panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-28">
              <div className="rounded-xl border border-[#DEE2E6] bg-[#F7F8FA] p-6 flex flex-col gap-6">
                <h3 className="text-[#343A40] text-lg font-bold">{t('client.rfq.rfqTitle')}</h3>
                <div className="flex flex-col gap-4">
                  {selectedKeys.map(key => {
                    const item = selectedItemsMap[key];
                    const product = products.find(p => p.id === item.productId);
                    return (
                      <div key={key} className="flex justify-between items-center text-sm">
                        <p className="text-[#343A40] line-clamp-1 mr-2">{product?.name}</p>
                        <p className="text-[#6C757D] font-medium whitespace-nowrap">{t('client.rfq.qty')}: {item.quantity}</p>
                      </div>
                    )
                  })}
                  {selectedKeys.length === 0 && (
                    <p className="text-sm text-[#6C757D] italic">{t('client.rfq.noItemsSelected')}</p>
                  )}
                  <div className="border-t border-[#DEE2E6]"></div>
                  <div className="flex justify-between items-center font-bold">
                    <p>{t('common.total')} {t('client.rfqs.items')}</p>
                    <p>{selectedKeys.length}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 pt-2">
                  <button
                    onClick={submitRfq}
                    disabled={selectedKeys.length === 0 || submitted}
                    className="w-full bg-[#0052CC] text-white font-semibold py-3 px-4 rounded-lg hover:bg-[#0052CC]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitted ? (
                      <span className="material-symbols-outlined animate-spin text-xl">refresh</span>
                    ) : (
                      t('client.rfq.submitRfq')
                    )}
                  </button>
                  <button
                    onClick={handleSaveRfqDraft}
                    className="w-full bg-white text-[#6C757D] font-semibold py-3 px-4 rounded-lg border border-[#DEE2E6] hover:bg-gray-50"
                  >
                    {t('common.save')}
                  </button>
                  <button
                    onClick={() => onNavigate('dashboard')}
                    className="w-full text-center text-sm text-[#6C757D] hover:text-[#0052CC]"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- BROWSE VIEW ---
  if (activeTab === 'browse') {
    // Filter products (Moved logic inside but dependent on top-level state)
    const filteredProducts = products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = p.status === 'APPROVED';
      const matchesCategory = selectedCategory ? p.category === selectedCategory : true;
      const matchesSubcategory = selectedSubcategory ? p.subcategory === selectedSubcategory : true;
      return matchesStatus && matchesSearch && matchesCategory && matchesSubcategory;
    });

    // Handle "Add to RFQ"
    const isSelected = (productId: string) => !!selectedItemsMap[productId];

    // Render Function for Product Card
    const renderProductCard = (product: Product, displayMode: 'grid' | 'carousel' = 'grid') => {
      const supplier = users.find((user) => user.id === product.supplierId);
      const productRating = supplier?.rating ?? defaultSupplierRating;

      return (
        <div
          key={product.id}
          className={`group bg-white border border-gray-200 rounded-lg p-4 flex flex-col hover:shadow-lg transition-all duration-300 h-full ${displayMode === 'carousel' ? 'min-w-[200px] max-w-[200px]' : ''}`}
        >
          <div className="h-40 w-full flex items-center justify-center mb-4 p-2 bg-gray-50 rounded-md">
            <img alt={product.name} className="max-h-full w-auto object-contain mix-blend-multiply" src={product.image} />
          </div>
          <h3 className="font-bold text-gray-900 text-sm mb-1 leading-tight line-clamp-2 min-h-[2.5em]">{product.name}</h3>

          <div className="flex items-center mb-2 text-xs">
            <div className="flex text-yellow-400 mr-1">
              <span className="material-symbols-outlined text-[14px] fill-current">star</span>
              <span className="material-symbols-outlined text-[14px] fill-current">star</span>
              <span className="material-symbols-outlined text-[14px] fill-current">star</span>
              <span className="material-symbols-outlined text-[14px] fill-current">star</span>
              <span className="material-symbols-outlined text-[14px] fill-current">star_half</span>
            </div>
            <span className="text-gray-500 font-medium">{typeof productRating === 'number' ? productRating.toFixed(1) : '-'}</span>
          </div>

          <div className="mt-auto pt-4">
            {isSelected(product.id) ? (
              <div className="flex items-center justify-between bg-green-50 text-green-700 px-3 py-2 rounded-md border border-green-200">
                <span className="text-xs font-bold">{t('client.browse.added')}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelectedItem(product); }}
                  className="text-green-700 hover:text-red-600"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); toggleSelectedItem(product); }}
                className="w-full bg-[#137fec] hover:bg-[#0b5cbe] text-white font-bold py-2 px-4 rounded text-sm transition-colors flex items-center justify-center gap-2"
              >
                <span>{t('client.browse.requestQuote')}</span>
              </button>
            )}
          </div>
        </div>
      );
    };

    // --- MAIN BROWSE RENDER ---
    return (
      <div data-testid="client-browse-view" className="font-sans text-[#333] bg-white min-h-screen pb-20">

        {/* TOP HEADER / SEARCH AREA */}
        <header className="bg-white border-b border-gray-200 pt-6 pb-6 px-4 md:px-8 mb-0">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              {/* Breadcrumbs / Back */}
              <div className="flex items-center gap-2">
                {selectedCategory && (
                  <button
                    onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
                    className="flex items-center gap-1 text-sm font-medium text-[#4c739a] hover:text-[#137fec]"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    {t('client.browse.backToCategories')}
                  </button>
                )}
                {!selectedCategory && (
                  <h1 className="text-3xl font-bold font-serif tracking-tight text-black">{t('client.browse.marketplace')}</h1>
                )}
              </div>

              {/* Action Button */}
              {Object.keys(selectedItemsMap).length > 0 && (
                <button
                  onClick={submitRfq}
                  disabled={submitted}
                  className="bg-[#137fec] text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:bg-[#137fec]/90 transition-all flex items-center gap-2"
                >
                  {submitted ? (
                    <span className="material-symbols-outlined animate-spin text-xl">refresh</span>
                  ) : (
                    <span className="material-symbols-outlined text-xl">send</span>
                  )}
                  {t('client.browse.requestQuote')} ({Object.keys(selectedItemsMap).length})
                </button>
              )}
            </div>

            {/* Search Bar */}
            <div className="relative w-full max-w-[900px] mx-auto">
              <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none pl-[15px]">
                <span className="material-symbols-outlined text-gray-400">search</span>
              </div>
              <input
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
                placeholder={t('client.browse.searchHint')}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="w-full max-w-[1400px] mx-auto px-4 md:px-8">

          {/* VIEW: ALL CATEGORIES (Landing) */}
          {!selectedCategory && !searchTerm && (
            <>
              {/* Shop by Category */}
              <section className="mt-8 mb-12">
                <h2 className="text-xl font-bold text-black mb-6">{t('client.browse.shopByCategory')}</h2>
                <div className="flex flex-wrap justify-center gap-8 text-center">
                  {categories.map(cat => (
                    <div key={cat} onClick={() => setSelectedCategory(cat)} className="flex flex-col items-center group cursor-pointer w-32">
                      <div className={`w-24 h-24 md:w-28 md:h-28 rounded-full ${categoryAssets[cat]?.color || 'bg-gray-100'} flex items-center justify-center mb-3 border border-gray-200 group-hover:shadow-md transition-all group-hover:scale-105`}>
                        <span className="material-symbols-outlined text-4xl text-gray-700">{categoryAssets[cat]?.icon || 'category'}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800">{t(categoryAssets[cat]?.label)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <hr className="border-t border-gray-200 my-8" />

              {/* Featured Carousels for each Layout */}
              {categories.slice(0, 3).map(cat => {
                const catProducts = products.filter(p => p.category === cat && p.status === 'APPROVED').slice(0, 6);
                if (catProducts.length === 0) return null;

                return (
                  <section key={cat} className="relative group/carousel mb-12">
                    <div className="flex justify-between items-center mb-4 px-1">
                      <h2 className="text-lg font-bold text-black">{t('client.browse.featuredIn')} {t(categoryAssets[cat]?.label)}</h2>
                      <button onClick={() => setSelectedCategory(cat)} className="text-xs text-blue-500 hover:underline">{t('client.browse.seeMore')} &gt;</button>
                    </div>
                    <div className="flex overflow-x-auto gap-4 pb-4 px-1 scrollbar-hide">
                      {catProducts.map(p => renderProductCard(p, 'carousel'))}
                    </div>
                  </section>
                );
              })}
            </>
          )}

          {/* VIEW: CATEGORY DETAIL */}
          {selectedCategory && !searchTerm && (
            <>
              {/* Category Hero */}
              <section className={`w-full py-16 text-center mb-10 rounded-xl ${categoryAssets[selectedCategory]?.heroBg?.includes('gradient') ? 'bg-gradient-to-b ' + categoryAssets[selectedCategory].heroBg : categoryAssets[selectedCategory]?.heroBg || 'bg-gray-50'}`}>
                <div className="max-w-4xl mx-auto px-4">
                  <p className="uppercase text-gray-600 mb-3 font-medium text-xs tracking-widest">{t(categoryAssets[selectedCategory]?.label)} {t('client.browse.category')}</p>
                  <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-4">{t(`categoryHero.${getCategoryKey(selectedCategory)}.title`)}</h1>
                  <p className="text-lg text-gray-600 font-medium">{t(`categoryHero.${getCategoryKey(selectedCategory)}.subtitle`)}</p>
                </div>
              </section>

              {/* Subcategories */}
              {categorySubcategories.length > 0 && (
                <section className="mb-12">
                  <h2 className="text-2xl font-bold text-gray-900 mb-8">{t('client.browse.shopBySubCategory')}</h2>
                  <div className="flex flex-wrap justify-center gap-6">
                    {categorySubcategories.map(sub => (
                      <div
                        key={sub.name}
                        onClick={() => setSelectedSubcategory(selectedSubcategory === sub.name ? null : sub.name)}
                        className={`group cursor-pointer flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-300 w-40 md:w-48 h-48 ${selectedSubcategory === sub.name
                          ? 'bg-blue-50 border-blue-500 shadow-md transform scale-105'
                          : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-lg hover:-translate-y-1'
                          }`}
                      >
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors duration-300 ${selectedSubcategory === sub.name ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600'
                          }`}>
                          <span className="material-symbols-outlined text-3xl">{sub.icon}</span>
                        </div>
                        <span className={`text-sm font-semibold text-center leading-tight ${selectedSubcategory === sub.name ? 'text-blue-700' : 'text-gray-700 group-hover:text-blue-700'
                          }`}>
                          {t(sub.translationKey)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Product Grid */}
              <section>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedSubcategory ? `${t(categorySubcategories.find(s => s.name === selectedSubcategory)?.translationKey || '')} ${t('client.browse.products')}` : `${t('client.browse.all')} ${t(`categoryHero.${getCategoryKey(selectedCategory)}.title`)} ${t('client.browse.products')}`}
                  </h2>
                  <span className="text-gray-500 text-sm">{filteredProducts.length} {t('client.browse.items')}</span>
                </div>

                {filteredProducts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {filteredProducts.map(p => renderProductCard(p))}
                  </div>
                ) : (
                  <div className="py-20 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p>{t('client.browse.noProductsFound')}</p>
                    <button onClick={() => setSelectedSubcategory(null)} className="mt-4 text-blue-600 hover:underline">{t('client.browse.clearFilters')}</button>
                  </div>
                )}
              </section>
            </>
          )}

          {/* VIEW: SEARCH RESULTS */}
          {searchTerm && (
            <div className="mt-8">
              <h2 className="text-xl font-bold mb-6">{t('client.browse.searchResultsFor')} "{searchTerm}"</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredProducts.map(p => renderProductCard(p))}
              </div>
              {filteredProducts.length === 0 && (
                <EmptyState type="products" title={t('client.browse.noSearchResults')} />
              )}
            </div>
          )}

        </main>
      </div>
    );
  }

  // --- rfqs VIEW ---
  if (activeTab === 'rfqs') {
    return (
      <div data-testid="client-rfqs-view" className="p-4 md:p-8 lg:p-12 space-y-8">
        <div className="flex items-center justify-between bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t('client.rfqs.title')}</h2>
            <p className="text-slate-500 mt-1">{t('client.rfqs.subtitle')}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExportRfqs}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
            >
              {t('client.rfqs.exportCsv')}
            </button>
            <button onClick={() => onNavigate('create-rfq')} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors">{t('client.rfqs.newRequest')}</button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider">{t('client.rfqs.rfqDetails')}</th>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider">{t('client.rfqs.date')}</th>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider">{t('client.rfqs.items')}</th>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider">{t('client.rfqs.status')}</th>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider text-right">{t('client.rfqs.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rfqs.map(rfq => {
                  const rfqQuotes = quotes.filter(q => q.rfqId === rfq.id);
                  const quoteCount = rfqQuotes.length;

                  return (
                    <tr key={rfq.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-sm">#{rfq.id.toUpperCase()}</span>
                          <span className="text-xs text-slate-400 mt-0.5">{t('client.rfq.generalInquiry')}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-slate-600 text-sm font-medium">{rfq.date}</td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                            {rfq.items.length} {t('client.rfqs.items')}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <StatusBadge
                          status={rfq.status === 'OPEN' ? 'pending' : rfq.status.toLowerCase()}
                          size="md"
                        />
                      </td>
                      <td className="px-8 py-6 text-right">
                        {rfq.status === 'QUOTED' ? (
                          <div className="flex items-center justify-end gap-4">
                            <div className="text-right">
                              <p className="font-bold text-slate-900 text-sm">{quoteCount} {t('client.rfqs.items')}</p>
                              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">{t('status.quoted')}</p>
                            </div>
                            <button
                              onClick={() => {
                                setComparingRFQ(rfq);
                                loadQuotesForComparison(rfq.id);
                              }}
                              disabled={quoteCount < 2}
                              className="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed mr-2"
                              title={quoteCount < 2 ? t('client.quotes.needMoreQuotes') || 'Need at least 2 quotes to compare' : ''}
                            >
                              {t('client.rfqs.compare')}
                            </button>
                            <button
                              onClick={() => handleViewQuotes(rfq.id)}
                              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all transform active:scale-95"
                            >
                              {t('client.rfqs.reviewQuotes')}
                            </button>
                          </div>
                        ) : rfq.status === 'CLOSED' ? (
                          <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">{t('status.closed')}</span>
                        ) : (
                          <span className="text-slate-400 text-xs font-medium flex items-center justify-end gap-1">
                            <span className="material-symbols-outlined text-sm">hourglass_empty</span>
                            {t('client.rfqs.awaitingSuppliers')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quote Comparison Modal */}
        {
          comparingRFQ && (
            <QuoteComparison
              quotes={comparisonQuotes}
              onAccept={handleAcceptQuote}
              onClose={handleCloseComparison}
            />
          )
        }

        {/* Dual PO Flow Modal */}
        {
          showPOFlow && acceptedQuote && createdOrderId && (
            <DualPOFlow
              orderId={createdOrderId}
              quoteId={acceptedQuote.id}
              onComplete={() => {
                setShowPOFlow(false);
                toast.success(t('client.orders.createSuccess') || 'Order submitted successfully!');
                onNavigate('orders');
              }}
              onCancel={() => {
                setShowPOFlow(false);
                setAcceptedQuote(null);
              }}
            />
          )
        }
      </div >
    );
  }

  // --- orders VIEW ---
  if (activeTab === 'orders') {
    return (
      <div data-testid="client-orders-view" className="p-4 md:p-8 lg:p-12 space-y-8">
        <div className="flex items-center justify-between bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t('client.orders.orderManagement')}</h2>
            <p className="text-slate-500 mt-1">{t('client.orders.orderManagementDesc')}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExportOrders}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <span className="material-symbols-outlined text-base mr-2 inline-block align-middle">download</span>
              {t('client.orders.export')}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider">{t('client.orders.orderId')}</th>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider">{t('client.orders.date')}</th>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider">{t('client.orders.items')}</th>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider">{t('client.orders.amount')}</th>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider">{t('common.status')}</th>
                  <th className="px-8 py-5 font-semibold text-slate-600 uppercase text-xs tracking-wider text-right">{t('client.orders.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 text-sm">{order.id}</span>
                        <span className="text-xs text-slate-400 mt-0.5">{t('client.orders.purchaseOrder')}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-slate-600 text-sm font-medium">{order.date}</td>
                    <td className="px-8 py-6">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                        {t('client.rfq.multipleItems')}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <span className="font-bold text-slate-900">${order.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </td>
                    <td className="px-8 py-6">
                      <StatusBadge status={order.status.toLowerCase().replace(/_/g, '_')} size="md" />
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button
                        onClick={() => setSelectedOrderForDetails(order)}
                        data-testid="client-orders-view-details-button"
                        className="text-blue-600 text-sm font-bold hover:underline"
                      >
                        {t('client.orders.viewDetails')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedOrderForDetails && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-xl bg-white shadow-xl border border-slate-200">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{t('client.orders.orderDetails') || 'Order Details'}</h3>
                <button
                  onClick={() => setSelectedOrderForDetails(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 grid gap-6 lg:grid-cols-2">
                <div className="space-y-3 text-sm">
                  <p><span className="font-semibold text-slate-700">{t('client.orders.orderId')}:</span> {selectedOrderForDetails.id}</p>
                  <p><span className="font-semibold text-slate-700">{t('client.orders.date')}:</span> {new Date(selectedOrderForDetails.date).toLocaleString()}</p>
                  <p><span className="font-semibold text-slate-700">{t('client.orders.amount')}:</span> ${selectedOrderForDetails.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p><span className="font-semibold text-slate-700">{t('common.status')}:</span> {selectedOrderForDetails.status}</p>
                  {selectedOrderForDetails.system_po_number && (
                    <p><span className="font-semibold text-slate-700">{t('admin.orders.po', 'PO')}:</span> {selectedOrderForDetails.system_po_number}</p>
                  )}
                  {appConfig.payment.enableExternalPaymentLinks && selectedOrderForDetails.paymentLinkUrl && (
                    <a
                      href={selectedOrderForDetails.paymentLinkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium"
                    >
                      <span className="material-symbols-outlined text-base">open_in_new</span>
                      {t('client.orders.openPaymentLink') || 'Open payment link'}
                    </a>
                  )}
                </div>

                {(selectedOrderForDetails.status === 'PENDING_PAYMENT'
                  || selectedOrderForDetails.status === 'AWAITING_CONFIRMATION') && (
                    <PaymentInstructions
                      order={selectedOrderForDetails}
                      onPaymentReferenceAdded={async () => {
                        await loadOrders();
                        const updatedOrder = await bankTransferService.getOrderById(selectedOrderForDetails.id);
                        if (updatedOrder) {
                          setSelectedOrderForDetails(updatedOrder);
                        }
                      }}
                    />
                  )}
              </div>
              <div className="p-4 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setSelectedOrderForDetails(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-medium"
                >
                  {t('common.close') || 'Close'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- SETTINGS VIEW ---
  // --- SETTINGS VIEW ---
  if (activeTab === 'settings') {
    return <ClientSettings currentUser={currentUser} updateUser={updateUser} />;
  }

  // --- CUSTOM REQUEST VIEW ---
  if (activeTab === 'custom-request') {
    return (
      <div className="p-4 md:p-8 lg:p-12">
        <CustomItemRequestForm
          clientId={currentUser?.id || ''}
          onSuccess={() => {
            toast.success(t('customRequest.success') || 'Request submitted successfully');
            onNavigate('dashboard');
          }}
          onCancel={() => onNavigate('dashboard')}
        />
      </div>
    );
  }

  if (activeTab === 'financials') {
    return <ClientFinancials />;
  }

  if (activeTab === 'help') {
    return (
      <div className="p-4 md:p-8 lg:p-12 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-2xl font-bold text-slate-900">{t('sidebar.help')}</h2>
          <p className="text-slate-500 mt-2">{t('help.description') || 'Need assistance? Use one of the support options below.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('custom-request')}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              {t('help.createRequest') || 'Create a support request'}
            </button>
            <button
              onClick={() => onNavigate('rfqs')}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              {t('help.reviewRfqs') || 'Review your RFQs'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 flex items-center justify-center h-96 flex-col text-center rounded-2xl">
      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-100">
        <span className="material-symbols-outlined text-4xl text-slate-300">construction</span>
      </div>
      <h3 className="text-xl font-bold text-slate-900">{t('comingSoon.title')}</h3>
      <p className="text-slate-500 max-w-md mt-2 leading-relaxed">{t('comingSoon.description')}</p>
    </div>
  );
};

// Sub-component for Settings to manage form state
const ClientSettings: React.FC<{ currentUser: any, updateUser: any }> = ({ currentUser, updateUser }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    companyName: currentUser?.companyName || '',
    phone: '', // Add phone to User type if needed
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      await updateUser(currentUser.id, {
        name: formData.name,
        companyName: formData.companyName,
        // phone: formData.phone // Uncomment when User type has phone
      });
      toast.success(t('client.settings.saved') || 'Settings saved successfully');
    } catch (error) {
      logger.error('Error saving settings:', error);
      toast.error(t('client.settings.saveFailed') || 'Failed to save settings');
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
      toast.error(t('client.settings.passwordRequired') || 'Please complete all password fields');
      return;
    }

    if (!currentUser?.email) {
      toast.error(t('client.settings.passwordUpdateFailed') || 'Failed to update password');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error(t('client.settings.passwordTooShort') || 'Password must be at least 8 characters');
      return;
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      toast.error(t('client.settings.passwordMustDiffer') || 'New password must be different from current password');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t('client.settings.passwordMismatch') || 'New password and confirmation do not match');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: passwordData.currentPassword,
      });
      if (verifyError) {
        throw new Error(t('client.settings.invalidCurrentPassword') || 'Current password is incorrect');
      }

      const { error } = await supabase.auth.updateUser({ password: passwordData.newPassword });
      if (error) {
        throw error;
      }

      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success(t('client.settings.passwordUpdated') || 'Password updated successfully');
    } catch (error: any) {
      logger.error('Error updating password:', error);
      toast.error(error?.message || t('client.settings.passwordUpdateFailed') || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="p-4 md:p-8 lg:p-12 space-y-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-slate-900">{t('client.settings.title')}</h2>
        <p className="text-slate-500">{t('client.settings.subtitle')}</p>
      </div>

      {/* Profile Picture */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <ProfilePictureUpload
          currentImage={currentUser?.profilePicture}
          userName={currentUser?.name || 'User'}
        />
      </div>

      {/* Profile Information */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <h3 className="text-lg font-bold text-slate-900 mb-6">{t('client.settings.profileInfo')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('client.settings.fullName')}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('client.settings.emailAddress')}</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              disabled
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('client.settings.companyName')}</label>
            <input
              type="text"
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('client.settings.phoneNumber')}</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder={t('common.phonePlaceholder')}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={() => setFormData({
              name: currentUser?.name || '',
              email: currentUser?.email || '',
              companyName: currentUser?.companyName || '',
              phone: ''
            })}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            {t('client.settings.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
            {t('client.settings.saveChanges')}
          </button>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <h3 className="text-lg font-bold text-slate-900 mb-6">{t('client.settings.notifications')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="font-medium text-slate-900">{t('client.settings.emailNotifications')}</p>
              <p className="text-sm text-slate-500">{t('client.settings.emailNotificationsDesc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ms-4">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors"></div>
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white border border-slate-300 rounded-full shadow transition-all duration-200 peer-checked:left-[22px]"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="font-medium text-slate-900">{t('client.settings.smsNotifications')}</p>
              <p className="text-sm text-slate-500">{t('client.settings.smsNotificationsDesc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ms-4">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors"></div>
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white border border-slate-300 rounded-full shadow transition-all duration-200 peer-checked:left-[22px]"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="font-medium text-slate-900">{t('client.settings.marketingEmails')}</p>
              <p className="text-sm text-slate-500">{t('client.settings.marketingEmailsDesc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ms-4">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors"></div>
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white border border-slate-300 rounded-full shadow transition-all duration-200 peer-checked:left-[22px]"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <h3 className="text-lg font-bold text-slate-900 mb-6">{t('client.settings.security')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('client.settings.currentPassword')}</label>
            <input
              type="password"
              name="currentPassword"
              value={passwordData.currentPassword}
              onChange={handlePasswordChange}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder={t('client.settings.currentPassword')}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{t('client.settings.newPassword')}</label>
              <input
                type="password"
                name="newPassword"
                value={passwordData.newPassword}
                onChange={handlePasswordChange}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={t('client.settings.newPassword')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{t('client.settings.confirmPassword')}</label>
              <input
                type="password"
                name="confirmPassword"
                value={passwordData.confirmPassword}
                onChange={handlePasswordChange}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={t('client.settings.confirmPassword')}
              />
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-200 flex justify-end gap-3">
            <button
              onClick={handleUpdatePassword}
              disabled={isUpdatingPassword}
              className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {t('client.settings.updatePassword')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
