import { logger } from '@/src/utils/logger';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  User,
  Product,
  RFQ,
  Quote,
  Order,
  UserRole,
  SystemConfig,
  OrderStatus,
  CreditLimitAdjustment,
  CreditLimitAdjustmentType
} from '../types/types';
import { autoQuoteService } from '../services/autoQuoteService';
import { authService } from '../services/authService';
import { api } from '../services/api';
import { appConfig } from '../config/appConfig';
import { initializeStorage } from '../utils/storage';

// Initialize and validate storage before creating store
initializeStorage();

// Use centralized config for mode detection
const USE_SUPABASE = appConfig.features.useDatabase && appConfig.supabase.isConfigured;
const DEFAULT_PAGE_SIZE = 100;

type MockSeedData = {
  USERS: User[];
  PRODUCTS: Product[];
  RFQS: RFQ[];
  QUOTES: Quote[];
  ORDERS: Order[];
};

let mockSeedDataPromise: Promise<MockSeedData> | null = null;

const loadMockSeedData = async (): Promise<MockSeedData> => {
  if (!import.meta.env.DEV) {
    // Do not ship demo users/data as active runtime data in production bundles.
    return {
      USERS: [],
      PRODUCTS: [],
      RFQS: [],
      QUOTES: [],
      ORDERS: [],
    };
  }

  if (!mockSeedDataPromise) {
    mockSeedDataPromise = import('../services/mockData').then((module) => ({
      USERS: module.USERS,
      PRODUCTS: module.PRODUCTS,
      RFQS: module.RFQS,
      QUOTES: module.QUOTES,
      ORDERS: module.ORDERS,
    }));
  }

  return mockSeedDataPromise;
};

interface StoreState {
  // Auth
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Data
  users: User[];
  products: Product[];
  rfqs: RFQ[];
  quotes: Quote[];
  orders: Order[];
  creditLimitAdjustments: CreditLimitAdjustment[];

  // Actions
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;

  // Product actions
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  approveProduct: (id: string) => void;
  rejectProduct: (id: string) => void;

  // RFQ actions
  addRFQ: (rfq: RFQ) => void;
  updateRFQ: (id: string, updates: Partial<RFQ>) => void;

  // Quote actions
  addQuote: (quote: Quote) => void;
  updateQuote: (id: string, updates: Partial<Quote>) => void;
  approveQuote: (id: string, marginPercent: number) => void;
  acceptQuote: (id: string) => void;
  rejectQuote: (id: string) => void;

  // Order actions
  addOrder: (order: Order) => void;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<Order | null>;

  // User management
  updateUser: (id: string, updates: Partial<User>) => void;
  adjustClientCreditLimit: (
    clientId: string,
    adjustmentType: CreditLimitAdjustmentType,
    adjustmentAmount: number,
    reason: string
  ) => Promise<{ user: User | null; adjustment: CreditLimitAdjustment | null; error?: string }>;
  setClientMargin: (clientId: string, margin: number) => Promise<{ success: boolean; error?: string }>;
  setRFQMargin: (rfqId: string, margin: number) => Promise<{ success: boolean; error?: string }>;
  getClientCreditLimitAdjustments: (clientId: string, limit?: number) => Promise<CreditLimitAdjustment[]>;
  approveSupplier: (id: string) => void;
  rejectSupplier: (id: string) => void;
  setProfilePicture: (imageUrl: string) => void;

  // Data loading (for Supabase)
  loadProducts: () => Promise<void>;
  loadRFQs: () => Promise<void>;
  loadQuotes: () => Promise<void>;
  loadOrders: () => Promise<void>;
  loadUsers: () => Promise<void>;

  addUser: (userData: any) => Promise<void>;

  // System Configuration
  systemConfig: SystemConfig;
  updateSystemConfig: (updates: Partial<SystemConfig>) => void;
  triggerAutoQuoteCheck: () => void;
  loadSystemConfig: () => Promise<void>;

