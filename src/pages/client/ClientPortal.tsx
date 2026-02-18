import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, Product, RFQ, Quote, OrderStatus, UserRole } from '../../types/types';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { QuickActions } from '../../components/ui/QuickActions';
import {
  PortalPageHeader,
  PortalMetricCard,
  PortalPageShell,
  PortalSection
} from '../../components/ui/PortalDashboardShell';
import { ProfilePictureUpload } from '../../components/ProfilePictureUpload';
import { SearchBar } from '../../components/ui/SearchBar';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';
import { CustomItemRequestForm } from '../../components/CustomItemRequestForm';
import { api } from '../../services/api';
import { QuoteComparison, QuoteWithDetails } from '../../components/QuoteComparison';
import { DualPOFlow } from '../../components/DualPOFlow';
import { ClientFinancials } from '../../components/client/ClientFinancials';
import { ReviewModal } from '../../components/client/ReviewModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import { categoryService } from '../../services/categoryService';
import { PaymentInstructions } from '../../components/PaymentInstructions';
import bankTransferService from '../../services/bankTransferService';
import { appConfig } from '../../config/appConfig';
import { logger } from '../../utils/logger';
import { getUserFacingError } from '../../utils/errorMessages';
import { reviewService } from '../../services/reviewService';
import { getBestValueQuoteId, parseLeadTimeDays } from '../../utils/quoteValue';
import { ClientCustomRequestsList } from '../../components/client/ClientCustomRequestsList';
import { poGeneratorService } from '../../services/poGeneratorService';

interface ClientPortalProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

interface SelectedItem {
  productId: string;
  quantity: number;
  notes: string;
  flexibility: 'EXACT' | 'OPEN_TO_EQUIVALENT' | 'OPEN_TO_ALTERNATIVES';
}

type QuoteWithPotentialItems = QuoteWithDetails & { quote_items?: Array<{ productId: string; productName: string }> };

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

