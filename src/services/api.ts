// API Service Layer
// Connects to Supabase backend for all data operations

import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { appConfig } from '../config/appConfig';
import { User, Product, RFQ, RFQItem, Quote, UserRole, Order, CreditLimitAdjustment, CreditLimitAdjustmentType } from '../types/types';
import { logger } from '../utils/logger';
import { canTransitionOrderStatus } from './orderStatusService';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export class ApiService {
  private static instance: ApiService;

  private constructor() { }

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private applyPagination<T>(query: T, pagination?: PaginationOptions): T {
    const requestedPageSize = Number(pagination?.pageSize);
    if (!Number.isFinite(requestedPageSize) || requestedPageSize <= 0) {
      return query;
    }

    const pageSize = Math.min(Math.max(Math.floor(requestedPageSize), 1), 200);
    const page = Math.max(Math.floor(Number(pagination?.page) || 1), 1);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    return (query as any).range(from, to) as T;
  }

  private normalizeMarginPercent(margin: number): number | null {
    const numericMargin = Number(margin);
    if (!Number.isFinite(numericMargin) || numericMargin < 0 || numericMargin > 100) {
      return null;
    }

    return Math.round(numericMargin * 100) / 100;
  }

  // ============================================================================
  // USER OPERATIONS
  // ============================================================================

  async getUsers(pagination?: PaginationOptions): Promise<User[]> {
    let query = supabase
      .from('users')
      .select('*')
      .order('date_joined', { ascending: false });

    query = this.applyPagination(query, pagination);
    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching users:', error);
      return [];
    }

    return data.map(this.mapDbUserToUser);
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching user:', error);
      return null;
    }

    return this.mapDbUserToUser(data);
  }

  async getUsersByRole(role: UserRole, pagination?: PaginationOptions): Promise<User[]> {
    let query = supabase
      .from('users')
      .select('*')
      .eq('role', role)
      .order('date_joined', { ascending: false });
    query = this.applyPagination(query, pagination);
    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching users by role:', error);
      return [];
    }

    return data.map(this.mapDbUserToUser);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const dbUpdates: Record<string, any> = {};

    if (updates.name) dbUpdates.name = updates.name;
    if (updates.companyName) dbUpdates.company_name = updates.companyName;
    if (updates.verified !== undefined) dbUpdates.verified = updates.verified;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.kycStatus) dbUpdates.kyc_status = updates.kycStatus;
    if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
    if (updates.creditLimit !== undefined) dbUpdates.credit_limit = updates.creditLimit;
    if (updates.role) dbUpdates.role = updates.role;

    const { data, error } = await supabase
      .from('users')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating user:', error);
      return null;
    }

    return this.mapDbUserToUser(data);
  }

  async adjustClientCreditLimit(
    clientId: string,
    adjustmentType: CreditLimitAdjustmentType,
    adjustmentAmount: number,
    reason: string
  ): Promise<{ user: User | null; adjustment: CreditLimitAdjustment | null; error?: string }> {
    const normalizedAmount = Number(adjustmentAmount);
    const normalizedReason = reason.trim();

    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
      return { user: null, adjustment: null, error: 'Invalid credit amount' };
    }

    if (normalizedReason.length < 5) {
      return { user: null, adjustment: null, error: 'Reason must be at least 5 characters' };
    }

    const { data, error } = await supabase.rpc('admin_adjust_client_credit_limit', {
      p_target_client_id: clientId,
      p_adjustment_type: adjustmentType,
      p_adjustment_amount: Math.round(normalizedAmount * 100) / 100,
      p_adjustment_reason: normalizedReason
    });

    if (error) {
      logger.error('Error adjusting client credit limit:', error);
      return { user: null, adjustment: null, error: error.message };
    }

    const latestAdjustmentRow = Array.isArray(data) && data.length > 0 ? data[0] : null;
    const updatedUser = await this.getUserById(clientId);

    return {
      user: updatedUser,
      adjustment: latestAdjustmentRow ? this.mapDbCreditLimitAdjustment(latestAdjustmentRow) : null
    };
  }

  async setClientMargin(clientId: string, margin: number): Promise<{ success: boolean; error?: string }> {
    const normalizedMargin = this.normalizeMarginPercent(margin);
    if (normalizedMargin === null) {
      return { success: false, error: 'Margin must be between 0 and 100' };
    }

    const { error } = await supabase
      .from('users')
      .update({ client_margin: normalizedMargin })
      .eq('id', clientId);

    if (error) {
      logger.error('Error setting client margin:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  async setRFQMargin(rfqId: string, margin: number): Promise<{ success: boolean; error?: string }> {
    const normalizedMargin = this.normalizeMarginPercent(margin);
    if (normalizedMargin === null) {
      return { success: false, error: 'Margin must be between 0 and 100' };
    }

    // Update all quotes for this RFQ with the new margin
    // Note: This overrides manual margins.
    const { error } = await supabase
      .from('quotes')
      .update({ margin_percent: normalizedMargin })
      .eq('rfq_id', rfqId);

    if (error) {
      logger.error('Error setting RFQ margin:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  async getClientCreditLimitAdjustments(clientId: string, limit = 25): Promise<CreditLimitAdjustment[]> {
    const { data, error } = await supabase
      .from('credit_limit_adjustments')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching credit limit adjustments:', error);
      return [];
    }

    const adjustments = (data || []).map(this.mapDbCreditLimitAdjustment);

    const adminIds = Array.from(new Set(adjustments.map((item) => item.adminId)));
    if (adminIds.length === 0) {
      return adjustments;
    }

    const { data: admins, error: adminsError } = await supabase
      .from('users')
      .select('id, name, company_name, email')
      .in('id', adminIds);

    if (adminsError) {
      logger.error('Error fetching admin info for credit adjustments:', adminsError);
      return adjustments;
    }

    const adminNameById = new Map<string, string>();
    (admins || []).forEach((admin) => {
      adminNameById.set(admin.id, admin.company_name || admin.name || admin.email);
    });

    return adjustments.map((adjustment) => ({
      ...adjustment,
      adminName: adminNameById.get(adjustment.adminId)
    }));
  }

  async approveSupplier(id: string): Promise<User | null> {
    return this.updateUser(id, {
      status: 'APPROVED',
      kycStatus: 'VERIFIED',
      verified: true
    });
  }

  async rejectSupplier(id: string): Promise<User | null> {
    return this.updateUser(id, {
      status: 'REJECTED',
      kycStatus: 'REJECTED'
    });
  }

  async createUser(userData: any): Promise<User> {
    // We need to create a new user in Supabase Auth.
    // However, calling supabase.auth.signUp() with the main client would log out the current admin.
    // Solution: Create a temporary client just for this operation.

    if (!appConfig.supabase.url || !appConfig.supabase.anonKey) {
      const msg = 'Supabase URL or Anon Key is missing. Check your .env file or Vercel environment variables.';
      logger.error(msg);
      throw new Error(msg);
    }

    // Create temp client using top-level import
    const tempClient = createClient(appConfig.supabase.url, appConfig.supabase.anonKey, {
      auth: {
        persistSession: false, // Critical: Do not overwrite local storage
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const requestedRole = String(userData.role || UserRole.CLIENT).toUpperCase();
    let role: UserRole = UserRole.CLIENT;
    if (
      requestedRole === UserRole.ADMIN ||
      requestedRole === UserRole.SUPPLIER ||
      requestedRole === UserRole.GUEST
    ) {
      role = requestedRole as UserRole;
    }

    const allowedUserStatuses = new Set([
      'ACTIVE',
      'PENDING',
      'APPROVED',
      'REJECTED',
      'REQUIRES_ATTENTION',
      'DEACTIVATED'
    ]);
    const allowedKycStatuses = new Set(['VERIFIED', 'IN_REVIEW', 'REJECTED', 'INCOMPLETE']);

    const { data: authData, error: authError } = await tempClient.auth.signUp({
      email: userData.email,
      password: userData.password,
      options: {
        data: {
          name: userData.name,
          companyName: userData.companyName,
          phone: userData.phone
        }
      }
    });

    if (authError) {
      logger.error('Error creating auth user:', authError);
      throw new Error(`Auth Error: ${authError.message}`);
    }

    if (!authData.user) {
      logger.error('No user returned from signUp');
      throw new Error('User creation failed: No user returned from Supabase.');
    }

    const parsedCreditLimit = Number(userData.creditLimit);
    const hasCreditLimit = role === 'CLIENT' && Number.isFinite(parsedCreditLimit) && parsedCreditLimit >= 0;
    const normalizedCreditLimit = hasCreditLimit
      ? Math.round(parsedCreditLimit * 100) / 100
      : null;

    const requestedStatus = String(userData.status || '').toUpperCase();
    const status = (allowedUserStatuses.has(requestedStatus)
      ? requestedStatus
      : (role === 'SUPPLIER' ? 'PENDING' : 'ACTIVE')) as User['status'];

    const requestedKycStatus = String(userData.kycStatus || '').toUpperCase();
    const kycStatus = (allowedKycStatuses.has(requestedKycStatus)
      ? requestedKycStatus
      : (role === 'SUPPLIER' ? 'INCOMPLETE' : 'VERIFIED')) as User['kycStatus'];

    const verified = userData.verified !== undefined
      ? Boolean(userData.verified)
      : role !== 'SUPPLIER';

    const needsSensitiveUpdate =
      role !== 'CLIENT' ||
      hasCreditLimit ||
      userData.status !== undefined ||
      userData.kycStatus !== undefined ||
      userData.verified !== undefined;

    if (needsSensitiveUpdate) {
      const { error: sensitiveUpdateError } = await supabase.rpc('admin_update_user_sensitive_fields', {
        target_user_id: authData.user.id,
        new_role: role,
        new_verified: verified,
        new_status: status ?? null,
        new_kyc_status: kycStatus ?? null,
        new_credit_limit: normalizedCreditLimit
      });

      if (sensitiveUpdateError) {
        logger.error('Error applying admin-sensitive fields for new user:', sensitiveUpdateError);
        throw new Error(`Failed to finalize user role/profile: ${sensitiveUpdateError.message}`);
      }
    }

    // Poll for user creation/profile sync completion.
    let createdUser: User | null = null;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 200)); // wait 200ms
      const user = await this.getUserById(authData.user.id);
      if (user) {
        createdUser = user;
        break;
      }
    }

    if (createdUser) {
      return createdUser;
    }

    logger.error('User created in Auth but profile not available in public.users after sync retries.');
    throw new Error('User created in authentication, but profile sync is still pending. Please retry in a few seconds.');
  }

  // ============================================================================
  // PRODUCT OPERATIONS
  // ============================================================================

  async getProducts(
    filters?: { status?: Product['status']; category?: string; supplierId?: string },
    pagination?: PaginationOptions
  ): Promise<Product[]> {
    let query = supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.supplierId) {
      query = query.eq('supplier_id', filters.supplierId);
    }

    query = this.applyPagination(query, pagination);

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching products:', error);
      return [];
    }

    return data.map(this.mapDbProductToProduct);
  }

  async getProductById(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching product:', error);
      return null;
    }

    return this.mapDbProductToProduct(data);
  }

  async createProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .insert({
        supplier_id: product.supplierId,
        name: product.name,
        description: product.description,
        category: product.category,
        subcategory: product.subcategory,
        image: product.image,
        status: product.status || 'PENDING',
        cost_price: product.supplierPrice,
        sku: product.sku
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating product:', error);
      return null;
    }

    return this.mapDbProductToProduct(data);
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
    const dbUpdates: Record<string, any> = {};

    if (updates.name) dbUpdates.name = updates.name;
    if (updates.description) dbUpdates.description = updates.description;
    if (updates.category) dbUpdates.category = updates.category;
    if (updates.subcategory) dbUpdates.subcategory = updates.subcategory;
    if (updates.image) dbUpdates.image = updates.image;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.supplierPrice !== undefined) dbUpdates.cost_price = updates.supplierPrice;
    if (updates.sku) dbUpdates.sku = updates.sku;

    const { data, error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating product:', error);
      return null;
    }

    return this.mapDbProductToProduct(data);
  }

  async deleteProduct(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting product:', error);
      return false;
    }

    return true;
  }

  async approveProduct(id: string): Promise<Product | null> {
    return this.updateProduct(id, { status: 'APPROVED' });
  }

  async rejectProduct(id: string): Promise<Product | null> {
    return this.updateProduct(id, { status: 'REJECTED' });
  }

  // ============================================================================
  // RFQ OPERATIONS
  // ============================================================================

  async getRFQs(
    filters?: { clientId?: string; status?: RFQ['status'] },
    pagination?: PaginationOptions
  ): Promise<RFQ[]> {
    let query = supabase
      .from('rfqs')
      .select(`
        *,
        rfq_items (
          id,
          product_id,
          quantity,
          notes
        )
      `)
      .order('date', { ascending: false });

    if (filters?.clientId) {
      query = query.eq('client_id', filters.clientId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    query = this.applyPagination(query, pagination);

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching RFQs:', error);
      return [];
    }

    return data.map(this.mapDbRfqToRfq);
  }

  async getRFQById(id: string): Promise<RFQ | null> {
    const { data, error } = await supabase
      .from('rfqs')
      .select(`
        *,
        rfq_items (
          id,
          product_id,
          quantity,
          notes
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching RFQ:', error);
      return null;
    }

    return this.mapDbRfqToRfq(data);
  }

  async createRFQ(rfq: Omit<RFQ, 'id'>): Promise<RFQ | null> {
    const normalizedDate = rfq.date || new Date().toISOString().split('T')[0];
    const itemsPayload = (rfq.items || []).map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      notes: item.notes || null
    }));

    const { data: rfqData, error: rfqError } = await supabase.rpc('create_rfq_with_items', {
      p_client_id: rfq.clientId,
      p_items: itemsPayload,
      p_status: rfq.status || 'OPEN',
      p_date: normalizedDate
    });

    if (rfqError) {
      logger.error('Error creating RFQ atomically:', rfqError);
      return null;
    }

    if (!rfqData?.id) {
      return null;
    }

    // Fetch complete RFQ with items
    return this.getRFQById(rfqData.id);
  }

  async updateRFQ(id: string, updates: Partial<RFQ>): Promise<RFQ | null> {
    const dbUpdates: Record<string, any> = {};

    if (updates.status) dbUpdates.status = updates.status;
    if (updates.date) dbUpdates.date = updates.date;
    if (updates.autoQuoteTriggered !== undefined) dbUpdates.auto_quote_triggered = updates.autoQuoteTriggered;

    const { error } = await supabase
      .from('rfqs')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      logger.error('Error updating RFQ:', error);
      return null;
    }

    return this.getRFQById(id);
  }

  // ============================================================================
  // QUOTE OPERATIONS
  // ============================================================================

  async getQuotes(
    filters?: { rfqId?: string; supplierId?: string; status?: Quote['status'] },
    pagination?: PaginationOptions
  ): Promise<Quote[]> {
    let query = supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.rfqId) {
      query = query.eq('rfq_id', filters.rfqId);
    }
    if (filters?.supplierId) {
      query = query.eq('supplier_id', filters.supplierId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    query = this.applyPagination(query, pagination);

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching quotes:', error);
      return [];
    }

    return data.map(this.mapDbQuoteToQuote);
  }

  // New: Get quotes with related data for comparison
  async getQuotesWithDetails(rfqId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('quotes')
      .select(`
        *,
        supplier:users!supplier_id(id, companyName, name),
        product:products!product_id(id, name, brand, imageUrl)
      `)
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching quotes with details:', error);
      return [];
    }

    return data || [];
  }


  async getQuoteById(id: string): Promise<Quote | null> {
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching quote:', error);
      return null;
    }

    return this.mapDbQuoteToQuote(data);
  }

  async createQuote(quote: Omit<Quote, 'id'>): Promise<Quote | null> {
    const { data, error } = await supabase
      .from('quotes')
      .insert({
        rfq_id: quote.rfqId,
        supplier_id: quote.supplierId,
        supplier_price: quote.supplierPrice,
        lead_time: quote.leadTime,
        margin_percent: quote.marginPercent || 0,
        status: quote.status || 'PENDING_ADMIN'
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating quote:', error);
      return null;
    }

    return this.mapDbQuoteToQuote(data);
  }

  async updateQuote(id: string, updates: Partial<Quote>): Promise<Quote | null> {
    const dbUpdates: Record<string, any> = {};

    if (updates.supplierPrice !== undefined) dbUpdates.supplier_price = updates.supplierPrice;
    if (updates.leadTime) dbUpdates.lead_time = updates.leadTime;
    if (updates.marginPercent !== undefined) dbUpdates.margin_percent = updates.marginPercent;
    if (updates.status) dbUpdates.status = updates.status;

    const { data, error } = await supabase
      .from('quotes')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating quote:', error);
      return null;
    }

    return this.mapDbQuoteToQuote(data);
  }

  async approveQuote(id: string, marginPercent: number): Promise<Quote | null> {
    return this.updateQuote(id, {
      marginPercent,
      status: 'SENT_TO_CLIENT'
    });
  }

  async acceptQuote(id: string): Promise<{ quote: Quote | null; order: Order | null }> {
    // Use Postgres function to atomically accept quote, deduct credit, and create order
    const { data: orderData, error } = await supabase.rpc('accept_quote_and_deduct_credit', { p_quote_id: id });

    if (error) {
      logger.error('Error accepting quote:', error);
      // Throw error to let UI handle "Insufficient credit" message
      throw error;
    }

    // Fetch the updated quote to return consistent data
    const quote = await this.getQuoteById(id);

    return {
      quote,
      order: orderData ? this.mapDbOrderToOrder(orderData) : null
    };
  }

  async rejectQuote(id: string): Promise<Quote | null> {
    return this.updateQuote(id, { status: 'REJECTED' });
  }

  // ============================================================================
  // ORDER OPERATIONS
  // ============================================================================

  async getOrders(
    filters?: { clientId?: string; supplierId?: string; status?: Order['status'] },
    pagination?: PaginationOptions
  ): Promise<Order[]> {
    let query = supabase
      .from('orders')
      .select('*')
      .order('date', { ascending: false });

    if (filters?.clientId) {
      query = query.eq('client_id', filters.clientId);
    }
    if (filters?.supplierId) {
      query = query.eq('supplier_id', filters.supplierId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    query = this.applyPagination(query, pagination);

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching orders:', error);
      return [];
    }

    return data.map(this.mapDbOrderToOrder);
  }

  async getOrderById(id: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching order:', error);
      return null;
    }

    return this.mapDbOrderToOrder(data);
  }

  async createOrder(order: Omit<Order, 'id'> & { quoteId?: string; clientId: string; supplierId: string }): Promise<Order | null> {
    const { data, error } = await supabase
      .from('orders')
      .insert({
        quote_id: order.quoteId,
        client_id: order.clientId,
        supplier_id: order.supplierId,
        amount: order.amount,
        status: order.status || 'PENDING_PAYMENT',
        date: order.date || new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating order:', error);
      return null;
    }

    return this.mapDbOrderToOrder(data);
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | null> {
    const dbUpdates: Record<string, any> = {};
    let currentOrder: Order | null = null;

    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.status) {
      currentOrder = await this.getOrderById(id);
      if (!currentOrder) {
        logger.error(`Cannot update order ${id}: order not found`);
        return null;
      }

      if (!canTransitionOrderStatus(currentOrder.status, updates.status)) {
        logger.error(`Invalid order status transition: ${currentOrder.status} -> ${updates.status}`);
        return null;
      }

      dbUpdates.status = updates.status;
    }
    if (updates.date) dbUpdates.date = updates.date;
    if (updates.paymentLinkUrl !== undefined) dbUpdates.payment_link_url = updates.paymentLinkUrl;
    if (updates.paymentLinkSentAt !== undefined) dbUpdates.payment_link_sent_at = updates.paymentLinkSentAt;

    let query = supabase
      .from('orders')
      .update(dbUpdates)
      .eq('id', id);

    // Prevent stale writes when changing status by requiring the expected current status.
    if (updates.status && currentOrder) {
      query = query.eq('status', currentOrder.status);
    }

    const { data, error } = await query
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error updating order:', error);
      return null;
    }
    if (!data) {
      logger.error(`Order update for ${id} did not apply (record not found or status changed concurrently)`);
      return null;
    }

    return this.mapDbOrderToOrder(data);
  }

  // ============================================================================
  // MARGIN SETTINGS OPERATIONS
  // ============================================================================

  async getMarginSettings(): Promise<{ category: string | null; marginPercent: number; isDefault: boolean }[]> {
    const { data, error } = await supabase
      .from('margin_settings')
      .select('*')
      .order('is_default', { ascending: false });

    if (error) {
      logger.error('Error fetching margin settings:', error);
      return [];
    }

    return data.map(m => ({
      category: m.category,
      marginPercent: m.margin_percent,
      isDefault: m.is_default
    }));
  }

  async updateMarginSetting(category: string | null, marginPercent: number): Promise<boolean> {
    const normalizedMargin = this.normalizeMarginPercent(marginPercent);
    if (normalizedMargin === null) {
      logger.error('Error updating margin setting: margin must be between 0 and 100');
      return false;
    }

    const { error } = await supabase
      .from('margin_settings')
      .upsert({
        category,
        margin_percent: normalizedMargin,
        is_default: category === null
      });

    if (error) {
      logger.error('Error updating margin setting:', error);
      return false;
    }

    return true;
  }

  // ============================================================================
  // SYSTEM CONFIG OPERATIONS
  // ============================================================================

  async getSystemConfig(): Promise<{ autoQuoteDelayMinutes: number; defaultMarginPercent: number } | null> {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Error fetching system settings:', error);
      return null;
    }

    return {
      autoQuoteDelayMinutes: data.auto_quote_delay_minutes,
      defaultMarginPercent: data.default_margin_percent
    };
  }

  async updateSystemConfig(config: { autoQuoteDelayMinutes: number; defaultMarginPercent: number }): Promise<boolean> {
    const normalizedMargin = this.normalizeMarginPercent(config.defaultMarginPercent);
    if (normalizedMargin === null) {
      logger.error('Error updating system settings: default margin must be between 0 and 100');
      return false;
    }

    const normalizedDelay = Math.max(1, Math.floor(Number(config.autoQuoteDelayMinutes) || 0));

    const { error } = await supabase
      .from('system_settings')
      .upsert({
        id: 1,
        auto_quote_delay_minutes: normalizedDelay,
        default_margin_percent: normalizedMargin,
        updated_at: new Date().toISOString()
      });

    if (error) {
      logger.error('Error updating system settings:', error);
      return false;
    }

    return true;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private mapDbCreditLimitAdjustment(dbAdjustment: any): CreditLimitAdjustment {
    return {
      id: dbAdjustment.id,
      clientId: dbAdjustment.client_id,
      adminId: dbAdjustment.admin_id,
      adjustmentType: dbAdjustment.adjustment_type,
      adjustmentAmount: Number(dbAdjustment.adjustment_amount || 0),
      changeAmount: Number(dbAdjustment.change_amount || 0),
      previousLimit: Number(dbAdjustment.previous_limit || 0),
      newLimit: Number(dbAdjustment.new_limit || 0),
      reason: dbAdjustment.reason || '',
      createdAt: dbAdjustment.created_at
    };
  }

  private mapDbUserToUser(dbUser: any): User {
    const derivedCreditUsed = typeof dbUser.current_balance === 'number'
      ? Math.max(0, -dbUser.current_balance)
      : undefined;
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as UserRole,
      companyName: dbUser.company_name,
      verified: dbUser.verified,
      publicId: dbUser.public_id,
      rating: dbUser.rating,
      status: dbUser.status,
      kycStatus: dbUser.kyc_status,
      dateJoined: dbUser.date_joined,
      creditLimit: dbUser.credit_limit ?? undefined,
      clientMargin: dbUser.client_margin ?? undefined,
      creditUsed: dbUser.credit_used ?? derivedCreditUsed
    };
  }

  private mapDbProductToProduct(dbProduct: any): Product {
    return {
      id: dbProduct.id,
      supplierId: dbProduct.supplier_id,
      name: dbProduct.name,
      description: dbProduct.description,
      category: dbProduct.category,
      subcategory: dbProduct.subcategory,
      image: dbProduct.image,
      status: dbProduct.status,
      supplierPrice: dbProduct.cost_price,
      sku: dbProduct.sku
    };
  }

  private mapDbRfqToRfq(dbRfq: any): RFQ {
    return {
      id: dbRfq.id,
      clientId: dbRfq.client_id,
      items: (dbRfq.rfq_items || []).map((item: any) => ({
        productId: item.product_id,
        quantity: item.quantity,
        notes: item.notes || ''
      })),
      status: dbRfq.status,
      date: dbRfq.date,
      createdAt: dbRfq.created_at || dbRfq.date,
      autoQuoteTriggered: dbRfq.auto_quote_triggered ?? false,
      validUntil: dbRfq.valid_until
    };
  }

  private mapDbQuoteToQuote(dbQuote: any): Quote {
    return {
      id: dbQuote.id,
      rfqId: dbQuote.rfq_id,
      supplierId: dbQuote.supplier_id,
      supplierPrice: dbQuote.supplier_price,
      leadTime: dbQuote.lead_time,
      marginPercent: dbQuote.margin_percent,
      finalPrice: dbQuote.final_price,
      status: dbQuote.status
    };
  }

  private mapDbOrderToOrder(dbOrder: any): Order {
    const rawStatus = String(dbOrder.status || '');
    const normalizedStatus = (
      rawStatus === 'In Transit'
        ? 'IN_TRANSIT'
        : rawStatus === 'Delivered'
          ? 'DELIVERED'
          : rawStatus === 'Cancelled'
            ? 'CANCELLED'
            : rawStatus || 'PENDING_PAYMENT'
    ) as Order['status'];

    return {
      id: dbOrder.id,
      quoteId: dbOrder.quote_id || undefined,
      system_po_number: dbOrder.system_po_number || undefined,
      clientId: dbOrder.client_id,
      supplierId: dbOrder.supplier_id,
      amount: dbOrder.amount,
      status: normalizedStatus,
      date: dbOrder.date,
      paymentLinkUrl: dbOrder.payment_link_url || undefined,
      paymentLinkSentAt: dbOrder.payment_link_sent_at || undefined,
      // Map shipment details
      shipment: dbOrder.shipment_details || undefined,
      createdAt: dbOrder.created_at || undefined,
      updatedAt: dbOrder.updated_at || undefined
    };
  }
}

export const api = ApiService.getInstance();