  // Margin Settings
  marginSettings: { category: string | null; marginPercent: number; isDefault: boolean }[];
  loadMarginSettings: () => Promise<void>;
  updateMarginSetting: (category: string | null, marginPercent: number) => Promise<void>;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentUser: null,
      isAuthenticated: false,
      isLoading: true,
      users: [],
      products: [],
      rfqs: [],
      quotes: [],
      orders: [],
      creditLimitAdjustments: [],

      // Default System Config
      systemConfig: {
        autoQuoteDelayMinutes: 30, // 30 minutes default
        defaultMarginPercent: 10,   // 10% default margin
      },
      marginSettings: [],


      // Initialize auth state from Supabase session
      initializeAuth: async () => {
        if (appConfig.debug.logAuthFlow) {
          logger.auth('Initializing authentication');
        }

        if (USE_SUPABASE) {
          set({ isLoading: true });

          if (appConfig.debug.logAuthFlow) {
            logger.auth('Checking for existing Supabase session');
          }

          const { user } = await authService.getSession();

          if (user) {
            if (appConfig.debug.logAuthFlow) {
              logger.auth('Found existing session', {
                userName: user.name,
                role: user.role
              });
            }

            set({ currentUser: user, isAuthenticated: true, isLoading: false });

            // Load data for authenticated user
            get().loadProducts();
            get().loadRFQs();
            get().loadQuotes();
            get().loadOrders();
            if (user.role === 'ADMIN') {
              get().loadUsers();
              get().loadSystemConfig();
              get().loadMarginSettings();
            }
          } else {
            if (appConfig.debug.logAuthFlow) {
              logger.auth('No existing session found');
            }
            set({ currentUser: null, isAuthenticated: false, isLoading: false });
          }
        } else {
          if (appConfig.debug.logAuthFlow) {
            logger.auth('Mock mode enabled - skipping Supabase session check');
          }

          const mockData = await loadMockSeedData();
          set((state) => ({
            users: state.users.length ? state.users : mockData.USERS,
            products: state.products.length ? state.products : mockData.PRODUCTS,
            rfqs: state.rfqs.length ? state.rfqs : mockData.RFQS,
            quotes: state.quotes.length ? state.quotes : mockData.QUOTES,
            orders: state.orders.length ? state.orders : mockData.ORDERS,
            isLoading: false
          }));
        }
      },

      // Auth actions
      login: async (email: string, password: string) => {
        if (appConfig.debug.logAuthFlow) {
          logger.auth('Login attempt', {
            email,
            mode: USE_SUPABASE ? 'SUPABASE' : 'MOCK'
          });
        }

        if (USE_SUPABASE) {
          // Supabase authentication
          if (appConfig.debug.logAuthFlow) {
            logger.auth('Using Supabase authentication');
          }

          const result = await authService.signIn(email, password);

          if (result.success && result.user) {
            if (appConfig.debug.logAuthFlow) {
              logger.auth('Supabase authentication successful', {
                userName: result.user.name,
                role: result.user.role
              });
            }

            set({ currentUser: result.user, isAuthenticated: true });

            // Load data for authenticated user
            get().loadProducts();
            get().loadRFQs();
            get().loadQuotes();
            get().loadOrders();
            if (result.user.role === 'ADMIN') {
              get().loadUsers();
              get().loadSystemConfig();
              get().loadMarginSettings();
            }
            return result.user;
          }

          if (appConfig.debug.logAuthFlow) {
            logger.auth('Supabase authentication failed', { error: result.error });
          }
          return null;
        } else {
          // Mock authentication implementation for audit/dev
          if (appConfig.debug.logAuthFlow) {
            logger.auth('Using mock authentication');
          }

          const mockData = await loadMockSeedData();

          // Find user by email
          const user = mockData.USERS.find(u => u.email.toLowerCase() === email.toLowerCase());

          if (user) {
            // Simple password validation for demo/audit purposes
            const validPasswords = ['demo', 'test', '123', 'password'];

            // Allow login if password matches common demo passwords
            if (validPasswords.includes(password)) {
              if (appConfig.debug.logAuthFlow) {
                logger.auth('Mock authentication successful', { userName: user.name });
              }

              set({ currentUser: user, isAuthenticated: true, isLoading: false });

              // Ensure mock data is loaded
              set(state => ({
                products: state.products.length ? state.products : mockData.PRODUCTS,
                rfqs: state.rfqs.length ? state.rfqs : mockData.RFQS,
                quotes: state.quotes.length ? state.quotes : mockData.QUOTES,
                orders: state.orders.length ? state.orders : mockData.ORDERS,
                users: state.users.length ? state.users : mockData.USERS
              }));

              return user;
            } else {
              if (appConfig.debug.logAuthFlow) {
                logger.auth('Mock authentication failed: invalid password');
              }
            }
          } else {
            if (appConfig.debug.logAuthFlow) {
              logger.auth('Mock authentication failed: user not found');
            }
          }
          return null;
        }
      },