export const ClientPortal: React.FC<ClientPortalProps> = ({ activeTab, onNavigate }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { currentUser, products, rfqs, quotes, orders, users, addRFQ, updateUser, loadOrders, systemConfig, triggerAutoQuoteCheck } = useStore();

  useEffect(() => {
    triggerAutoQuoteCheck();
  }, []);
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
  const [orderForReview, setOrderForReview] = useState<Order | null>(null);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<Record<string, boolean>>({});
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');
  const [partialQuoteWarning, setPartialQuoteWarning] = useState<{
    quoteId: string;
    missingItems: string[];
    fallbackQuote: Quote;
  } | null>(null);

  // Product Detail Modal State
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);

  // Browse View State (Moved to top level to fix hook violation)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategoryHierarchy, setSubcategoryHierarchy] = useState<Record<string, { name: string; icon: string; translationKey?: string }[]>>({});
  const rfqDefaultExpiryDays = Math.max(1, Number(systemConfig.rfqDefaultExpiryDays || 7));
  const defaultRfqExpiryDate = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + rfqDefaultExpiryDays);
    return date.toISOString().split('T')[0];
  }, [rfqDefaultExpiryDays]);

  useEffect(() => {
    // Load categories from service
    const fetchCategories = async () => {
      try {
        const [mainCats, hierarchy] = await Promise.all([
          categoryService.getMainCategories(),
          categoryService.getCategoryTree()
        ]);
        setCategories(mainCats);
        setSubcategoryHierarchy(hierarchy);
      } catch (error) {
        logger.error('Failed to load categories', error);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadReviewedOrders = async () => {
      if (!currentUser) {
        if (isActive) setReviewedOrderIds({});
        return;
      }

      const reviewableOrderIds = orders
        .filter((order) => (
          order.clientId === currentUser.id
          && (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.COMPLETED)
        ))
        .map((order) => order.id);

      if (reviewableOrderIds.length === 0) {
        if (isActive) setReviewedOrderIds({});
        return;
      }

      const reviewedIds = await reviewService.getReviewedOrderIds(reviewableOrderIds);
      if (!isActive) return;

      const nextState = reviewedIds.reduce<Record<string, boolean>>((acc, orderId) => {
        acc[orderId] = true;
        return acc;
      }, {});
      setReviewedOrderIds(nextState);
    };

    loadReviewedOrders();
    return () => {
      isActive = false;
    };
  }, [currentUser, orders]);


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

  const humanizeLabel = (value: string) => (
    value
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );

  const categoryAssets: Record<string, { color: string, icon: string, heroBg: string, label: string }> = {
    'Office': { color: 'bg-blue-100', icon: 'desk', heroBg: 'bg-gradient-to-b from-blue-500 to-blue-50', label: 'categories.office.label' },
    'IT Supplies': { color: 'bg-indigo-100', icon: 'computer', heroBg: 'bg-[#F3F5F7]', label: 'categories.itSupplies.label' },
    'Breakroom': { color: 'bg-orange-100', icon: 'coffee', heroBg: 'bg-white', label: 'categories.breakroom.label' },
    'Janitorial': { color: 'bg-green-100', icon: 'cleaning_services', heroBg: 'bg-slate-100', label: 'categories.janitorial.label' },
    'Maintenance': { color: 'bg-gray-100', icon: 'build', heroBg: 'bg-blue-50', label: 'categories.maintenance.label' },
  };

  const getCategoryDisplayLabel = (categoryName: string) => {
    const knownLabelKey = categoryAssets[categoryName]?.label;
    if (knownLabelKey) {
      return t(knownLabelKey, humanizeLabel(categoryName));
    }

    const normalizedCategoryKey = categoryName
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .replace(/[^a-z0-9]/g, '');
    return t(`categories.${normalizedCategoryKey}.label`, humanizeLabel(categoryName));
  };

  const getSubcategoryDisplayLabel = (
    categoryName: string | null,
    subcategoryName: string,
    translationKey?: string
  ) => {
    if (translationKey) {
      return t(translationKey, humanizeLabel(subcategoryName));
    }

    if (!categoryName) {
      return humanizeLabel(subcategoryName);
    }

    const categoryKey = getCategoryKey(categoryName);
    const subcategoryKey = subcategoryName
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .replace(/[^a-z0-9]/g, '');
    return t(
      `categories.${categoryKey}.subcategories.${subcategoryKey}.label`,
      humanizeLabel(subcategoryName)
    );
  };

  const defaultSupplierRating = React.useMemo(() => {
    const ratings = users
      .filter((user) => user.role === UserRole.SUPPLIER && typeof user.rating === 'number')
      .map((user) => user.rating as number);
    if (ratings.length === 0) return null;
    const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    return Number(average.toFixed(1));
  }, [users]);

  const dashboardClientName = currentUser?.companyName || currentUser?.name || t('client.dashboard.client');

  const isOrderReviewable = (order: Order) => (
    order.status === OrderStatus.DELIVERED || order.status === OrderStatus.COMPLETED
  );

  const hasOrderReview = (orderId: string) => Boolean(reviewedOrderIds[orderId]);

  // Get subcategories for selected category from hierarchy (not from products)
  const categorySubcategories = React.useMemo(() => {
    if (!selectedCategory) return [];
    return subcategoryHierarchy[selectedCategory] || [];
  }, [selectedCategory, subcategoryHierarchy]);
  const selectedSubcategoryLabel = React.useMemo(() => {
    if (!selectedSubcategory) return '';
    const selectedSub = categorySubcategories.find((entry) => entry.name === selectedSubcategory);
    if (!selectedSub) return humanizeLabel(selectedSubcategory);
    return getSubcategoryDisplayLabel(selectedCategory, selectedSub.name, selectedSub.translationKey);
  }, [categorySubcategories, selectedCategory, selectedSubcategory, t]);

  const availableBrands = React.useMemo(
    () => [...new Set(products.map((product) => product.brand).filter((brand): brand is string => Boolean(brand && brand.trim())))].sort(),
    [products]
  );

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
        [product.id]: { productId: product.id, quantity: 1, notes: '', flexibility: 'EXACT' }
      });
    }
  };

  const updateItemDetails = (
    productId: string,
    field: 'quantity' | 'notes' | 'flexibility',
    value: number | string
  ) => {
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
      // Capture form fields
      const deliveryLocationInput = document.getElementById('delivery-location') as HTMLInputElement | null;
      const deliveryLocation = deliveryLocationInput?.value?.trim() || undefined;
      const deliveryDateInput = document.getElementById('delivery-date') as HTMLInputElement | null;
      const desiredDeliveryDate = deliveryDateInput?.value || undefined;
      const flexibilityInput = document.getElementById('rfq-flexibility') as HTMLSelectElement | null;
      const flexibility = flexibilityInput?.value || 'EXACT';
      const requirementsInput = document.getElementById('requirements') as HTMLTextAreaElement | null;
      const generalRequirements = requirementsInput?.value?.trim() || undefined;
      const rfqTitleInput = document.getElementById('rfq-title') as HTMLInputElement | null;
      const rfqTitle = rfqTitleInput?.value?.trim() || undefined;
      const expiryDate = defaultRfqExpiryDate;

      // Create RFQ items from selected products and apply per-item flexibility
      const items = Object.values(selectedItemsMap).map(item => ({
        productId: item.productId,
        quantity: Math.floor(Number(item.quantity)),
        notes: item.notes,
        flexibility: (item.flexibility || flexibility) as NonNullable<RFQ['flexibility']>
      }));

      const hasInvalidQuantity = items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0);
      if (hasInvalidQuantity) {
        toast.error(t('client.rfq.invalidQuantity'));
        return;
      }

      // Create the RFQ
      const rfq: RFQ = {
        id: `rfq-${Date.now()}`,
        clientId: currentUser.id,
        items,
        status: 'OPEN',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        deliveryLocation,
        desiredDeliveryDate,
        validUntil: `${expiryDate}T23:59:59`,
        expiryDate,
        flexibility: flexibility as RFQ['flexibility'],
        generalRequirements,
        title: rfqTitle
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

  // Credit limit helper: compute available credit for the current user
  const getCreditInfo = () => {
    if (!currentUser || currentUser.creditLimit === undefined || currentUser.creditLimit === null) {
      return { hasLimit: false, creditLimit: 0, creditUsed: 0, available: 0, utilizationPercent: 0 };
    }
    const creditLimit = Math.max(0, Number(currentUser.creditLimit || 0));
    if (creditLimit <= 0) {
      return { hasLimit: false, creditLimit: 0, creditUsed: 0, available: 0, utilizationPercent: 0 };
    }
    const creditUsed = currentUser.creditUsed || 0;
    const available = Math.max(0, creditLimit - creditUsed);
    const utilizationPercent = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0;
    return { hasLimit: true, creditLimit, creditUsed, available, utilizationPercent };
  };

  // Check if accepting a quote would exceed the credit limit.
  // Returns true if OK to proceed, false if blocked.
  const checkCreditLimitForQuote = (quotePrice: number): boolean => {
    if (!currentUser) return false;
    const { hasLimit, available } = getCreditInfo();

    // If no credit limit is assigned, allow (the DB RPC will also check)
    if (!hasLimit) return true;

    if (quotePrice > available) {
      toast.error(
        t('client.credit.overLimitMessage', {
          quotePrice: quotePrice.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          available: available.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        }) || `This quote (SAR ${quotePrice.toFixed(2)}) would exceed your credit limit. Available credit: SAR ${available.toFixed(2)}.`
      );
      return false;
    }
    return true;
  };

  const acceptQuoteAndInitializeOrder = async (quoteId: string, quoteForFlow: Quote | QuoteWithDetails) => {
    // Determine quote price from either Quote or QuoteWithDetails shape
    const quotePrice = (quoteForFlow as Quote).finalPrice
      ?? (quoteForFlow as QuoteWithDetails).finalPrice
      ?? (quoteForFlow as QuoteWithDetails).price
      ?? 0;

    if (!Number.isFinite(Number(quotePrice)) || Number(quotePrice) <= 0) {
      toast.error(t('client.orders.invalidQuoteAmount'));
      return false;
    }

    // Enforce credit limit before proceeding
    if (!checkCreditLimitForQuote(quotePrice)) {
      return false;
    }

    const { order } = await api.acceptQuote(quoteId);

    if (!order) {
      toast.error(t('client.orders.createError') || 'Failed to initialize order');
      return false;
    }

    setCreatedOrderId(order.id);
    await loadOrders();
    setAcceptedQuote(quoteForFlow as Quote);
    // Accepting a quote should not force-open PO flow.
    // Clients can continue PO submission from Orders when ready.
    setShowPOFlow(false);
    toast.success(t('client.orders.quoteAcceptedSuccess'));
    onNavigate('orders');
    return true;
  };

  const isOrderEligibleForPOSubmission = (order: Order): boolean => {
    if (!order.quoteId || order.client_po_uploaded) return false;

    const resumableStatuses = new Set<OrderStatus>([
      OrderStatus.PENDING_ADMIN_CONFIRMATION,
      OrderStatus.CONFIRMED,
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.AWAITING_CONFIRMATION,
    ]);

    return resumableStatuses.has(order.status);
  };

  const handleResumePOFlow = async (order: Order) => {
    if (!order.quoteId) {
      toast.error(t('client.orders.resumePoMissingQuote'));
      return;
    }

    try {
      let sourceQuote = quotes.find((quote) => quote.id === order.quoteId) || null;
      if (!sourceQuote) {
        sourceQuote = await api.getQuoteById(order.quoteId);
      }

      if (!sourceQuote) {
        toast.error(t('client.orders.resumePoQuoteNotFound'));
        return;
      }

      setAcceptedQuote(sourceQuote);
      setCreatedOrderId(order.id);
      setShowPOFlow(true);
      setSelectedOrderForDetails(null);
    } catch (error: any) {
      logger.error('Failed to resume PO flow:', error);
      toast.error(getUserFacingError(error, t('client.orders.resumePoError')));
    }
  };

  const handleAcceptQuote = async (quoteId: string) => {
    if (!currentUser) return;

    try {
      const quote = comparisonQuotes.find(q => q.id === quoteId);
      if (!quote) return;

      const accepted = await acceptQuoteAndInitializeOrder(quoteId, quote);
      if (accepted) {
        handleCloseComparison();
      }
    } catch (error: any) {
      logger.error('Failed to accept quote:', error);
      toast.error(getUserFacingError(error, t('client.orders.createError') || 'Failed to initialize order'));
    }
  };

  const getQuoteItemsForWarning = (quote: QuoteWithPotentialItems) => {
    return quote.quoteItems || quote.quote_items || [];
  };

  const handleAcceptQuoteFromList = async (quote: Quote) => {
    if (!currentUser) return;

    try {
      const detailedQuotes = (await api.getQuotesWithDetails(quote.rfqId)) as QuoteWithPotentialItems[];
      const selectedQuoteDetails = detailedQuotes.find((entry) => entry.id === quote.id);
      const rfqRecord = rfqs.find((record) => record.id === quote.rfqId);

      const requiredItems = (rfqRecord?.items || []).map((item) => {
        const product = products.find((productOption) => productOption.id === item.productId);
        return {
          productId: item.productId,
          productName: product?.name || item.productId,
        };
      });

      if (requiredItems.length > 0) {
        const selectedProductIds = new Set(
          getQuoteItemsForWarning(selectedQuoteDetails || ({} as QuoteWithPotentialItems)).map((item) => item.productId)
        );
        const missingItems = requiredItems
          .filter((requiredItem) => !selectedProductIds.has(requiredItem.productId))
          .map((requiredItem) => requiredItem.productName);

        if (missingItems.length > 0) {
          setPartialQuoteWarning({
            quoteId: quote.id,
            missingItems,
            fallbackQuote: quote,
          });
          return;
        }
      }

      await acceptQuoteAndInitializeOrder(quote.id, quote);
    } catch (error: any) {
      logger.error('Failed to accept quote from list:', error);
      toast.error(getUserFacingError(error, t('client.orders.createError') || 'Failed to initialize order'));
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

  const toTimestamp = (value?: string) => {
    if (!value) return 0;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  };

  const clientRfqs = React.useMemo(
    () => rfqs.filter((rfq) => (!currentUser?.id ? true : rfq.clientId === currentUser.id)),
    [rfqs, currentUser?.id]
  );

  const clientRfqIds = React.useMemo(
    () => new Set(clientRfqs.map((rfq) => rfq.id)),
    [clientRfqs]
  );

  const clientQuotes = React.useMemo(
    () => quotes.filter((quote) => clientRfqIds.has(quote.rfqId)),
    [quotes, clientRfqIds]
  );

  const clientOrders = React.useMemo(
    () => orders.filter((order) => (!currentUser?.id ? true : order.clientId === currentUser.id)),
    [orders, currentUser?.id]
  );

  const sortedClientRfqs = React.useMemo(
    () => [...clientRfqs].sort((a, b) => toTimestamp(b.date || b.createdAt) - toTimestamp(a.date || a.createdAt)),
    [clientRfqs]
  );

  const rfqDateById = React.useMemo(
    () => new Map(clientRfqs.map((rfq) => [rfq.id, rfq.date || rfq.createdAt || ''])),
    [clientRfqs]
  );

  const sortedClientQuotes = React.useMemo(
    () => [...clientQuotes].sort((a, b) => {
      const aDate = rfqDateById.get(a.rfqId) || '';
      const bDate = rfqDateById.get(b.rfqId) || '';
      return toTimestamp(bDate) - toTimestamp(aDate);
    }),
    [clientQuotes, rfqDateById]
  );

  const sortedClientOrders = React.useMemo(
    () => [...clientOrders].sort((a, b) => toTimestamp(b.date || b.updatedAt || b.createdAt) - toTimestamp(a.date || a.updatedAt || a.createdAt)),
    [clientOrders]
  );

  const filteredClientOrders = React.useMemo(() => {
    const fromTimestamp = orderDateFrom
      ? new Date(`${orderDateFrom}T00:00:00`).getTime()
      : null;
    const toTimestampLimit = orderDateTo
      ? new Date(`${orderDateTo}T23:59:59.999`).getTime()
      : null;

    return sortedClientOrders.filter((order) => {
      if (orderStatusFilter === 'active' && ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.status)) return false;
      if (orderStatusFilter === 'delivered' && !['DELIVERED', 'COMPLETED'].includes(order.status)) return false;
      if (orderStatusFilter === 'cancelled' && order.status !== 'CANCELLED') return false;

      const orderTimestamp = toTimestamp(order.date || order.updatedAt || order.createdAt);
      if (fromTimestamp !== null && orderTimestamp < fromTimestamp) return false;
      if (toTimestampLimit !== null && orderTimestamp > toTimestampLimit) return false;

      return true;
    });
  }, [orderDateFrom, orderDateTo, orderStatusFilter, sortedClientOrders]);

  const pendingQuotesCount = clientQuotes.filter((quote) => quote.status === 'SENT_TO_CLIENT').length;
  const openRfqsCount = clientRfqs.filter((rfq) => rfq.status === 'OPEN').length;
  const pendingAdminConfirmationCount = clientOrders.filter((order) => order.status === OrderStatus.PENDING_ADMIN_CONFIRMATION).length;
  const activeOrdersCount = clientOrders.filter((order) => ![
    OrderStatus.DELIVERED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ].includes(order.status)).length;
  const reviewPendingCount = clientOrders.filter((order) => isOrderReviewable(order) && !hasOrderReview(order.id)).length;

  const workflowCards = [
    {
      id: 'pending-admin',
      title: t('client.dashboard.workflowPendingAdmin'),
      icon: 'fact_check',
      count: pendingAdminConfirmationCount,
      className: 'bg-orange-50 border-orange-200 text-orange-800',
    },
    {
      id: 'confirmed',
      title: t('client.dashboard.workflowConfirmed'),
      icon: 'inventory_2',
      count: clientOrders.filter((order) => [
        OrderStatus.CONFIRMED,
        OrderStatus.PROCESSING,
        OrderStatus.PICKUP_SCHEDULED,
        OrderStatus.PICKED_UP,
        OrderStatus.READY_FOR_PICKUP,
      ].includes(order.status)).length,
      className: 'bg-blue-50 border-blue-200 text-blue-800',
    },
    {
      id: 'transit',
      title: t('client.dashboard.workflowTransit'),
      icon: 'local_shipping',
      count: clientOrders.filter((order) => [
        OrderStatus.IN_TRANSIT,
        OrderStatus.OUT_FOR_DELIVERY,
      ].includes(order.status)).length,
      className: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    },
    {
      id: 'delivered',
      title: t('client.dashboard.workflowDelivered'),
      icon: 'task_alt',
      count: clientOrders.filter((order) => [
        OrderStatus.DELIVERED,
        OrderStatus.COMPLETED,
      ].includes(order.status)).length,
      className: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    },
  ];

  // --- DASHBOARD VIEW ---
  if (activeTab === 'dashboard') {
    return (
      <div data-testid="client-dashboard-view">
        <PortalPageShell>
          <PortalPageHeader
            portalLabel={t('sidebar.clientPortal')}
            title={t('client.dashboard.title')}
            subtitle={`${t('client.dashboard.welcomeBack')}, ${dashboardClientName}`}
            actions={(
              <>
                <button
                  data-testid="client-dashboard-browse-button"
                  onClick={() => onNavigate('browse')}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-[#111827] hover:bg-gray-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">search</span>
                  <span className="truncate">{t('client.dashboard.browseItems')}</span>
                </button>
                <button
                  data-testid="client-dashboard-create-rfq-button"
                  onClick={() => onNavigate('create-rfq')}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-medium text-white hover:bg-[#0f6fd0] transition-colors"
                >
                  <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
                  <span className="truncate">{t('client.dashboard.submitNewRfq')}</span>
                </button>
              </>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <PortalMetricCard
              label={t('client.dashboard.kpiOpenRfqs')}
              value={openRfqsCount}
              icon="description"
              tone="info"
              action={(
                <button
                  onClick={() => onNavigate('rfqs')}
                  className="text-sm font-semibold text-[#137fec] hover:underline"
                >
                  {t('client.dashboard.kpiActionRfqs')}
                </button>
              )}
            />
            <PortalMetricCard
              label={t('client.dashboard.kpiPendingQuotes')}
              value={pendingQuotesCount}
              icon="request_quote"
              tone="info"
              action={(
                <button
                  onClick={() => onNavigate('rfqs')}
                  className="text-sm font-semibold text-[#137fec] hover:underline"
                >
                  {t('client.dashboard.kpiActionQuotes')}
                </button>
              )}
            />
            <PortalMetricCard
              label={t('client.dashboard.kpiActiveOrders')}
              value={activeOrdersCount}
              icon="inventory_2"
              tone="success"
              action={(
                <button
                  onClick={() => onNavigate('orders')}
                  className="text-sm font-semibold text-[#137fec] hover:underline"
                >
                  {t('client.dashboard.kpiActionOrders')}
                </button>
              )}
            />
            <PortalMetricCard
              label={t('client.dashboard.kpiPendingReviews')}
              value={reviewPendingCount}
              icon="star"
              tone="warning"
              action={(
                <button
                  onClick={() => onNavigate('orders')}
                  className="text-sm font-semibold text-[#137fec] hover:underline"
                >
                  {t('client.dashboard.kpiActionReviews')}
                </button>
              )}
            />
          </div>

          <PortalSection
            title={t('client.dashboard.priorityQueue')}
            action={(
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                <span className="material-symbols-outlined text-sm">bolt</span>
                {pendingAdminConfirmationCount + pendingQuotesCount + reviewPendingCount}
              </span>
            )}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => onNavigate('orders')}
                className="text-left rounded-lg border border-orange-200 bg-orange-50 p-3 hover:border-orange-300 transition-colors"
              >
                <p className="font-semibold text-orange-900">{t('client.dashboard.priorityPendingAdmin')}</p>
                <p className="text-sm text-orange-700 mt-1">
                  {t('client.dashboard.priorityPendingAdminDesc', { count: pendingAdminConfirmationCount })}
                </p>
              </button>
              <button
                onClick={() => onNavigate('rfqs')}
                className="text-left rounded-lg border border-blue-200 bg-blue-50 p-3 hover:border-blue-300 transition-colors"
              >
                <p className="font-semibold text-blue-900">{t('client.dashboard.priorityQuoteDecision')}</p>
                <p className="text-sm text-blue-700 mt-1">
                  {t('client.dashboard.priorityQuoteDecisionDesc', { count: pendingQuotesCount })}
                </p>
              </button>
              <button
                onClick={() => onNavigate('orders')}
                className="text-left rounded-lg border border-amber-200 bg-amber-50 p-3 hover:border-amber-300 transition-colors"
              >
                <p className="font-semibold text-amber-900">{t('client.dashboard.priorityReview')}</p>
                <p className="text-sm text-amber-700 mt-1">
                  {t('client.dashboard.priorityReviewDesc', { count: reviewPendingCount })}
                </p>
              </button>
            </div>
            {pendingAdminConfirmationCount + pendingQuotesCount + reviewPendingCount === 0 && (
              <p className="mt-4 text-sm text-gray-500">{t('client.dashboard.priorityEmpty')}</p>
            )}
          </PortalSection>

          {(() => {
            const credit = getCreditInfo();
            const barColor = credit.hasLimit
              ? (credit.utilizationPercent >= 90
                ? 'bg-red-500'
                : credit.utilizationPercent >= 70
                  ? 'bg-amber-500'
                  : 'bg-emerald-500')
              : 'bg-gray-300';
            const statusColor = credit.hasLimit
              ? (credit.utilizationPercent >= 90
                ? 'text-red-600'
                : credit.utilizationPercent >= 70
                  ? 'text-amber-600'
                  : 'text-emerald-600')
              : 'text-gray-500';
            return (
              <PortalSection
                title={t('client.credit.creditOverview')}
                action={(
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        onNavigate('financials');
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">trending_up</span>
                      {t('client.credit.requestIncrease')}
                    </button>
                    <button
                      onClick={() => onNavigate('financials')}
                      className="text-sm font-semibold text-[#137fec] hover:underline"
                    >
                      {t('client.dashboard.viewFinancials')}
                    </button>
                  </div>
                )}
              >
                {credit.hasLimit ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-[#6b7280] font-medium">{t('client.credit.creditLimit')}</span>
                        <span className="text-lg font-bold text-[#111827]">{t('common.currency')} {credit.creditLimit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-[#6b7280] font-medium">{t('client.credit.creditUsed')}</span>
                        <span className="text-lg font-bold text-[#111827]">{t('common.currency')} {credit.creditUsed.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-[#6b7280] font-medium">{t('client.credit.creditAvailable')}</span>
                        <span className={`text-lg font-bold ${statusColor}`}>{t('common.currency')} {credit.available.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                    <div className="relative w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(credit.utilizationPercent, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-[#6b7280]">{credit.utilizationPercent}% {t('client.credit.used')}</span>
                      <span className="text-xs text-[#6b7280]">{t('common.currency')} {credit.available.toLocaleString(undefined, { minimumFractionDigits: 2 })} {t('client.credit.available')}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <span className="material-symbols-outlined text-3xl text-gray-300 mb-2">credit_score</span>
                    <p className="text-sm text-gray-500">{t('client.credit.noCreditLimit')}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('client.credit.requestCreditHint')}</p>
                  </div>
                )}
                <div className="mt-3 inline-flex items-center gap-2 text-xs text-neutral-600">
                  <span className="material-symbols-outlined text-sm">shield</span>
                  {t('client.dashboard.marketAnonymityDesc')}
                </div>
              </PortalSection>
            );
          })()}

          <QuickActions
            onNavigate={onNavigate}
            pendingQuotesCount={pendingQuotesCount}
            activeOrdersCount={activeOrdersCount}
          />

          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[#111827] text-lg font-semibold">{t('client.dashboard.workflowTitle')}</h3>
              <span className="text-xs text-gray-500">{t('client.dashboard.marketAnonymityTitle')}</span>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {workflowCards.map((card) => (
                <div key={card.id} className={`rounded-lg border p-3 ${card.className}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{card.title}</p>
                    <span className="material-symbols-outlined text-base">{card.icon}</span>
                  </div>
                  <p className="mt-2 text-2xl font-bold">{card.count}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
            <div className="lg:col-span-1 flex flex-col gap-6">
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-[#111827] text-lg font-semibold">{t('client.dashboard.recentRfqs')}</h3>
                  <button data-testid="client-dashboard-view-all-rfqs-button" onClick={() => onNavigate('rfqs')} className="text-[#137fec] text-sm font-medium hover:underline">{t('common.viewAll')}</button>
                </div>
                <div className="flex flex-col mt-4">
                  {sortedClientRfqs.slice(0, 4).map((rfq) => (
                    <div key={rfq.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="font-medium text-[#111827]">RFQ-{rfq.id.toUpperCase()}</p>
                        <p className="text-sm text-[#6b7280]">{new Date(rfq.date).toLocaleDateString()}</p>
                      </div>
                      <StatusBadge status={rfq.status === 'OPEN' ? 'pending' : rfq.status.toLowerCase()} size="sm" />
                    </div>
                  ))}
                  {sortedClientRfqs.length === 0 && (
                    <p className="text-sm text-gray-500 py-3">{t('client.dashboard.noRfqsYet')}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-[#111827] text-lg font-semibold">{t('client.dashboard.quotesReceived')}</h3>
                  <button onClick={() => onNavigate('rfqs')} className="text-[#137fec] text-sm font-medium hover:underline">{t('common.viewAll')}</button>
                </div>
                <div className="flex flex-col mt-4">
                  {sortedClientQuotes.slice(0, 6).map((quote) => {
                    const supplier = users.find((user) => user.id === quote.supplierId);
                    const quoteType = quote.type === 'auto' ? 'auto' : 'custom';
                    return (
                      <div
                        key={quote.id}
                        className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors px-2 -mx-2 rounded"
                        onClick={() => handleViewQuotes(quote.rfqId)}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-[#111827]">{t('client.dashboard.forRfq')} RFQ-{quote.rfqId.toUpperCase()}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#6b7280]">
                            <span>{t('client.dashboard.fromSupplier')} {supplier?.publicId || t('client.rfq.supplierName')}</span>
                            {typeof supplier?.rating === 'number' && (
                              <span className="inline-flex items-center gap-1 text-xs">
                                <span className="material-symbols-outlined text-[14px] text-yellow-500">star</span>
                                {supplier.rating.toFixed(1)}
                              </span>
                            )}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${quoteType === 'auto' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                              {quoteType === 'auto' ? t('client.quotes.quoteTypeAuto') : t('client.quotes.quoteTypeCustom')}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[#111827] font-semibold">{t('common.currency')} {quote.finalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                          <span className="text-xs text-[#137fec] font-medium">{t('client.dashboard.viewQuote')}</span>
                        </div>
                      </div>
                    );
                  })}
                  {sortedClientQuotes.length === 0 && (
                    <EmptyState type="quotes" />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex justify-between items-center">
              <h3 className="text-[#111827] text-lg font-semibold">{t('client.dashboard.orderHistory')}</h3>
              <button data-testid="client-dashboard-view-all-orders-button" onClick={() => onNavigate('orders')} className="text-[#137fec] text-sm font-medium hover:underline">{t('common.viewAll')}</button>
            </div>
            <div className="flex flex-col mt-4">
              {sortedClientOrders.slice(0, 8).map((order) => (
                <div key={order.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-[#111827]">{order.id}</p>
                    <p className="text-sm text-[#6b7280]">{t('common.currency')} {order.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={order.status.toLowerCase().replace(/_/g, '_')} size="sm" />
                    {isOrderReviewable(order) && !hasOrderReview(order.id) && (
                      <button
                        onClick={() => setOrderForReview(order)}
                        className="text-xs font-semibold text-[#137fec] hover:text-[#0b5cbe] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors"
                      >
                        {t('client.orders.rate')}
                      </button>
                    )}
                    {hasOrderReview(order.id) && (
                      <div className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
                        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        <span>{t('client.orders.rated')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sortedClientOrders.length === 0 && (
                <p className="text-sm text-gray-500 py-3">{t('client.dashboard.noOrdersYet')}</p>
              )}
            </div>
          </div>

          {orderForReview && activeTab === 'dashboard' && (
            <ReviewModal
              orderId={orderForReview.id}
              supplierLabel={users.find((u) => u.id === orderForReview.supplierId)?.publicId}
              onClose={() => setOrderForReview(null)}
              onSubmitted={() => {
                setReviewedOrderIds((prev) => ({ ...prev, [orderForReview.id]: true }));
                setOrderForReview(null);
              }}
            />
          )}
        </PortalPageShell>
      </div>
    );
  }

  // --- VIEW quotes DETAIL ---
  if (activeTab === 'view-quotes') {
    const rfq = rfqs.find(r => r.id === selectedRfqId);
    const rfqQuotes = quotes.filter(q => q.rfqId === selectedRfqId);
    const bestValueQuoteId = getBestValueQuoteId(
      rfqQuotes.map((quote) => ({
        id: quote.id,
        price: Number(quote.finalPrice || 0),
        leadTime: quote.leadTime,
        rating: Number(users.find((u) => u.id === quote.supplierId)?.rating || defaultSupplierRating || 0),
      }))
    );
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
                  {rfqQuotes.length > 0 ? t('client.rfq.awaitingDecision') : t(`status.${rfq.status.toLowerCase()}`)}
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
              const isHighlighted = Boolean(bestValueQuoteId && quote.id === bestValueQuoteId);

              return (
                <div key={quote.id} className={`flex flex-col bg-white rounded-xl overflow-hidden transition-all duration-300 ${isHighlighted ? 'border border-[#137fec]/50 ring-2 ring-[#137fec]/20 shadow-lg transform -translate-y-1' : 'border border-slate-200 shadow-sm hover:shadow-md'}`}>
                  <div className="p-6 flex flex-col gap-5 flex-grow">
                    <div className="flex items-center justify-between">
                      <p className={`text-lg font-bold ${isHighlighted ? 'text-[#137fec]' : 'text-slate-800'}`}>
                        {supplier?.publicId || `${t('client.rfq.supplierName')} ${idx + 1}`}
                      </p>
                      <div className="flex items-center gap-2">
                        {isHighlighted && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-yellow-100 text-yellow-800">
                            <span className="material-symbols-outlined text-sm text-yellow-600">star</span>
                            {t('client.quotes.bestValue')}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <span className="material-symbols-outlined text-amber-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                          <span className="font-medium text-sm">{supplier?.rating ?? defaultSupplierRating ?? '-'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex flex-col gap-1">
                        <p className="text-slate-500">{t('client.rfq.estimatedDelivery')}</p>
                        <p className="font-medium text-slate-700">{quote.leadTime}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-slate-500">{t('client.rfq.finalPrice')}</p>
                        <p className="font-medium text-slate-700">{t('common.currency')} {quote.finalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-2">
                    {/* Credit utilization info near accept button */}
                    {(() => {
                      const credit = getCreditInfo();
                      if (!credit.hasLimit) return null;
                      const wouldExceed = quote.finalPrice > credit.available;
                      const remainingAfter = credit.available - quote.finalPrice;
                      return (
                        <div className={`text-xs rounded-lg p-2.5 ${wouldExceed ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`font-medium ${wouldExceed ? 'text-red-700' : 'text-emerald-700'}`}>
                              {t('client.credit.availableCreditForQuote')}: {t('common.currency')} {credit.available.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            {wouldExceed && (
                              <span className="material-symbols-outlined text-red-500 text-sm">warning</span>
                            )}
                          </div>
                          {!wouldExceed && (
                            <p className="text-emerald-600 mt-0.5">
                              {t('client.credit.remainingAfter')}: {t('common.currency')} {remainingAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          )}
                          {wouldExceed && (
                            <p className="text-red-600 mt-0.5">{t('client.credit.overLimitTitle')}</p>
                          )}
                        </div>
                      );
                    })()}
                    <button
                      onClick={() => handleAcceptQuoteFromList(quote)}
                      disabled={(() => {
                        const credit = getCreditInfo();
                        return credit.hasLimit && quote.finalPrice > credit.available;
                      })()}
                      className="w-full flex items-center justify-center h-10 px-4 rounded-lg bg-[#137fec] text-white text-sm font-bold hover:bg-[#137fec]/90 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

          {partialQuoteWarning && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
              <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">{t('client.quotes.partialWarningTitle')}</h3>
                  <button
                    onClick={() => setPartialQuoteWarning(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    aria-label={t('common.close')}
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <p className="text-sm text-gray-700">
                  {t('client.quotes.partialWarningBody', { items: partialQuoteWarning.missingItems.join(', ') })}
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setPartialQuoteWarning(null)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={async () => {
                      const pendingQuote = partialQuoteWarning;
                      setPartialQuoteWarning(null);
                      await acceptQuoteAndInitializeOrder(pendingQuote.quoteId, pendingQuote.fallbackQuote);
                    }}
                    className="px-4 py-2 rounded-lg bg-[#137fec] text-white hover:bg-[#137fec]/90"
                  >
                    {t('client.quotes.continueAnyway')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- CREATE RFQ VIEW ---
  if (activeTab === 'create-rfq') {
    // Show all approved, in-stock products, filtered by search term
    const createRfqProducts = products.filter(p =>
      p.name.toLowerCase().includes(rfqSearchTerm.toLowerCase()) &&
      p.status === 'APPROVED' &&
      (p.stock === undefined || p.stock === null || p.stock > 0)
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
                      <th className="px-6 py-3 w-56" scope="col">{t('client.rfq.flexibility')}</th>
                      <th className="px-6 py-3" scope="col">{t('common.notes')}</th>
                      <th className="px-6 py-3" scope="col"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedKeys.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-[#6C757D] text-sm">{t('client.rfq.noItemsSelected')}</td>
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
                              <select
                                className="w-full rounded-md border border-[#DEE2E6] bg-white focus:ring-[#0052CC] focus:border-[#0052CC] px-3 py-1.5 outline-none"
                                value={item.flexibility || 'EXACT'}
                                onChange={(e) => updateItemDetails(key, 'flexibility', e.target.value)}
                              >
                                <option value="EXACT">{t('client.rfq.flexibilityExact')}</option>
                                <option value="OPEN_TO_EQUIVALENT">{t('client.rfq.flexibilityEquivalent')}</option>
                                <option value="OPEN_TO_ALTERNATIVES">{t('client.rfq.flexibilityAlternatives')}</option>
                              </select>
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
                {/* Delivery Location */}
                <div>
                  <label className="block text-sm font-medium text-[#6C757D] mb-1" htmlFor="delivery-location">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base">location_on</span>
                      {t('client.rfq.deliveryLocation')}
                    </span>
                  </label>
                  <input
                    className="w-full rounded-lg border border-[#DEE2E6] bg-[#F7F8FA] focus:ring-[#0052CC] focus:border-[#0052CC] px-4 py-2.5 outline-none"
                    id="delivery-location"
                    placeholder={t('client.rfq.deliveryLocationPlaceholder')}
                    type="text"
                  />
                </div>
                {/* RFQ Expiry Date & Flexibility */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#6C757D] mb-1" htmlFor="rfq-expiry">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base">event_busy</span>
                        {t('client.rfq.expiryDate')}
                      </span>
                    </label>
                    <input
                      className="w-full rounded-lg border border-[#DEE2E6] bg-[#F7F8FA] focus:ring-[#0052CC] focus:border-[#0052CC] px-4 py-2.5 outline-none"
                      id="rfq-expiry"
                      type="date"
                      value={defaultRfqExpiryDate}
                      readOnly
                      disabled
                    />
                    <p className="mt-1 text-xs text-[#6C757D]">
                      {t('client.rfq.expiryManagedByAdmin')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#6C757D] mb-1" htmlFor="rfq-flexibility">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base">swap_horiz</span>
                        {t('client.rfq.flexibility')}
                      </span>
                    </label>
                    <select
                      className="w-full rounded-lg border border-[#DEE2E6] bg-[#F7F8FA] focus:ring-[#0052CC] focus:border-[#0052CC] px-4 py-2.5 outline-none"
                      id="rfq-flexibility"
                    >
                      <option value="EXACT">{t('client.rfq.flexibilityExact')}</option>
                      <option value="OPEN_TO_EQUIVALENT">{t('client.rfq.flexibilityEquivalent')}</option>
                      <option value="OPEN_TO_ALTERNATIVES">{t('client.rfq.flexibilityAlternatives')}</option>
                    </select>
                  </div>
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
      const matchesBrand = selectedBrand ? p.brand === selectedBrand : true;
      // Gap #24: Hide out-of-stock products from clients
      const isInStock = p.stock === undefined || p.stock === null || p.stock > 0;
      return matchesStatus && matchesSearch && matchesCategory && matchesSubcategory && matchesBrand && isInStock;
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
          className={`group bg-white border border-gray-200 rounded-lg p-4 flex flex-col hover:shadow-lg transition-all duration-300 h-full cursor-pointer ${displayMode === 'carousel' ? 'min-w-[200px] max-w-[200px]' : ''}`}
          onClick={() => setSelectedProductForDetail(product)}
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

            <div className="w-full max-w-[900px] mx-auto mt-4 flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600">{t('client.browse.brand')}:</label>
              <select
                value={selectedBrand}
                onChange={(event) => setSelectedBrand(event.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                aria-label={t('client.browse.brand')}
              >
                <option value="">{t('client.browse.allBrands')}</option>
                {availableBrands.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
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
                      <span className="text-sm font-semibold text-gray-800">{getCategoryDisplayLabel(cat)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <hr className="border-t border-gray-200 my-8" />

              {/* Featured Carousels for each Layout */}
              {categories.slice(0, 3).map(cat => {
                const catProducts = products.filter(p => p.category === cat && p.status === 'APPROVED' && (p.stock === undefined || p.stock === null || p.stock > 0)).slice(0, 6);
                if (catProducts.length === 0) return null;

                return (
                  <section key={cat} className="relative group/carousel mb-12">
                    <div className="flex justify-between items-center mb-4 px-1">
                      <h2 className="text-lg font-bold text-black">{t('client.browse.featuredIn')} {getCategoryDisplayLabel(cat)}</h2>
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
                  <p className="uppercase text-gray-600 mb-3 font-medium text-xs tracking-widest">{getCategoryDisplayLabel(selectedCategory)} {t('client.browse.category')}</p>
                  <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-4">
                    {t(`categoryHero.${getCategoryKey(selectedCategory)}.title`, getCategoryDisplayLabel(selectedCategory))}
                  </h1>
                  <p className="text-lg text-gray-600 font-medium">
                    {t(`categoryHero.${getCategoryKey(selectedCategory)}.subtitle`, t('client.browse.categoryProducts'))}
                  </p>
                </div>
              </section>

              {/* Subcategories */}
              {categorySubcategories.length > 0 && (
                <section className="mb-12">
                  <h2 className="text-2xl font-bold text-gray-900 mb-8">{t('client.browse.shopBySubCategory')}</h2>
                  <div className="flex flex-wrap justify-center gap-6">
                    {categorySubcategories.map((sub) => (
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
                          {getSubcategoryDisplayLabel(selectedCategory, sub.name, sub.translationKey)}
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
                    {selectedSubcategory
                      ? `${selectedSubcategoryLabel} ${t('client.browse.products')}`
                      : `${t('client.browse.all')} ${t(`categoryHero.${getCategoryKey(selectedCategory)}.title`, getCategoryDisplayLabel(selectedCategory))} ${t('client.browse.products')}`}
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

        {/* Product Detail Modal */}
        {selectedProductForDetail && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedProductForDetail(null)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="relative">
                <div className="h-64 bg-gray-50 flex items-center justify-center p-8">
                  <img
                    alt={selectedProductForDetail.name}
                    className="max-h-full w-auto object-contain"
                    src={selectedProductForDetail.image}
                  />
                </div>
                <button
                  onClick={() => setSelectedProductForDetail(null)}
                  className="absolute top-4 right-4 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-gray-500 hover:text-gray-800"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedProductForDetail.name}</h2>
                  {selectedProductForDetail.brand && (
                    <p className="text-sm text-blue-600 font-medium mt-1">{selectedProductForDetail.brand}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedProductForDetail.category && (
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                      {getCategoryDisplayLabel(selectedProductForDetail.category)}
                    </span>
                  )}
                  {selectedProductForDetail.subcategory && (
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                      {getSubcategoryDisplayLabel(
                        selectedProductForDetail.category || null,
                        selectedProductForDetail.subcategory
                      )}
                    </span>
                  )}
                  {selectedProductForDetail.sku && (
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">
                      SKU: {selectedProductForDetail.sku}
                    </span>
                  )}
                </div>
                {selectedProductForDetail.description && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-500 uppercase mb-1">{t('product.description')}</h3>
                    <p className="text-gray-700 text-sm leading-relaxed">{selectedProductForDetail.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedProductForDetail.stock !== undefined && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs font-bold text-gray-400 uppercase">{t('product.availability')}</p>
                      <p className={`text-sm font-bold mt-1 ${selectedProductForDetail.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {selectedProductForDetail.stock > 0 ? t('product.inStock') : t('product.outOfStock')}
                      </p>
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      toggleSelectedItem(selectedProductForDetail);
                      setSelectedProductForDetail(null);
                    }}
                    className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${isSelected(selectedProductForDetail.id)
                      ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                      : 'bg-[#137fec] text-white hover:bg-[#0b5cbe]'
                      }`}
                  >
                    <span className="material-symbols-outlined text-lg">
                      {isSelected(selectedProductForDetail.id) ? 'remove_shopping_cart' : 'add_shopping_cart'}
                    </span>
                    {isSelected(selectedProductForDetail.id)
                      ? t('client.browse.removeFromRfq')
                      : t('client.browse.addToRfq')
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
                  const hasQuotes = quoteCount > 0;

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
                          status={hasQuotes ? 'quoted' : (rfq.status === 'OPEN' ? 'pending' : rfq.status.toLowerCase())}
                          size="md"
                        />
                      </td>
                      <td className="px-8 py-6 text-right">
                        {hasQuotes ? (
                          <div className="flex items-center justify-end gap-4">
                            <div className="text-right">
                              <p className="font-bold text-slate-900 text-sm">{quoteCount}</p>
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
              creditInfo={getCreditInfo()}
              rfqItems={comparingRFQ.items.map((item) => {
                const product = products.find((productOption) => productOption.id === item.productId);
                return {
                  productId: item.productId,
                  productName: product?.name || item.productId,
                  brand: product?.brand,
                };
              })}
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
                setAcceptedQuote(null);
                setCreatedOrderId(null);
                toast.success(t('client.orders.createSuccess') || 'Order submitted successfully!');
                onNavigate('orders');
              }}
              onCancel={() => {
                setShowPOFlow(false);
                setAcceptedQuote(null);
                setCreatedOrderId(null);
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

        {/* Status + Date Filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all', label: t('client.orders.filterAll') },
              { key: 'active', label: t('client.orders.filterActive') },
              { key: 'delivered', label: t('client.orders.filterDelivered') },
              { key: 'cancelled', label: t('client.orders.filterCancelled') },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setOrderStatusFilter(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${orderStatusFilter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>{t('client.orders.dateFrom')}</span>
              <input
                type="date"
                value={orderDateFrom}
                onChange={(event) => setOrderDateFrom(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec]"
                aria-label={t('client.orders.dateFrom')}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>{t('client.orders.dateTo')}</span>
              <input
                type="date"
                value={orderDateTo}
                onChange={(event) => setOrderDateTo(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec]"
                aria-label={t('client.orders.dateTo')}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setOrderDateFrom('');
                setOrderDateTo('');
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {t('client.orders.clearDateFilters')}
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          {t('client.orders.showingCount', {
            shown: filteredClientOrders.length,
            total: sortedClientOrders.length,
            defaultValue: 'Showing {{shown}} of {{total}} orders',
          })}
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
                {filteredClientOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-8 py-12 text-center text-sm text-slate-500">
                      {t('client.orders.noOrdersForFilter')}
                    </td>
                  </tr>
                )}
                {filteredClientOrders.map(order => (
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
                      <span className="font-bold text-slate-900">{t('common.currency')} {order.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </td>
                    <td className="px-8 py-6">
                      <StatusBadge status={order.status.toLowerCase().replace(/_/g, '_')} size="md" />
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex flex-col items-end gap-2">
                        {isOrderEligibleForPOSubmission(order) && (
                          <button
                            onClick={() => handleResumePOFlow(order)}
                            className="text-amber-700 text-xs font-bold hover:underline"
                          >
                            {t('client.orders.continuePoSubmission')}
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedOrderForDetails(order)}
                          data-testid="client-orders-view-details-button"
                          className="text-blue-600 text-sm font-bold hover:underline"
                        >
                          {t('client.orders.viewDetails')}
                        </button>
                        {isOrderReviewable(order) && (
                          hasOrderReview(order.id) ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">
                              {t('client.orders.reviewed')}
                            </span>
                          ) : (
                            <button
                              onClick={() => setOrderForReview(order)}
                              className="text-emerald-700 text-xs font-bold hover:underline"
                              aria-label={t('client.orders.rateOrder')}
                            >
                              {t('client.orders.rateOrder')}
                            </button>
                          )
                        )}
                      </div>
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!selectedOrderForDetails) return;

                      const quote = quotes.find(q => q.id === selectedOrderForDetails.quoteId);
                      const rfq = quote ? rfqs.find(r => r.id === quote.rfqId) : null;

                      if (!rfq || !quote || !currentUser) {
                        toast.error('Missing data to generate PO');
                        return;
                      }

                      const relevantProducts = products.filter(p =>
                        quote.quoteItems?.some(qi => qi.productId === p.id)
                      );

                      const poData = {
                        order: selectedOrderForDetails,
                        quote,
                        rfq,
                        products: relevantProducts,
                        client: currentUser
                      };

                      try {
                        await poGeneratorService.downloadPO(poData);
                        toast.success(t('client.po.downloadSuccess') || 'PO downloaded successfully');
                      } catch (err) {
                        console.error('Failed to generate PO:', err);
                        toast.error(t('client.po.downloadError') || 'Failed to download PO');
                      }
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 mr-4"
                  >
                    <span className="material-symbols-outlined text-lg">download</span>
                    {t('client.orders.downloadPO') || 'Download PO'}
                  </button>
                  <button
                    onClick={() => setSelectedOrderForDetails(null)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-6">
                {/* Order Info */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3 text-sm">
                    <p><span className="font-semibold text-slate-700">{t('client.orders.orderId')}:</span> {selectedOrderForDetails.id}</p>
                    <p><span className="font-semibold text-slate-700">{t('client.orders.date')}:</span> {new Date(selectedOrderForDetails.date).toLocaleString()}</p>
                    <p><span className="font-semibold text-slate-700">{t('client.orders.amount')}:</span> {t('common.currency')} {selectedOrderForDetails.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    {selectedOrderForDetails.system_po_number && (
                      <p><span className="font-semibold text-slate-700">{t('admin.orders.po')}:</span> {selectedOrderForDetails.system_po_number}</p>
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

                  {/* Status Badge */}
                  <div className="flex items-start justify-end">
                    <StatusBadge status={selectedOrderForDetails.status.toLowerCase().replace(/_/g, '_')} size="md" />
                  </div>
                </div>

                {isOrderEligibleForPOSubmission(selectedOrderForDetails) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-semibold text-blue-900">
                        {t('client.orders.poSubmissionPendingTitle')}
                      </p>
                      <p className="text-sm text-blue-800 mt-1">
                        {t('client.orders.poSubmissionPendingDesc')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleResumePOFlow(selectedOrderForDetails)}
                      className="self-start lg:self-auto px-4 py-2 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-[#137fec]/90"
                    >
                      {t('client.orders.continuePoSubmission')}
                    </button>
                  </div>
                )}

                {/* Order Status Timeline */}
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-sm font-bold text-slate-700 mb-4">{t('client.orders.timeline')}</h4>
                  {(() => {
                    const timelineSteps = [
                      { key: 'PENDING_ADMIN_CONFIRMATION', label: t('client.orders.timelinePO'), icon: 'description' },
                      { key: 'CONFIRMED', label: t('client.orders.timelineConfirmed'), icon: 'check_circle' },
                      { key: 'PAYMENT_CONFIRMED', label: t('client.orders.timelinePayment'), icon: 'payments' },
                      { key: 'PROCESSING', label: t('client.orders.timelineProcessing'), icon: 'inventory_2' },
                      { key: 'READY_FOR_PICKUP', label: t('status.readyForPickup'), icon: 'warehouse' },
                      { key: 'PICKUP_SCHEDULED', label: t('status.pickupScheduled'), icon: 'event' },
                      { key: 'PICKED_UP', label: t('status.picked_up'), icon: 'move_to_inbox' },
                      { key: 'IN_TRANSIT', label: t('client.orders.timelineDelivery'), icon: 'local_shipping' },
                      { key: 'DELIVERED', label: t('client.orders.timelineDelivered'), icon: 'task_alt' },
                      { key: 'COMPLETED', label: t('status.completed'), icon: 'check_circle' },
                    ];
                    const statusOrder = ['PENDING_ADMIN_CONFIRMATION', 'CONFIRMED', 'PENDING_PAYMENT', 'AWAITING_CONFIRMATION', 'PAYMENT_CONFIRMED', 'PROCESSING', 'READY_FOR_PICKUP', 'PICKUP_SCHEDULED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'IN_TRANSIT', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'CANCELLED'];
                    const currentIdx = statusOrder.indexOf(selectedOrderForDetails.status);
                    const isCancelled = selectedOrderForDetails.status === 'CANCELLED';

                    return (
                      <div className="flex items-center gap-0">
                        {timelineSteps.map((step, idx) => {
                          const stepIdx = statusOrder.indexOf(step.key);
                          const isComplete = !isCancelled && currentIdx >= stepIdx;
                          const isCurrent = !isCancelled && selectedOrderForDetails.status === step.key;
                          return (
                            <React.Fragment key={step.key}>
                              <div className="flex flex-col items-center flex-1 min-w-0">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCancelled ? 'bg-red-100 text-red-400'
                                  : isComplete ? 'bg-green-100 text-green-600'
                                    : 'bg-slate-100 text-slate-400'
                                  } ${isCurrent ? 'ring-2 ring-green-400 ring-offset-2' : ''}`}>
                                  <span className="material-symbols-outlined text-base">{isCancelled ? 'close' : step.icon}</span>
                                </div>
                                <span className={`text-[10px] mt-1 text-center leading-tight ${isComplete ? 'text-green-700 font-semibold' : 'text-slate-400'
                                  }`}>{step.label}</span>
                              </div>
                              {idx < timelineSteps.length - 1 && (
                                <div className={`h-0.5 flex-1 -mt-4 ${!isCancelled && currentIdx > stepIdx ? 'bg-green-400' : 'bg-slate-200'
                                  }`} />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {selectedOrderForDetails.status === 'CANCELLED' && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-medium">
                      {t('client.orders.orderCancelled')}
                    </div>
                  )}
                </div>

                {selectedOrderForDetails.status === 'PENDING_ADMIN_CONFIRMATION' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-orange-600">hourglass_top</span>
                      <div>
                        <p className="font-semibold text-orange-900">{t('client.orders.pendingAdminTitle')}</p>
                        <p className="text-sm text-orange-800 mt-1">{t('client.orders.pendingAdminMessage')}</p>
                      </div>
                    </div>
                  </div>
                )}

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

                {isOrderReviewable(selectedOrderForDetails) && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{t('client.reviews.title')}</p>
                        <p className="text-sm text-slate-500 mt-1">{t('client.reviews.cardHint')}</p>
                      </div>
                      {hasOrderReview(selectedOrderForDetails.id) ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                          {t('client.orders.reviewed')}
                        </span>
                      ) : (
                        <button
                          onClick={() => setOrderForReview(selectedOrderForDetails)}
                          className="px-4 py-2 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-[#137fec]/90"
                        >
                          {t('client.orders.rateOrder')}
                        </button>
                      )}
                    </div>
                  </div>
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

        {orderForReview && (
          <ReviewModal
            orderId={orderForReview.id}
            supplierLabel={users.find((user) => user.id === orderForReview.supplierId)?.publicId}
            onClose={() => setOrderForReview(null)}
            onSubmitted={() => {
              setReviewedOrderIds((prev) => ({ ...prev, [orderForReview.id]: true }));
              setOrderForReview(null);
            }}
          />
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
      <ClientCustomRequestsList
        onCreateNew={() => onNavigate('create-custom-request')}
      />
    );
  }

  if (activeTab === 'create-custom-request') {
    return (
      <div className="p-4 md:p-8 lg:p-12">
        <CustomItemRequestForm
          clientId={currentUser?.id || ''}
          onSuccess={() => {
            toast.success(t('customRequest.success') || 'Request submitted successfully');
            onNavigate('custom-request');
          }}
          onCancel={() => onNavigate('custom-request')}
        />
      </div>
    );
  }

  if (activeTab === 'financials') {
    return (
      <ClientFinancials
        onMakePayment={() => {
          onNavigate('orders');
        }}
      />
    );
  }

  if (activeTab === 'help') {
    return (
      <div className="p-4 md:p-8 lg:p-12 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-2xl font-bold text-slate-900">{t('sidebar.help')}</h2>
          <p className="text-slate-500 mt-2">{t('help.description')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('custom-request')}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              {t('help.createRequest')}
            </button>
            <button
              onClick={() => onNavigate('rfqs')}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              {t('help.reviewRfqs')}
            </button>
          </div>
        </div>
        {/* FAQ Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-4">{t('help.faqTitle')}</h3>
          <div className="space-y-4">
            {[
              { q: t('help.faq1q'), a: t('help.faq1a') },
              { q: t('help.faq2q'), a: t('help.faq2a') },
              { q: t('help.faq3q'), a: t('help.faq3a') },
              { q: t('help.faq4q'), a: t('help.faq4a') },
              { q: t('help.faq5q'), a: t('help.faq5a') },
            ].map((faq, i) => (
              <details key={i} className="border border-slate-200 rounded-lg p-4 group">
                <summary className="font-medium text-slate-800 cursor-pointer group-open:text-blue-700 transition-colors">{faq.q}</summary>
                <p className="mt-2 text-sm text-slate-600">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
        {/* Contact Info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-4">{t('help.contactTitle')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-600">email</span>
              <div>
                <p className="font-medium text-slate-800">{t('help.email')}</p>
                <p className="text-sm text-slate-500">support@mwrd.com</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-600">phone</span>
              <div>
                <p className="font-medium text-slate-800">{t('help.phone')}</p>
                <p className="text-sm text-slate-500">+966 50 000 0000</p>
              </div>
            </div>
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
      const updatedUser = await updateUser(currentUser.id, {
        name: formData.name,
        companyName: formData.companyName,
        // phone: formData.phone // Uncomment when User type has phone
      });
      if (!updatedUser) {
        throw new Error('Unable to persist client settings');
      }
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
      toast.error(getUserFacingError(error, t('client.settings.passwordUpdateFailed') || 'Failed to update password'));
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