      logout: async () => {
        if (USE_SUPABASE) {
          await authService.signOut();
        }
        set({ currentUser: null, isAuthenticated: false });
      },

      // Data loading functions for Supabase
      loadProducts: async () => {
        if (USE_SUPABASE) {
          const products = await api.getProducts(undefined, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
          set({ products });
        }
      },

      loadRFQs: async () => {
        if (USE_SUPABASE) {
          const user = get().currentUser;
          const filters: any = {};

          if (user?.role === UserRole.CLIENT) {
            filters.clientId = user.id;
          }
          // Suppliers usually need to see RFQs to quote them. 
          // If the system design allows suppliers to see OPEN RFQs, we might need a status filter or leave it open.
          // For now, assuming Suppliers can see all OPEN RFQs or RFQs they have quoted.
          // api.getRFQs implementation might need to support complex filtering, but usually Suppliers browse ALL open RFQs.
          // So we might only filter for CLIENTS to see strictly their own history.

          const rfqs = await api.getRFQs(filters, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
          set({ rfqs });
        }
      },

      loadQuotes: async () => {
        if (USE_SUPABASE) {
          const user = get().currentUser;
          const filters: any = {};

          if (user?.role === UserRole.CLIENT) {
            // Clients see quotes for their RFQs. 
            // api.getQuotes filters by rfqId or supplierId.
            // It doesn't natively filter by clientId directly unless we join RFQs. 
            // Ideally we should filter this on backend or api.ts should handle it.
            // But for now, if we cannot filter quotes by clientId easily without a join, 
            // we rely on RLS. However, strictly for Client Dashboard, they usually fetch quotes per RFQ.
            // The global 'quotes' list in store might be "all quotes related to me".
            // If api.getQuotes doesn't support clientId, we might be stuck relying on RLS or filtering client-side after fetch 
            // (which defeats the purpose of optimization but helps privacy if we filter result).
            // Let's assume RLS handles it for now because adding clientId filter to quotes requires schema check.
          } else if (user?.role === UserRole.SUPPLIER) {
            filters.supplierId = user.id;
          }

          const quotes = await api.getQuotes(filters, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
          set({ quotes });
        }
      },

      loadOrders: async () => {
        if (USE_SUPABASE) {
          const user = get().currentUser;
          const filters: any = {};

          if (user?.role === UserRole.CLIENT) {
            filters.clientId = user.id;
          } else if (user?.role === UserRole.SUPPLIER) {
            filters.supplierId = user.id;
          }

          const orders = await api.getOrders(filters, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
          set({ orders });
        }
      },

      loadUsers: async () => {
        if (USE_SUPABASE) {
          const users = await api.getUsers({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
          set({ users });
        }
      },

      // Product actions
      addProduct: (product: Product) => {
        if (USE_SUPABASE) {
          api.createProduct(product).then(newProduct => {
            if (newProduct) {
              set(state => ({ products: [...state.products, newProduct] }));
            }
          });
        } else {
          set(state => ({
            products: [...state.products, product]
          }));
        }
      },

      updateProduct: (id: string, updates: Partial<Product>) => {
        if (USE_SUPABASE) {
          api.updateProduct(id, updates).then(updatedProduct => {
            if (updatedProduct) {
              set(state => ({
                products: state.products.map(p =>
                  p.id === id ? updatedProduct : p
                )
              }));
            }
          });
        } else {
          set(state => ({
            products: state.products.map(p =>
              p.id === id ? { ...p, ...updates } : p
            )
          }));
        }
      },

      deleteProduct: (id: string) => {
        if (USE_SUPABASE) {
          api.deleteProduct(id).then(success => {
            if (success) {
              set(state => ({
                products: state.products.filter(p => p.id !== id)
              }));
            }
          });
        } else {
          set(state => ({
            products: state.products.filter(p => p.id !== id)
          }));
        }
      },

      approveProduct: (id: string) => {
        get().updateProduct(id, { status: 'APPROVED' });
      },

      rejectProduct: (id: string) => {
        get().updateProduct(id, { status: 'REJECTED' });
      },

      // RFQ actions
      addRFQ: (rfq: RFQ) => {
        if (USE_SUPABASE) {
          api.createRFQ(rfq).then(newRfq => {
            if (newRfq) {
              set(state => ({ rfqs: [...state.rfqs, newRfq] }));
            }
          });
        } else {
          set(state => ({
            rfqs: [...state.rfqs, rfq]
          }));
        }
      },

      updateRFQ: (id: string, updates: Partial<RFQ>) => {
        if (USE_SUPABASE) {
          api.updateRFQ(id, updates).then(updatedRfq => {
            if (updatedRfq) {
              set(state => ({
                rfqs: state.rfqs.map(r =>
                  r.id === id ? updatedRfq : r
                )
              }));
            }
          });
        } else {
          set(state => ({
            rfqs: state.rfqs.map(r =>
              r.id === id ? { ...r, ...updates } : r
            )
          }));
        }
      },

      // Quote actions
      addQuote: (quote: Quote) => {
        if (USE_SUPABASE) {
          api.createQuote(quote).then(newQuote => {
            if (newQuote) {
              set(state => ({ quotes: [...state.quotes, newQuote] }));
            }
          });
        } else {
          set(state => ({
            quotes: [...state.quotes, quote]
          }));
        }
      },

      updateQuote: (id: string, updates: Partial<Quote>) => {
        if (USE_SUPABASE) {
          api.updateQuote(id, updates).then(updatedQuote => {
            if (updatedQuote) {
              set(state => ({
                quotes: state.quotes.map(q =>
                  q.id === id ? updatedQuote : q
                )
              }));
            }
          });
        } else {
          set(state => ({
            quotes: state.quotes.map(q =>
              q.id === id ? { ...q, ...updates } : q
            )
          }));
        }
      },

      approveQuote: (id: string, marginPercent: number) => {
        if (USE_SUPABASE) {
          api.approveQuote(id, marginPercent).then(updatedQuote => {
            if (updatedQuote) {
              set(state => ({
                quotes: state.quotes.map(q =>
                  q.id === id ? updatedQuote : q
                )
              }));
            }
          });
        } else {
          const quote = get().quotes.find(q => q.id === id);
          if (quote) {
            const finalPrice = quote.supplierPrice * (1 + marginPercent / 100);
            get().updateQuote(id, {
              marginPercent,
              finalPrice,
              status: 'SENT_TO_CLIENT'
            });
          }
        }
      },

      acceptQuote: (id: string) => {
        if (USE_SUPABASE) {
          api.acceptQuote(id).then(result => {
            if (result.quote) {
              set(state => ({
                quotes: state.quotes.map(q =>
                  q.id === id ? result.quote! : q
                )
              }));
            }
            if (result.order) {
              set(state => ({
                orders: [...state.orders, result.order!]
              }));
            }
            // Update RFQ status
            const quote = get().quotes.find(q => q.id === id);
            if (quote) {
              set(state => ({
                rfqs: state.rfqs.map(r =>
                  r.id === quote.rfqId ? { ...r, status: 'CLOSED' as const } : r
                )
              }));
            }
          });
        } else {
          get().updateQuote(id, { status: 'ACCEPTED' });
          const quote = get().quotes.find(q => q.id === id);
          if (quote) {
            // Update RFQ status
            get().updateRFQ(quote.rfqId, { status: 'CLOSED' });

            // Find RFQ to get clientId
            const rfq = get().rfqs.find(r => r.id === quote.rfqId);

            // Create order
            const newOrder: Order = {
              id: `ORD-${Date.now()}`,
              amount: quote.finalPrice,
              status: OrderStatus.PENDING_PAYMENT, // Default start status
              date: new Date().toISOString().split('T')[0],
              clientId: rfq?.clientId || 'unknown',
              supplierId: quote.supplierId,
              quoteId: quote.id
            };
            get().addOrder(newOrder);
          }
        }
      },

      rejectQuote: (id: string) => {
        get().updateQuote(id, { status: 'REJECTED' });
      },

      // Order actions
      addOrder: (order: Order) => {
        set(state => ({
          orders: [...state.orders, order]
        }));
      },

      updateOrder: async (id: string, updates: Partial<Order>) => {
        if (USE_SUPABASE) {
          const updatedOrder = await api.updateOrder(id, updates);
          if (updatedOrder) {
            set(state => ({
              orders: state.orders.map(o =>
                o.id === id ? updatedOrder : o
              )
            }));
            return updatedOrder;
          }
          return null;
        } else {
          let nextOrder: Order | null = null;
          set(state => ({
            orders: state.orders.map(o =>
              o.id === id
                ? (() => {
                  const updated = { ...o, ...updates };
                  nextOrder = updated;
                  return updated;
                })()
                : o
            )
          }));
          return nextOrder;
        }
      },

      // User management
      updateUser: (id: string, updates: Partial<User>) => {
        if (USE_SUPABASE) {
          api.updateUser(id, updates).then(updatedUser => {
            if (updatedUser) {
              set(state => ({
                users: state.users.map(u =>
                  u.id === id ? updatedUser : u
                )
              }));
            }
          });
        } else {
          set(state => ({
            users: state.users.map(u =>
              u.id === id ? { ...u, ...updates } : u
            )
          }));
        }
      },

      adjustClientCreditLimit: async (clientId, adjustmentType, adjustmentAmount, reason) => {
        if (USE_SUPABASE) {
          const result = await api.adjustClientCreditLimit(clientId, adjustmentType, adjustmentAmount, reason);
          if (result.user) {
            set(state => ({
              users: state.users.map((u) => (u.id === clientId ? result.user! : u)),
              creditLimitAdjustments: result.adjustment
                ? [result.adjustment, ...state.creditLimitAdjustments.filter((item) => item.id !== result.adjustment!.id)]
                : state.creditLimitAdjustments
            }));
          }
          return result;
        }

        const currentUser = get().currentUser;
        const targetUser = get().users.find((user) => user.id === clientId);
        if (!targetUser || targetUser.role !== UserRole.CLIENT) {
          return { user: null, adjustment: null, error: 'Client not found' };
        }

        const normalizedAmount = Number(adjustmentAmount);
        const normalizedReason = reason.trim();
        if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
          return { user: null, adjustment: null, error: 'Invalid amount' };
        }
        if (normalizedReason.length < 5) {
          return { user: null, adjustment: null, error: 'Reason must be at least 5 characters' };
        }

        const previousLimit = Math.max(0, Number(targetUser.creditLimit || 0));
        let newLimit = previousLimit;

        if (adjustmentType === 'SET') {
          newLimit = normalizedAmount;
        } else if (adjustmentType === 'INCREASE') {
          if (normalizedAmount === 0) {
            return { user: null, adjustment: null, error: 'Increase amount must be greater than zero' };
          }
          newLimit = previousLimit + normalizedAmount;
        } else {
          if (normalizedAmount === 0) {
            return { user: null, adjustment: null, error: 'Decrease amount must be greater than zero' };
          }
          if (normalizedAmount > previousLimit) {
            return { user: null, adjustment: null, error: 'Decrease amount exceeds current credit limit' };
          }
          newLimit = previousLimit - normalizedAmount;
        }

        const roundedNewLimit = Math.round(newLimit * 100) / 100;
        const adjustment: CreditLimitAdjustment = {
          id: `CLA-${Date.now()}`,
          clientId,
          adminId: currentUser?.id || 'SYSTEM',
          adjustmentType,
          adjustmentAmount: Math.round(normalizedAmount * 100) / 100,
          changeAmount: Math.round((roundedNewLimit - previousLimit) * 100) / 100,
          previousLimit,
          newLimit: roundedNewLimit,
          reason: normalizedReason,
          createdAt: new Date().toISOString(),
          adminName: currentUser?.companyName || currentUser?.name
        };

        const updatedUser: User = {
          ...targetUser,
          creditLimit: roundedNewLimit
        };

        set(state => ({
          users: state.users.map((u) => (u.id === clientId ? updatedUser : u)),
          creditLimitAdjustments: [adjustment, ...state.creditLimitAdjustments]
        }));

        return { user: updatedUser, adjustment };
      },

      setClientMargin: async (clientId, margin) => {
        if (!USE_SUPABASE) {
          // Mock implementation
          set(state => ({
            users: state.users.map(u => u.id === clientId ? { ...u, clientMargin: margin } : u)
          }));
          return { success: true };
        }

        const result = await api.setClientMargin(clientId, margin);
        if (result.success) {
          // Refresh user data to get updated margin
          const updatedUser = await api.getUserById(clientId);
          if (updatedUser) {
            set(state => ({
              users: state.users.map(u => u.id === clientId ? updatedUser : u)
            }));
          }
        }
        return result;
      },

      setRFQMargin: async (rfqId, margin) => {
        if (!USE_SUPABASE) {
          // Mock implementation: update local quotes
          set(state => ({
            quotes: state.quotes.map(q => q.rfqId === rfqId ? { ...q, marginPercent: margin } : q)
          }));
          return { success: true };
        }

        const result = await api.setRFQMargin(rfqId, margin);
        if (result.success) {
          // Refresh quotes to see updated margins
          const quotes = await api.getQuotes(undefined, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
          set({ quotes });
        }
        return result;
      },

      getClientCreditLimitAdjustments: async (clientId, limit = 25) => {
        if (USE_SUPABASE) {
          return api.getClientCreditLimitAdjustments(clientId, limit);
        }

        const adjustments = get().creditLimitAdjustments
          .filter((item) => item.clientId === clientId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return adjustments.slice(0, limit);
      },

      addUser: async (userData: any) => {
        if (USE_SUPABASE) {
          const newUser = await api.createUser(userData);
          if (newUser) {
            set(state => ({
              users: [newUser, ...state.users]
            }));
            await get().loadUsers(); // Reload to ensure sync
          }
        } else {
          // Mock implementation
          const parsedCreditLimit = Number(userData.creditLimit);
          const newUser: User = {
            id: `USR-${Date.now()}`,
            email: userData.email,
            name: userData.name,
            role: userData.role,
            companyName: userData.companyName,
            verified: false,
            status: userData.role === 'SUPPLIER' ? 'PENDING' : 'ACTIVE',
            kycStatus: 'INCOMPLETE',
            dateJoined: new Date().toISOString().split('T')[0],
            phone: userData.phone,
            creditLimit: userData.role === UserRole.CLIENT && Number.isFinite(parsedCreditLimit)
              ? Math.max(parsedCreditLimit, 0)
              : undefined
          };
          set(state => ({
            users: [newUser, ...state.users]
          }));
        }
      },

      approveSupplier: (id: string) => {
        if (USE_SUPABASE) {
          api.approveSupplier(id).then(updatedUser => {
            if (updatedUser) {
              set(state => ({
                users: state.users.map(u =>
                  u.id === id ? updatedUser : u
                )
              }));
            }
          });
        } else {
          get().updateUser(id, {
            status: 'APPROVED',
            kycStatus: 'VERIFIED',
            verified: true
          });
        }
      },

      rejectSupplier: (id: string) => {
        if (USE_SUPABASE) {
          api.rejectSupplier(id).then(updatedUser => {
            if (updatedUser) {
              set(state => ({
                users: state.users.map(u =>
                  u.id === id ? updatedUser : u
                )
              }));
            }
          });
        } else {
          get().updateUser(id, {
            status: 'REJECTED',
            kycStatus: 'REJECTED'
          });
        }
      },

      setProfilePicture: (imageUrl: string) => {
        const currentUser = get().currentUser;
        if (currentUser) {
          set({
            currentUser: { ...currentUser, profilePicture: imageUrl }
          });
          // Also update in users array
          set(state => ({
            users: state.users.map(u =>
              u.id === currentUser.id ? { ...u, profilePicture: imageUrl } : u
            )
          }));
        }
      },

      // System Actions
      triggerAutoQuoteCheck: async () => {
        const { rfqs, products, users, quotes, systemConfig } = get();
        const { updatedRfqs, newQuotes } = autoQuoteService.checkAutoQuotes(
          rfqs,
          products,
          users,
          quotes,
          systemConfig
        );

        if (updatedRfqs.length > 0) {
          // Update RFQs in local state
          set(state => ({
            rfqs: state.rfqs.map(r => {
              const updated = updatedRfqs.find(u => u.id === r.id);
              return updated ? updated : r;
            })
          }));
          // Persist to Supabase
          if (USE_SUPABASE) {
            for (const rfq of updatedRfqs) {
              await api.updateRFQ(rfq.id, { autoQuoteTriggered: true }).catch(err =>
                logger.error('Failed to persist auto-quote RFQ flag:', err)
              );
            }
          }
        }

        if (newQuotes.length > 0) {
          if (USE_SUPABASE) {
            // Persist each quote to Supabase and use DB-generated IDs
            const persistedQuotes: typeof newQuotes = [];
            for (const q of newQuotes) {
              const saved = await api.createQuote({
                rfqId: q.rfqId,
                supplierId: q.supplierId,
                supplierPrice: q.supplierPrice,
                leadTime: q.leadTime,
                marginPercent: q.marginPercent,
                finalPrice: q.finalPrice,
                status: q.status
              }).catch(err => {
                logger.error('Failed to persist auto-quote:', err);
                return null;
              });
              if (saved) persistedQuotes.push(saved);
            }
            if (persistedQuotes.length > 0) {
              set(state => ({
                quotes: [...state.quotes, ...persistedQuotes]
              }));
            }
          } else {
            // Mock mode: add directly to state
            set(state => ({
              quotes: [...state.quotes, ...newQuotes]
            }));
          }
        }
      },

      loadSystemConfig: async () => {
        if (USE_SUPABASE) {
          const config = await api.getSystemConfig();
          if (config) {
            set({ systemConfig: config });
          }
        }
      },

      updateSystemConfig: (updates: Partial<SystemConfig>) => {
        set(state => {
          const newConfig = { ...state.systemConfig, ...updates };
          if (USE_SUPABASE) {
            api.updateSystemConfig(newConfig);
          }
          return { systemConfig: newConfig };
        });
      },

      loadMarginSettings: async () => {
        if (USE_SUPABASE) {
          const settings = await api.getMarginSettings();
          set({ marginSettings: settings });
        }
      },

      updateMarginSetting: async (category: string | null, marginPercent: number) => {
        if (USE_SUPABASE) {
          await api.updateMarginSetting(category, marginPercent);
          // Reload to sync state
          await get().loadMarginSettings();
        } else {
          // Mock implementation
          set(state => {
            const existingIndex = state.marginSettings.findIndex(m => m.category === category);
            const newSettings = [...state.marginSettings];
            if (existingIndex >= 0) {
              newSettings[existingIndex] = { ...newSettings[existingIndex], marginPercent };
            } else {
              newSettings.push({ category, marginPercent, isDefault: category === null });
            }
            return { marginSettings: newSettings };
          });
        }
      },
    }),
    {
      name: 'mwrd-storage',
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
        // Only persist mock data if not using Supabase
        ...(USE_SUPABASE ? {} : {
          users: state.users,
          products: state.products,
          rfqs: state.rfqs,
          quotes: state.quotes,
          orders: state.orders,
          creditLimitAdjustments: state.creditLimitAdjustments,
          systemConfig: state.systemConfig,
        }),
      }),
    }
  )
);
