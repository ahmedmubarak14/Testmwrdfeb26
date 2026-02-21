// API Service Layer
// Connects to Supabase backend for all data operations

import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { appConfig } from '../config/appConfig';
import { User, Product, RFQ, RFQItem, Quote, QuoteItem, UserRole, Order, OrderStatus, CreditLimitAdjustment, CreditLimitAdjustmentType, SupplierFinancials } from '../types/types';
import type { OrderStatus as DbOrderStatus } from '../types/database';
import { logger } from '../utils/logger';
import { canTransitionOrderStatus } from './orderStatusService';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export class ApiService {
  private static instance: ApiService;
  private static readonly MISSING_ORDER_COLUMN_REGEX = /column "([^"]+)" of relation "orders" does not exist/i;
  private static readonly MISSING_USER_COLUMN_REGEX = /column "([^"]+)" of relation "users" does not exist/i;
  private static readonly MISSING_PRODUCT_COLUMN_REGEX = /column "([^"]+)" of relation "products" does not exist/i;
  private static readonly MISSING_RFQ_COLUMN_REGEX = /column "([^"]+)" of relation "rfqs" does not exist/i;
  private static readonly MISSING_RFQ_ITEM_COLUMN_REGEX = /column "([^"]+)" of relation "rfq_items" does not exist/i;
  private static readonly MISSING_QUOTE_COLUMN_REGEX = /column "([^"]+)" of relation "quotes" does not exist/i;
  private static readonly MISSING_MARGIN_COLUMN_REGEX = /column "([^"]+)" of relation "margin_settings" does not exist/i;
  private static readonly MISSING_SYSTEM_SETTINGS_COLUMN_REGEX = /column "([^"]+)" of relation "system_settings" does not exist/i;
  private static readonly SUPPLIER_PROFILE_MARKER = '[SUPPLIER_PROFILE_JSON]';
  private static readonly SYSTEM_CONFIG_FALLBACK_KEY = 'mwrd-system-config-fallback';

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

  private readSystemConfigFallback(): Partial<{
    autoQuoteDelayMinutes: number;
    defaultMarginPercent: number;
    autoQuoteEnabled?: boolean;
    autoQuoteIncludeLimitedStock?: boolean;
    autoQuoteLeadTimeDays?: number;
    rfqDefaultExpiryDays?: number;
  }> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(ApiService.SYSTEM_CONFIG_FALLBACK_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        autoQuoteDelayMinutes: Number(parsed.autoQuoteDelayMinutes),
        defaultMarginPercent: Number(parsed.defaultMarginPercent),
        autoQuoteEnabled: typeof parsed.autoQuoteEnabled === 'boolean' ? parsed.autoQuoteEnabled : undefined,
        autoQuoteIncludeLimitedStock: typeof parsed.autoQuoteIncludeLimitedStock === 'boolean' ? parsed.autoQuoteIncludeLimitedStock : undefined,
        autoQuoteLeadTimeDays: Number(parsed.autoQuoteLeadTimeDays),
        rfqDefaultExpiryDays: Number(parsed.rfqDefaultExpiryDays),
      };
    } catch {
      return {};
    }
  }

  private persistSystemConfigFallback(config: {
    autoQuoteDelayMinutes: number;
    defaultMarginPercent: number;
    autoQuoteEnabled?: boolean;
    autoQuoteIncludeLimitedStock?: boolean;
    autoQuoteLeadTimeDays?: number;
    rfqDefaultExpiryDays?: number;
  }): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ApiService.SYSTEM_CONFIG_FALLBACK_KEY,
        JSON.stringify(config)
      );
    } catch {
      // Ignore storage failures in restricted browser contexts.
    }
  }

  private normalizeDbRole(rawRole: unknown): UserRole {
    const normalized = String(rawRole || '').trim().toUpperCase();
    if (normalized === 'VENDOR') {
      return UserRole.SUPPLIER;
    }

    if (
      normalized === UserRole.ADMIN
      || normalized === UserRole.SUPPLIER
      || normalized === UserRole.CLIENT
      || normalized === UserRole.GUEST
    ) {
      return normalized as UserRole;
    }

    return UserRole.CLIENT;
  }

  private async getCurrentActorIdentity(): Promise<{ id: string; role: UserRole } | null> {
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser?.id) {
      return null;
    }

    const { data: actorRow, error: actorError } = await (supabase as any)
      .from('users')
      .select('id, role')
      .eq('id', authUser.id)
      .maybeSingle();

    if (actorError || !actorRow) {
      logger.warn('Unable to resolve current actor identity', {
        userId: authUser.id,
        error: actorError?.message,
      });
      return null;
    }

    return {
      id: actorRow.id,
      role: this.normalizeDbRole(actorRow.role),
    };
  }

  private async assertAdminActor(context: string): Promise<{ id: string; role: UserRole }> {
    const actor = await this.getCurrentActorIdentity();
    if (!actor) {
      throw new Error(`Unauthorized: unable to verify admin permissions for ${context}`);
    }
    if (actor.role !== UserRole.ADMIN) {
      throw new Error(`Admin permissions required for ${context}`);
    }
    return actor;
  }

  private pruneMissingOrderUpdateColumn(
    payload: Record<string, any>,
    error: { message?: string }
  ): Record<string, any> | null {
    const match = ApiService.MISSING_ORDER_COLUMN_REGEX.exec(error?.message || '');
    if (!match) return null;
    const columnName = match[1];
    if (!Object.prototype.hasOwnProperty.call(payload, columnName)) return null;
    const next = { ...payload };
    delete next[columnName];
    return next;
  }

  private pruneMissingUserUpdateColumn(
    payload: Record<string, any>,
    error: { message?: string }
  ): Record<string, any> | null {
    const match = ApiService.MISSING_USER_COLUMN_REGEX.exec(error?.message || '');
    if (!match) return null;
    const columnName = match[1];
    if (!Object.prototype.hasOwnProperty.call(payload, columnName)) return null;
    const next = { ...payload };
    delete next[columnName];
    return next;
  }

  private pruneMissingRelationColumn(
    payload: Record<string, any>,
    error: { message?: string },
    regex: RegExp
  ): Record<string, any> | null {
    const match = regex.exec(error?.message || '');
    if (!match) return null;
    const columnName = match[1];
    if (!Object.prototype.hasOwnProperty.call(payload, columnName)) return null;
    const next = { ...payload };
    delete next[columnName];
    return next;
  }

  private isMissingRelationError(
    error: { code?: string; message?: string } | null | undefined,
    relation: string
  ): boolean {
    if (!error) return false;
    if (error.code === '42P01') return true;
    const message = String(error.message || '');
    return (
      new RegExp(`relation ["']?${relation}["']? does not exist`, 'i').test(message)
      || /relation .* does not exist/i.test(message)
    );
  }

  private isPermissionDeniedError(
    error: { code?: string; message?: string } | null | undefined
  ): boolean {
    if (!error) return false;
    if (error.code === '42501') return true;
    const message = String(error.message || '');
    return (
      /permission denied/i.test(message)
      || /row-level security/i.test(message)
      || /violates row-level security policy/i.test(message)
    );
  }

  private async refreshSessionForRlsRetry(context: string): Promise<void> {
    try {
      const { data } = await supabase.auth.getSession();
      const refreshToken = data.session?.refresh_token;
      if (!refreshToken) return;

      const { error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error) {
        logger.warn('Session refresh before RLS retry failed', { context, error: error.message });
      }
    } catch (error) {
      logger.warn('Session refresh before RLS retry threw runtime error', {
        context,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private parseSupplierProfileFromLeadNotes(
    rawNotes: unknown
  ): Partial<Pick<User, 'paymentSettings' | 'kycDocuments'>> | null {
    if (typeof rawNotes !== 'string' || rawNotes.trim().length === 0) return null;
    const markerIndex = rawNotes.lastIndexOf(ApiService.SUPPLIER_PROFILE_MARKER);
    const rawPayload = markerIndex >= 0
      ? rawNotes.slice(markerIndex + ApiService.SUPPLIER_PROFILE_MARKER.length).trim()
      : rawNotes.trim();

    try {
      const parsed = JSON.parse(rawPayload);
      const source = parsed?.supplierProfile && typeof parsed.supplierProfile === 'object'
        ? parsed.supplierProfile
        : parsed;
      if (!source || typeof source !== 'object') return null;

      const result: Partial<Pick<User, 'paymentSettings' | 'kycDocuments'>> = {};
      const paymentSettings = (source as any).paymentSettings;
      if (paymentSettings && typeof paymentSettings === 'object') {
        result.paymentSettings = {
          bankName: typeof paymentSettings.bankName === 'string' ? paymentSettings.bankName : undefined,
          accountHolder: typeof paymentSettings.accountHolder === 'string' ? paymentSettings.accountHolder : undefined,
          iban: typeof paymentSettings.iban === 'string' ? paymentSettings.iban : undefined,
          swiftCode: typeof paymentSettings.swiftCode === 'string' ? paymentSettings.swiftCode : undefined,
        };
      }

      const kycDocuments = (source as any).kycDocuments;
      if (kycDocuments && typeof kycDocuments === 'object' && !Array.isArray(kycDocuments)) {
        result.kycDocuments = Object.entries(kycDocuments).reduce<Record<string, string>>((acc, [key, value]) => {
          if (typeof value === 'string' && value.trim().length > 0) {
            acc[key] = value;
          }
          return acc;
        }, {});
      }

      return Object.keys(result).length > 0 ? result : null;
    } catch {
      return null;
    }
  }

  private composeSupplierProfileLeadNotes(
    existingNotes: string | null | undefined,
    profile: Partial<Pick<User, 'paymentSettings' | 'kycDocuments'>>
  ): string {
    const rawText = typeof existingNotes === 'string' ? existingNotes : '';
    const markerIndex = rawText.lastIndexOf(ApiService.SUPPLIER_PROFILE_MARKER);
    const preservedNotes = (markerIndex >= 0 ? rawText.slice(0, markerIndex) : rawText).trim();
    const payload = JSON.stringify({
      supplierProfile: profile,
      updatedAt: new Date().toISOString(),
    });
    return preservedNotes.length > 0
      ? `${preservedNotes}\n\n${ApiService.SUPPLIER_PROFILE_MARKER}\n${payload}`
      : `${ApiService.SUPPLIER_PROFILE_MARKER}\n${payload}`;
  }

  private async getSupplierProfileFallbackMap(
    userIds: string[]
  ): Promise<Map<string, Partial<Pick<User, 'paymentSettings' | 'kycDocuments'>>>> {
    const map = new Map<string, Partial<Pick<User, 'paymentSettings' | 'kycDocuments'>>>();
    if (userIds.length === 0) return map;

    const { data, error } = await (supabase as any)
      .from('leads')
      .select('converted_user_id, notes, created_at')
      .in('converted_user_id', userIds)
      .eq('account_type', 'supplier')
      .order('created_at', { ascending: false });

    if (error) {
      const message = error.message || '';
      const isExpectedRlsError = error.code === '42501'
        || /permission denied/i.test(message)
        || /row-level security/i.test(message)
        || /relation .* does not exist/i.test(message);
      if (!isExpectedRlsError) {
        logger.warn('Supplier profile fallback lookup unavailable', { error: message });
      }
      return map;
    }

    (data || []).forEach((row: any) => {
      const userId = String(row.converted_user_id || '').trim();
      if (!userId || map.has(userId)) return;
      const parsed = this.parseSupplierProfileFromLeadNotes(row.notes);
      if (!parsed) return;
      map.set(userId, parsed);
    });

    return map;
  }

  private async enrichUsersWithSupplierProfile(users: User[]): Promise<User[]> {
    const supplierIds = users
      .filter((user) => user.role === UserRole.SUPPLIER)
      .map((user) => user.id);
    if (supplierIds.length === 0) return users;

    const fallbackByUserId = await this.getSupplierProfileFallbackMap(supplierIds);
    if (fallbackByUserId.size === 0) return users;

    return users.map((user) => {
      const fallback = fallbackByUserId.get(user.id);
      if (!fallback) return user;
      return {
        ...user,
        paymentSettings: user.paymentSettings || fallback.paymentSettings,
        kycDocuments: user.kycDocuments || fallback.kycDocuments,
      };
    });
  }

  private async persistSupplierProfileFallback(
    userId: string,
    profile: Partial<Pick<User, 'paymentSettings' | 'kycDocuments'>>
  ): Promise<boolean> {
    if (!profile.paymentSettings && !profile.kycDocuments) return true;

    const { data: authData } = await supabase.auth.getUser();
    let metadataSaved = false;

    if (authData.user?.id === userId) {
      const metadataPatch: Record<string, unknown> = {};
      if (profile.paymentSettings) metadataPatch.payment_settings = profile.paymentSettings;
      if (profile.kycDocuments) metadataPatch.kyc_documents = profile.kycDocuments;
      if (Object.keys(metadataPatch).length > 0) {
        const { error: metadataError } = await supabase.auth.updateUser({ data: metadataPatch });
        if (metadataError) {
          logger.warn('Unable to store supplier profile in auth metadata', { error: metadataError.message });
        } else {
          metadataSaved = true;
        }
      }
    }

    const { data: userRows, error: userLookupError } = await (supabase as any)
      .from('users')
      .select('id, name, company_name, email')
      .eq('id', userId)
      .limit(1);
    if (userLookupError || !Array.isArray(userRows) || userRows.length === 0) {
      logger.warn('Unable to resolve supplier for fallback profile persistence', {
        userId,
        error: userLookupError?.message,
      });
      return metadataSaved;
    }
    const userRow = userRows[0];

    const { data: leadRows, error: leadLookupError } = await (supabase as any)
      .from('leads')
      .select('id, notes')
      .eq('converted_user_id', userId)
      .eq('account_type', 'supplier')
      .order('created_at', { ascending: false })
      .limit(1);

    let existingNotes: string | null = null;
    let existingLeadId: string | null = null;
    let existingProfile: Partial<Pick<User, 'paymentSettings' | 'kycDocuments'>> = {};

    if (!leadLookupError && Array.isArray(leadRows) && leadRows.length > 0) {
      existingLeadId = leadRows[0].id;
      existingNotes = leadRows[0].notes || null;
      existingProfile = this.parseSupplierProfileFromLeadNotes(existingNotes) || {};
    }

    const mergedProfile: Partial<Pick<User, 'paymentSettings' | 'kycDocuments'>> = {
      paymentSettings: profile.paymentSettings ?? existingProfile.paymentSettings,
      kycDocuments: profile.kycDocuments ?? existingProfile.kycDocuments,
    };

    const serializedNotes = this.composeSupplierProfileLeadNotes(existingNotes, mergedProfile);
    const timestamp = new Date().toISOString();

    if (existingLeadId) {
      const { error: updateLeadError } = await (supabase as any)
        .from('leads')
        .update({
          notes: serializedNotes,
          updated_at: timestamp,
        })
        .eq('id', existingLeadId);

      if (!updateLeadError) return true;
      logger.warn('Unable to update supplier fallback lead row; creating append row', {
        userId,
        error: updateLeadError.message,
      });
    }

    const { error: insertLeadError } = await (supabase as any)
      .from('leads')
      .insert({
        name: userRow.name || userRow.company_name || 'Supplier',
        company_name: userRow.company_name || userRow.name || 'Supplier',
        email: userRow.email || 'unknown@mwrd.local',
        account_type: 'supplier',
        notes: serializedNotes,
        converted_user_id: userId,
        status: 'PENDING',
      });

    if (insertLeadError) {
      logger.error('Unable to persist supplier profile fallback in leads', {
        userId,
        error: insertLeadError.message,
      });
      return metadataSaved;
    }

    return true;
  }

  // ============================================================================
  // USER OPERATIONS
  // ============================================================================

  async getUsers(pagination?: PaginationOptions): Promise<User[]> {
    const buildUsersQuery = (orderColumn: 'date_joined' | 'created_at') => this.applyPagination(
      supabase
        .from('users')
        .select('*')
        .order(orderColumn, { ascending: false }),
      pagination
    );

    let { data, error } = await buildUsersQuery('date_joined');

    if (error && this.isPermissionDeniedError(error)) {
      await this.refreshSessionForRlsRetry('getUsers');
      const retryResult = await buildUsersQuery('date_joined');
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error && /column "date_joined" of relation "users" does not exist/i.test(error.message || '')) {
      const fallbackResult = await buildUsersQuery('created_at');
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      logger.error('Error fetching users:', error);
      throw new Error(`Failed to fetch users: ${error.message || 'Unknown error'}`);
    }

    const mappedUsers = data.map((row: any) => this.mapDbUserToUser(row));
    return this.enrichUsersWithSupplierProfile(mappedUsers);
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching user:', error);
      throw new Error(`Failed to fetch user: ${error.message || 'Unknown error'}`);
    }

    const mappedUser = this.mapDbUserToUser(data);
    const enrichedUsers = await this.enrichUsersWithSupplierProfile([mappedUser]);
    return enrichedUsers[0] || mappedUser;
  }

  async getUsersByRole(role: UserRole, pagination?: PaginationOptions): Promise<User[]> {
    const buildUsersByRoleQuery = (orderColumn: 'date_joined' | 'created_at') => this.applyPagination(
      supabase
        .from('users')
        .select('*')
        .eq('role', role)
        .order(orderColumn, { ascending: false }),
      pagination
    );

    let { data, error } = await buildUsersByRoleQuery('date_joined');

    if (error && this.isPermissionDeniedError(error)) {
      await this.refreshSessionForRlsRetry('getUsersByRole');
      const retryResult = await buildUsersByRoleQuery('date_joined');
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error && /column "date_joined" of relation "users" does not exist/i.test(error.message || '')) {
      const fallbackResult = await buildUsersByRoleQuery('created_at');
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      logger.error('Error fetching users by role:', error);
      throw new Error(`Failed to fetch users by role: ${error.message || 'Unknown error'}`);
    }

    const mappedUsers = data.map((row: any) => this.mapDbUserToUser(row));
    return this.enrichUsersWithSupplierProfile(mappedUsers);
  }

  async uploadKYCDocument(userId: string, file: File): Promise<string | null> {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .upload(fileName, file);

      if (error) {
        logger.error('Error uploading KYC document:', error);
        return null;
      }

      // Update user profile with document reference
      const user = await this.getUserById(userId);
      if (!user) return null;

      const currentDocs = user.kycDocuments || {};
      const newDocs = {
        ...currentDocs,
        [file.name]: data.path
      };

      await this.updateUser(userId, {
        kycDocuments: newDocs,
        kycStatus: 'IN_REVIEW'
      });

      return data.path;
    } catch (error) {
      logger.error('Error in uploadKYCDocument:', error);
      return null;
    }
  }

  async getSupplierFinancials(supplierId: string): Promise<SupplierFinancials> {
    try {
      // 1. Get completed orders
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('amount, status')
        .eq('supplier_id', supplierId)
        .in('status', ['DELIVERED', 'COMPLETED']);

      if (ordersError) throw ordersError;

      // 2. Get pending payouts
      const { data: payouts, error: payoutsError } = await (supabase as any)
        .from('supplier_payouts')
        .select('amount')
        .eq('supplier_id', supplierId)
        .eq('status', 'PENDING');

      if (payoutsError && !this.isMissingRelationError(payoutsError, 'supplier_payouts')) {
        logger.warn('Error fetching payouts:', payoutsError);
      }

      const completedOrders = orders?.length || 0;
      const totalEarnings = orders?.reduce((sum, order) => sum + Number(order.amount || 0), 0) || 0;
      const pendingPayouts = (payouts || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const averageOrderValue = completedOrders > 0 ? totalEarnings / completedOrders : 0;

      return {
        totalEarnings,
        pendingPayouts,
        completedOrders,
        averageOrderValue
      };
    } catch (error) {
      logger.error('Error calculating supplier financials:', error);
      return {
        totalEarnings: 0,
        pendingPayouts: 0,
        completedOrders: 0,
        averageOrderValue: 0
      };
    }
  }
  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const sensitiveUpdateRequested =
      updates.role !== undefined
      || updates.verified !== undefined
      || updates.status !== undefined
      || updates.kycStatus !== undefined
      || updates.rating !== undefined
      || updates.creditLimit !== undefined;

    if (sensitiveUpdateRequested) {
      await this.assertAdminActor('update user sensitive fields');
    } else {
      const actor = await this.getCurrentActorIdentity();
      if (actor && actor.role !== UserRole.ADMIN && actor.id !== id) {
        throw new Error('Unauthorized: users can only update their own profile');
      }
    }

    const dbUpdates: Record<string, any> = {};

    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.companyName !== undefined) dbUpdates.company_name = updates.companyName;
    if (updates.verified !== undefined) dbUpdates.verified = updates.verified;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.kycStatus !== undefined) dbUpdates.kyc_status = updates.kycStatus;
    if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
    if (updates.creditLimit !== undefined) dbUpdates.credit_limit = updates.creditLimit;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone || null;

    const paymentSettings = updates.paymentSettings;
    if (paymentSettings !== undefined) dbUpdates.payment_settings = paymentSettings;
    const kycDocuments = updates.kycDocuments;
    if (kycDocuments !== undefined) dbUpdates.kyc_documents = kycDocuments;

    let payload = { ...dbUpdates };
    const prunedColumns = new Set<string>();
    let mappedDbUser: User | null = null;
    while (Object.keys(payload).length > 0) {
      const { data, error } = await (supabase as any)
        .from('users')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (!error) {
        mappedDbUser = this.mapDbUserToUser(data);
        break;
      }

      const nextPayload = this.pruneMissingUserUpdateColumn(payload, error);
      if (nextPayload) {
        const removedColumns = Object.keys(payload).filter((columnName) => !(columnName in nextPayload));
        removedColumns.forEach((columnName) => prunedColumns.add(columnName));
        payload = nextPayload;
        continue;
      }

      logger.error('Error updating user:', error);
      return null;
    }

    const profileFallbackPayload: Partial<Pick<User, 'paymentSettings' | 'kycDocuments'>> = {};
    if (prunedColumns.has('payment_settings') && updates.paymentSettings !== undefined) {
      profileFallbackPayload.paymentSettings = updates.paymentSettings;
    }
    if (prunedColumns.has('kyc_documents') && updates.kycDocuments !== undefined) {
      profileFallbackPayload.kycDocuments = updates.kycDocuments;
    }

    if (Object.keys(profileFallbackPayload).length > 0) {
      const fallbackSaved = await this.persistSupplierProfileFallback(id, profileFallbackPayload);
      if (!fallbackSaved) {
        logger.error('Failed to persist supplier profile fallback payload', {
          userId: id,
          prunedColumns: Array.from(prunedColumns.values()),
        });
        return null;
      }
    }

    if (prunedColumns.size > 0) {
      logger.warn('User update completed with pruned columns', {
        userId: id,
        requestedFields: Object.keys(dbUpdates),
        prunedColumns: Array.from(prunedColumns.values()),
      });
    }

    const refreshedUser = await this.getUserById(id);
    const finalUser = refreshedUser || mappedDbUser;
    if (!finalUser) return null;

    return {
      ...finalUser,
      paymentSettings: profileFallbackPayload.paymentSettings ?? finalUser.paymentSettings,
      kycDocuments: profileFallbackPayload.kycDocuments ?? finalUser.kycDocuments,
    };
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

    const { data: rfqQuotes, error: fetchError } = await (supabase as any)
      .from('quotes')
      .select('id, supplier_price')
      .eq('rfq_id', rfqId);

    if (fetchError) {
      logger.error('Error loading RFQ quotes for margin update:', fetchError);
      return { success: false, error: fetchError.message };
    }

    for (const quote of rfqQuotes || []) {
      const supplierPrice = Number(quote.supplier_price ?? 0);
      const finalPrice = Math.round(supplierPrice * (1 + normalizedMargin / 100) * 100) / 100;
      let updatePayload: Record<string, any> = {
        margin_percent: normalizedMargin,
        final_price: finalPrice,
      };

      while (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await (supabase as any)
          .from('quotes')
          .update(updatePayload)
          .eq('id', quote.id);

        if (!updateError) break;

        const nextPayload = this.pruneMissingRelationColumn(
          updatePayload,
          updateError,
          ApiService.MISSING_QUOTE_COLUMN_REGEX
        );
        if (nextPayload) {
          updatePayload = nextPayload;
          continue;
        }

        logger.error('Error setting RFQ margin on quote:', updateError);
        return { success: false, error: updateError.message };
      }

      await this.recalculateQuoteItemFinalPricing(quote.id, normalizedMargin);
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
      throw new Error(`Failed to fetch credit limit adjustments: ${error.message || 'Unknown error'}`);
    }

    const adjustments = (data || []).map((row: any) => this.mapDbCreditLimitAdjustment(row));

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
    await this.assertAdminActor('create user');

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
      throw new Error(`Failed to fetch products: ${error.message || 'Unknown error'}`);
    }

    return data.map((row: any) => this.mapDbProductToProduct(row));
  }

  async getProductById(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching product:', error);
      throw new Error(`Failed to fetch product: ${error.message || 'Unknown error'}`);
    }

    return this.mapDbProductToProduct(data);
  }

  async createProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
    let insertPayload: Record<string, any> = {
      supplier_id: product.supplierId,
      name: product.name,
      description: product.description,
      category: product.category,
      subcategory: product.subcategory,
      image: product.image,
      status: product.status || 'PENDING',
      cost_price: product.supplierPrice,
      sku: product.sku
    };

    while (Object.keys(insertPayload).length > 0) {
      const { data, error } = await (supabase as any)
        .from('products')
        .insert(insertPayload)
        .select()
        .single();

      if (!error) {
        return this.mapDbProductToProduct(data);
      }

      const nextPayload = this.pruneMissingRelationColumn(
        insertPayload,
        error,
        ApiService.MISSING_PRODUCT_COLUMN_REGEX
      );
      if (nextPayload) {
        insertPayload = nextPayload;
        continue;
      }

      logger.error('Error creating product:', error);
      throw new Error(`Failed to create product: ${error.message || 'Unknown error'}`);
    }

    throw new Error('Failed to create product: no compatible product columns available');
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
    let dbUpdates: Record<string, any> = {};

    if (updates.name) dbUpdates.name = updates.name;
    if (updates.description) dbUpdates.description = updates.description;
    if (updates.category) dbUpdates.category = updates.category;
    if (updates.subcategory) dbUpdates.subcategory = updates.subcategory;
    if (updates.image) dbUpdates.image = updates.image;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.supplierPrice !== undefined) dbUpdates.cost_price = updates.supplierPrice;
    if (updates.sku) dbUpdates.sku = updates.sku;

    while (Object.keys(dbUpdates).length > 0) {
      const { data, error } = await (supabase as any)
        .from('products')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (!error) {
        return this.mapDbProductToProduct(data);
      }

      const nextPayload = this.pruneMissingRelationColumn(
        dbUpdates,
        error,
        ApiService.MISSING_PRODUCT_COLUMN_REGEX
      );
      if (nextPayload) {
        dbUpdates = nextPayload;
        continue;
      }

      logger.error('Error updating product:', error);
      throw new Error(`Failed to update product: ${error.message || 'Unknown error'}`);
    }

    return this.getProductById(id);
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
    filters?: { clientId?: string; supplierId?: string; status?: RFQ['status'] },
    pagination?: PaginationOptions
  ): Promise<RFQ[]> {
    const selectVariants = [
      `
        *,
        rfq_items (
          id,
          product_id,
          quantity,
          notes,
          flexibility
        )
      `,
      `
        *,
        rfq_items (
          id,
          product_id,
          quantity,
          notes,
          item_flexibility
        )
      `,
      `
        *,
        rfq_items (
          id,
          product_id,
          quantity,
          notes
        )
      `,
    ];

    let supplierScopedRfqIds: string[] | null = null;
    if (filters?.supplierId) {
      try {
        const { data: supplierProductRows, error: supplierProductsError } = await (supabase as any)
          .from('products')
          .select('id')
          .eq('supplier_id', filters.supplierId);

        if (supplierProductsError) {
          logger.warn('Unable to pre-filter RFQs by supplier products; falling back to row-level visibility', {
            supplierId: filters.supplierId,
            error: supplierProductsError.message,
          });
        } else {
          const supplierProductIds = (supplierProductRows || [])
            .map((row: any) => row.id)
            .filter(Boolean);

          if (supplierProductIds.length === 0) {
            logger.info('Supplier has no mapped products yet; skipping RFQ ID pre-filter and using row-level visibility', {
              supplierId: filters.supplierId,
            });
          } else {
            const { data: rfqItemRows, error: rfqItemsError } = await (supabase as any)
              .from('rfq_items')
              .select('rfq_id')
              .in('product_id', supplierProductIds);

            if (rfqItemsError) {
              logger.warn('Unable to derive RFQ IDs for supplier; falling back to row-level visibility', {
                supplierId: filters.supplierId,
                error: rfqItemsError.message,
              });
            } else {
              const derivedRfqIds: string[] = Array.from(new Set<string>(
                (rfqItemRows || [])
                  .map((row: any) => String(row.rfq_id || '').trim())
                  .filter((value): value is string => value.length > 0)
              ));
              supplierScopedRfqIds = derivedRfqIds.length > 0 ? derivedRfqIds : null;
            }
          }
        }
      } catch (error) {
        logger.warn('Supplier RFQ pre-filter failed unexpectedly; falling back to row-level visibility', {
          supplierId: filters.supplierId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let lastError: any = null;
    for (const selectClause of selectVariants) {
      let query = supabase
        .from('rfqs')
        .select(selectClause)
        .order('created_at', { ascending: false });

      if (filters?.clientId) {
        query = query.eq('client_id', filters.clientId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (supplierScopedRfqIds !== null) {
        // If supplier has no products yet, show all OPEN/SUBMITTED RFQs (fixes S1)
        if (supplierScopedRfqIds.length === 0) {
          logger.info('Supplier has no products; showing all OPEN/SUBMITTED RFQs instead of empty list', {
            supplierId: filters?.supplierId,
          });
          // Don't filter by ID - let RLS handle visibility
          // Add status filter to show only open RFQs
          query = query.in('status', ['OPEN']);
        } else {
          query = query.in('id', supplierScopedRfqIds);
        }
      }

      query = this.applyPagination(query, pagination);

      const { data, error } = await query;
      if (!error) {
        return (data || []).map((row: any) => this.mapDbRfqToRfq(row));
      }

      lastError = error;
      const canRetryWithFallback =
        /column .*flexibility.* does not exist/i.test(error.message || '')
        || /column .*item_flexibility.* does not exist/i.test(error.message || '');
      if (!canRetryWithFallback) {
        break;
      }
    }

    logger.error('Error fetching RFQs:', lastError);
    throw new Error(`Failed to fetch RFQs: ${lastError?.message || 'Unknown error'}`);
  }

  async getRFQById(id: string): Promise<RFQ | null> {
    const selectVariants = [
      `
        *,
        rfq_items (
          id,
          product_id,
          quantity,
          notes,
          flexibility
        )
      `,
      `
        *,
        rfq_items (
          id,
          product_id,
          quantity,
          notes,
          item_flexibility
        )
      `,
      `
        *,
        rfq_items (
          id,
          product_id,
          quantity,
          notes
        )
      `,
    ];

    let lastError: any = null;
    for (const selectClause of selectVariants) {
      const { data, error } = await supabase
        .from('rfqs')
        .select(selectClause)
        .eq('id', id)
        .single();

      if (!error) {
        return this.mapDbRfqToRfq(data);
      }

      lastError = error;
      const canRetryWithFallback =
        /column .*flexibility.* does not exist/i.test(error.message || '')
        || /column .*item_flexibility.* does not exist/i.test(error.message || '');
      if (!canRetryWithFallback) {
        break;
      }
    }

    logger.error('Error fetching RFQ:', lastError);
    return null;
  }

  async createRFQ(rfq: Omit<RFQ, 'id'>): Promise<RFQ | null> {
    const normalizedDate = rfq.date || new Date().toISOString().split('T')[0];
    const itemsPayload = (rfq.items || []).map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      notes: item.notes || null,
      flexibility: item.flexibility ? this.mapRfqFlexibilityToDb(item.flexibility) : null,
      item_flexibility: item.flexibility ? this.mapRfqFlexibilityToDb(item.flexibility) : null,
    }));

    let rfqId: string | null = null;

    const { data: rfqData, error: rfqError } = await supabase.rpc('create_rfq_with_items', {
      p_client_id: rfq.clientId,
      p_items: itemsPayload,
      p_status: rfq.status || 'OPEN',
      p_date: normalizedDate
    });

    if (!rfqError) {
      if (typeof (rfqData as any)?.id === 'string') {
        rfqId = (rfqData as any).id;
      } else if (typeof rfqData === 'string') {
        rfqId = rfqData;
      } else if (Array.isArray(rfqData) && typeof (rfqData as any[])[0]?.id === 'string') {
        rfqId = (rfqData as any[])[0].id;
      }
    }

    if (!rfqId) {
      const missingRpcOrSchemaIssue =
        Boolean(rfqError)
        && (
          rfqError.code === '42883'
          || /create_rfq_with_items/i.test(String(rfqError.message || ''))
          || /function .* does not exist/i.test(String(rfqError.message || ''))
          || /permission denied/i.test(String(rfqError.message || ''))
          || /column .* does not exist/i.test(String(rfqError.message || ''))
          || /relation .* does not exist/i.test(String(rfqError.message || ''))
        );

      if (!missingRpcOrSchemaIssue) {
        logger.error('Error creating RFQ atomically:', rfqError);
        return null;
      }

      logger.warn('create_rfq_with_items RPC unavailable; using direct RFQ insert fallback', {
        error: rfqError?.message,
      });

      const { data: insertedRfq, error: insertRfqError } = await (supabase as any)
        .from('rfqs')
        .insert({
          client_id: rfq.clientId,
          status: rfq.status || 'OPEN',
          date: normalizedDate,
        })
        .select('id')
        .single();

      if (insertRfqError || !insertedRfq?.id) {
        logger.error('Error creating RFQ via fallback insert:', insertRfqError);
        return null;
      }

      rfqId = insertedRfq.id;

      for (const item of rfq.items || []) {
        let rfqItemPayload: Record<string, any> = {
          rfq_id: rfqId,
          product_id: item.productId,
          quantity: item.quantity,
          notes: item.notes || null,
          flexibility: item.flexibility ? this.mapRfqFlexibilityToDb(item.flexibility) : null,
          item_flexibility: item.flexibility ? this.mapRfqFlexibilityToDb(item.flexibility) : null,
        };

        while (Object.keys(rfqItemPayload).length > 0) {
          const { error: itemInsertError } = await (supabase as any)
            .from('rfq_items')
            .insert(rfqItemPayload);
          if (!itemInsertError) break;

          const nextPayload = this.pruneMissingRelationColumn(
            rfqItemPayload,
            itemInsertError,
            ApiService.MISSING_RFQ_ITEM_COLUMN_REGEX
          );
          if (nextPayload) {
            rfqItemPayload = nextPayload;
            continue;
          }

          logger.error('Error creating RFQ item via fallback insert:', itemInsertError);
          return null;
        }
      }
    }

    // Persist extended RFQ fields after transactional create for backward-compatible RPC support.
    let additionalRfqUpdates: Record<string, unknown> = {};
    if (rfq.deliveryLocation !== undefined) additionalRfqUpdates.delivery_location = rfq.deliveryLocation || null;
    if (rfq.desiredDeliveryDate !== undefined) additionalRfqUpdates.desired_delivery_date = rfq.desiredDeliveryDate || null;
    if (rfq.generalRequirements !== undefined) additionalRfqUpdates.general_requirements = rfq.generalRequirements || null;
    if (rfq.title !== undefined) additionalRfqUpdates.title = rfq.title || null;
    if (rfq.flexibility !== undefined) additionalRfqUpdates.flexibility = this.mapRfqFlexibilityToDb(rfq.flexibility);
    const normalizedExpiry = rfq.expiryDate || (rfq.validUntil ? rfq.validUntil.split('T')[0] : undefined);
    if (normalizedExpiry) {
      additionalRfqUpdates.expires_at = `${normalizedExpiry}T23:59:59`;
    }

    while (Object.keys(additionalRfqUpdates).length > 0) {
      const { error: extraRfqUpdateError } = await supabase
        .from('rfqs')
        .update(additionalRfqUpdates as any)
        .eq('id', rfqId);
      if (!extraRfqUpdateError) break;

      const nextPayload = this.pruneMissingRelationColumn(
        additionalRfqUpdates,
        extraRfqUpdateError,
        ApiService.MISSING_RFQ_COLUMN_REGEX
      );
      if (nextPayload) {
        additionalRfqUpdates = nextPayload;
        continue;
      }

      logger.warn('RFQ created but failed to persist extended fields', {
        rfqId,
        error: extraRfqUpdateError.message,
      });
      break;
    }

    // Persist per-item flexibility on rfq_items for item-level preference.
    for (const item of rfq.items || []) {
      const itemFlexibility = item.flexibility || rfq.flexibility;
      if (!itemFlexibility) continue;
      const mappedFlexibility = this.mapRfqFlexibilityToDb(itemFlexibility);
      const candidatePayloads = [
        { flexibility: mappedFlexibility },
        { item_flexibility: mappedFlexibility },
      ];

      let updated = false;
      for (const payload of candidatePayloads) {
        const { error: itemFlexUpdateError } = await (supabase as any)
          .from('rfq_items')
          .update(payload)
          .eq('rfq_id', rfqId)
          .eq('product_id', item.productId);
        if (!itemFlexUpdateError) {
          updated = true;
          break;
        }

        if (/column .* does not exist/i.test(itemFlexUpdateError.message || '')) {
          continue;
        }

        logger.warn('RFQ item flexibility update skipped', {
          rfqId,
          productId: item.productId,
          error: itemFlexUpdateError.message,
        });
        break;
      }

      if (!updated) {
        logger.warn('RFQ item flexibility column not available in current schema', {
          rfqId,
          productId: item.productId,
        });
      }
    }

    // Fetch complete RFQ with items
    return this.getRFQById(rfqId);
  }

  async updateRFQ(id: string, updates: Partial<RFQ>): Promise<RFQ | null> {
    let dbUpdates: Record<string, any> = {};

    if (updates.status) dbUpdates.status = updates.status;
    if (updates.date) dbUpdates.date = updates.date;
    if (updates.autoQuoteTriggered !== undefined) dbUpdates.auto_quote_triggered = updates.autoQuoteTriggered;
    if (updates.deliveryLocation !== undefined) dbUpdates.delivery_location = updates.deliveryLocation || null;
    if (updates.desiredDeliveryDate !== undefined) dbUpdates.desired_delivery_date = updates.desiredDeliveryDate || null;
    if (updates.generalRequirements !== undefined) dbUpdates.general_requirements = updates.generalRequirements || null;
    if (updates.title !== undefined) dbUpdates.title = updates.title || null;
    if (updates.flexibility !== undefined) dbUpdates.flexibility = this.mapRfqFlexibilityToDb(updates.flexibility);
    if (updates.expiryDate !== undefined) {
      dbUpdates.expires_at = updates.expiryDate ? `${updates.expiryDate}T23:59:59` : null;
    } else if (updates.validUntil !== undefined) {
      dbUpdates.expires_at = updates.validUntil || null;
    }

    while (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase
        .from('rfqs')
        .update(dbUpdates)
        .eq('id', id);
      if (!error) {
        return this.getRFQById(id);
      }

      const nextPayload = this.pruneMissingRelationColumn(
        dbUpdates,
        error,
        ApiService.MISSING_RFQ_COLUMN_REGEX
      );
      if (nextPayload) {
        dbUpdates = nextPayload;
        continue;
      }

      logger.error('Error updating RFQ:', error);
      return null;
    }

    logger.warn('RFQ update skipped because no supported columns were available', { rfqId: id });
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
      throw new Error(`Failed to fetch quotes: ${error.message || 'Unknown error'}`);
    }

    return data.map((row: any) => this.mapDbQuoteToQuote(row));
  }

  // New: Get quotes with related data for comparison
  async getQuotesWithDetails(rfqId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('quotes')
      .select(`
        *,
        supplier:users!supplier_id(id, public_id, company_name, name, rating)
      `)
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching quotes with details:', error);
      throw new Error(`Failed to fetch quotes with details: ${error.message || 'Unknown error'}`);
    }

    const quoteRows = data || [];
    const quoteIds = quoteRows.map((quote: any) => quote.id).filter(Boolean);
    const supplierIds = Array.from(
      new Set(quoteRows.map((quote: any) => quote.supplier_id).filter(Boolean))
    );

    const orderCountBySupplierId = new Map<string, number>();
    if (supplierIds.length > 0) {
      const { data: supplierOrders, error: ordersError } = await supabase
        .from('orders')
        .select('supplier_id')
        .in('supplier_id', supplierIds);

      if (ordersError) {
        logger.warn('Failed to fetch supplier order counts for quote comparison', { error: ordersError.message });
      } else {
        (supplierOrders || []).forEach((order: any) => {
          const supplierId = order.supplier_id;
          if (!supplierId) return;
          orderCountBySupplierId.set(supplierId, (orderCountBySupplierId.get(supplierId) || 0) + 1);
        });
      }
    }

    let quoteItemRows: any[] = [];
    if (quoteIds.length > 0) {
      const { data: rawQuoteItems, error: quoteItemsError } = await (supabase as any)
        .from('quote_items')
        .select('id, quote_id, product_id, unit_price, quantity, line_total, final_unit_price, final_line_total, alternative_product_id, is_quoted, notes')
        .in('quote_id', quoteIds);

      if (quoteItemsError) {
        logger.warn('Failed to fetch quote item details for comparison', { error: quoteItemsError.message });
      } else {
        quoteItemRows = rawQuoteItems || [];
      }
    }

    const productIds = Array.from(
      new Set(
        quoteItemRows
          .flatMap((item) => [item.product_id, item.alternative_product_id])
          .filter(Boolean)
      )
    );

    let productsById = new Map<string, { id: string; name: string; brand?: string; image?: string }>();
    if (productIds.length > 0) {
      const { data: products, error: productError } = await supabase
        .from('products')
        .select('id, name, brand, image')
        .in('id', productIds);

      if (productError) {
        logger.warn('Failed to fetch products for quote comparison', { error: productError.message });
      } else {
        productsById = new Map((products || []).map((product: any) => [product.id, product]));
      }
    }

    const quoteItemsByQuoteId = quoteItemRows.reduce((acc, item) => {
      const quoteId = String(item.quote_id);
      if (!acc.has(quoteId)) {
        acc.set(quoteId, []);
      }
      const isQuoted = item.is_quoted !== false;
      if (isQuoted) {
        const baseProduct = productsById.get(item.product_id);
        const altProduct = item.alternative_product_id ? productsById.get(item.alternative_product_id) : undefined;
        acc.get(quoteId)?.push({
          id: item.id,
          productId: item.product_id,
          productName: altProduct?.name || baseProduct?.name || item.product_id,
          brand: altProduct?.brand || baseProduct?.brand || undefined,
          unitPrice: Number(item.final_unit_price ?? item.unit_price ?? 0),
          quantity: Number(item.quantity ?? 0),
          lineTotal: Number(item.final_line_total ?? item.line_total ?? 0),
          isAlternative: Boolean(item.alternative_product_id),
          alternativeProductName: altProduct?.name,
          notes: item.notes || undefined,
        });
      }
      return acc;
    }, new Map<string, any[]>());

    return quoteRows.map((quote: any) => ({
      id: quote.id,
      rfq_id: quote.rfq_id,
      supplier_id: quote.supplier_id,
      price: Number(quote.supplier_price ?? quote.price ?? 0),
      finalPrice: Number(quote.final_price ?? quote.finalPrice ?? quote.supplier_price ?? 0),
      leadTime: quote.lead_time || quote.leadTime || '',
      warranty: quote.warranty || undefined,
      notes: quote.notes || undefined,
      status: quote.status,
      created_at: quote.created_at,
      type: quote.type === 'auto' ? 'auto' : 'custom',
      quoteItems: quoteItemsByQuoteId.get(quote.id) || [],
      supplier: {
        id: quote.supplier?.id || quote.supplier_id,
        companyName: quote.supplier?.company_name || undefined,
        name: quote.supplier?.name || undefined,
        publicId: quote.supplier?.public_id || undefined,
        rating: quote.supplier?.rating || undefined,
        orderCount: orderCountBySupplierId.get(quote.supplier_id) || 0,
      },
    }));
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
    let insertPayload: Record<string, any> = {
      rfq_id: quote.rfqId,
      supplier_id: quote.supplierId,
      supplier_price: quote.supplierPrice,
      lead_time: quote.leadTime,
      margin_percent: quote.marginPercent || 0,
      final_price: quote.finalPrice || quote.supplierPrice,
      status: quote.status || 'PENDING_ADMIN',
      type: quote.type || 'custom',
      notes: quote.notes || null,
      shipping_cost: quote.shippingCost ?? null,
      tax: quote.tax ?? null,
    };

    let insertedQuoteId: string | null = null;
    while (Object.keys(insertPayload).length > 0) {
      const { data, error } = await (supabase as any)
        .from('quotes')
        .insert(insertPayload)
        .select()
        .single();

      if (!error && data?.id) {
        insertedQuoteId = data.id;
        break;
      }

      const isSupplierRfqDuplicate =
        Boolean(error)
        && (
          error.code === '23505'
          || /duplicate key value/i.test(error.message || '')
          || /quotes_rfq_id_supplier_id_key/i.test(error.message || '')
        );

      if (isSupplierRfqDuplicate) {
        const { data: existingQuote, error: existingQuoteError } = await (supabase as any)
          .from('quotes')
          .select('id')
          .eq('rfq_id', quote.rfqId)
          .eq('supplier_id', quote.supplierId)
          .maybeSingle();

        if (existingQuoteError || !existingQuote?.id) {
          logger.error('Duplicate quote detected but existing quote lookup failed', {
            rfqId: quote.rfqId,
            supplierId: quote.supplierId,
            error: existingQuoteError || error,
          });
          return null;
        }

        logger.warn('Quote already exists for RFQ/supplier; updating existing quote instead of insert', {
          rfqId: quote.rfqId,
          supplierId: quote.supplierId,
          quoteId: existingQuote.id,
        });

        return this.updateQuote(existingQuote.id, {
          supplierPrice: quote.supplierPrice,
          leadTime: quote.leadTime,
          marginPercent: quote.marginPercent,
          finalPrice: quote.finalPrice,
          status: quote.status,
          type: quote.type,
          notes: quote.notes,
          shippingCost: quote.shippingCost,
          tax: quote.tax,
          quoteItems: quote.quoteItems,
        });
      }

      const nextPayload = this.pruneMissingRelationColumn(
        insertPayload,
        error || {},
        ApiService.MISSING_QUOTE_COLUMN_REGEX
      );
      if (nextPayload) {
        insertPayload = nextPayload;
        continue;
      }

      logger.error('Error creating quote:', error);
      return null;
    }

    if (!insertedQuoteId) {
      logger.error('Error creating quote: no compatible quote columns available');
      return null;
    }

    if (quote.quoteItems && quote.quoteItems.length > 0) {
      await this.syncQuoteItems(insertedQuoteId, quote.rfqId, quote.quoteItems);
    }

    if (quote.marginPercent !== undefined) {
      await this.recalculateQuoteItemFinalPricing(insertedQuoteId, quote.marginPercent);
    }

    return this.getQuoteById(insertedQuoteId);
  }

  async updateQuote(id: string, updates: Partial<Quote>): Promise<Quote | null> {
    let dbUpdates: Record<string, any> = {};

    if (updates.supplierPrice !== undefined) dbUpdates.supplier_price = updates.supplierPrice;
    if (updates.leadTime) dbUpdates.lead_time = updates.leadTime;
    if (updates.marginPercent !== undefined) dbUpdates.margin_percent = updates.marginPercent;
    if (updates.finalPrice !== undefined) dbUpdates.final_price = updates.finalPrice;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.type) dbUpdates.type = updates.type;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
    if (updates.shippingCost !== undefined) dbUpdates.shipping_cost = updates.shippingCost;
    if (updates.tax !== undefined) dbUpdates.tax = updates.tax;

    let updatedData: any = null;
    while (Object.keys(dbUpdates).length > 0) {
      const { data, error } = await (supabase as any)
        .from('quotes')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (!error) {
        updatedData = data;
        break;
      }

      const nextPayload = this.pruneMissingRelationColumn(
        dbUpdates,
        error,
        ApiService.MISSING_QUOTE_COLUMN_REGEX
      );
      if (nextPayload) {
        dbUpdates = nextPayload;
        continue;
      }

      logger.error('Error updating quote:', error);
      throw new Error(`Failed to update quote: ${error.message || 'Unknown error'}`);
    }

    if (updates.quoteItems) {
      const rfqId = updatedData?.rfq_id || (await this.getQuoteById(id))?.rfqId;
      if (rfqId) {
        await this.syncQuoteItems(id, rfqId, updates.quoteItems);
      }
    }

    if (updates.marginPercent !== undefined) {
      await this.recalculateQuoteItemFinalPricing(id, updates.marginPercent);
    }

    return this.getQuoteById(id);
  }

  async approveQuote(id: string, marginPercent: number): Promise<Quote | null> {
    return this.updateQuote(id, {
      marginPercent,
      status: 'SENT_TO_CLIENT'
    });
  }

  async acceptQuote(id: string): Promise<{ quote: Quote | null; order: Order | null }> {
    try {
      // Preferred path: atomic RPC that also enforces credit checks.
      const { data: orderData, error } = await supabase.rpc('accept_quote_and_deduct_credit', { p_quote_id: id });

      if (error) {
        throw error;
      }

      const quote = await this.getQuoteById(id);
      const resolvedOrder = await this.resolveAcceptedOrderFromRpcResult(id, orderData);

      return {
        quote,
        order: resolvedOrder
      };
    } catch (error: any) {
      const message = String(error?.message || '');
      const isMissingRpc =
        error?.code === '42883'
        || /accept_quote_and_deduct_credit/i.test(message)
        || /function .* does not exist/i.test(message);

      if (!isMissingRpc) {
        logger.error('Error accepting quote:', error);
        throw error;
      }

      logger.warn('accept_quote_and_deduct_credit RPC unavailable; using compatibility fallback', {
        quoteId: id,
        error: message,
      });

      return this.acceptQuoteFallback(id);
    }
  }

  private async getLatestOrderForQuote(quoteId: string): Promise<Order | null> {
    const buildQuery = (orderColumn: 'created_at' | 'date') => (supabase as any)
      .from('orders')
      .select('*')
      .eq('quote_id', quoteId)
      .order(orderColumn, { ascending: false })
      .limit(1)
      .maybeSingle();

    let { data, error } = await buildQuery('created_at');

    if (error && /column "created_at" of relation "orders" does not exist/i.test(error.message || '')) {
      const fallbackResult = await buildQuery('date');
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      logger.warn('Unable to resolve accepted order by quote id', {
        quoteId,
        error: error.message,
      });
      return null;
    }

    return data ? this.mapDbOrderToOrder(data) : null;
  }

  private async resolveAcceptedOrderFromRpcResult(quoteId: string, rpcResult: unknown): Promise<Order | null> {
    const asRecord = (value: unknown): Record<string, any> | null => (
      value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : null
    );
    const asRecordArray = (value: unknown): Record<string, any>[] => (
      Array.isArray(value)
        ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, any>[]
        : []
    );

    const looksLikeOrderRow = (value: Record<string, any>): boolean => (
      typeof value.id === 'string'
      && (
        typeof value.client_id === 'string'
        || typeof value.clientId === 'string'
      )
      && (
        typeof value.supplier_id === 'string'
        || typeof value.supplierId === 'string'
      )
    );

    const rpcArray = asRecordArray(rpcResult);
    if (rpcArray.length > 0) {
      const firstOrderLike = rpcArray.find((entry) => looksLikeOrderRow(entry));
      if (firstOrderLike) {
        return this.mapDbOrderToOrder(firstOrderLike);
      }

      const firstRecord = rpcArray[0];
      const firstOrderId = firstRecord?.order_id ?? firstRecord?.orderId ?? firstRecord?.id;
      if (typeof firstOrderId === 'string' && firstOrderId.trim().length > 0) {
        const order = await this.getOrderById(firstOrderId);
        if (order) {
          return order;
        }
      }
    }

    if (typeof rpcResult === 'string' && rpcResult.trim().length > 0) {
      const order = await this.getOrderById(rpcResult);
      if (order) {
        return order;
      }
    }

    const rpcRecord = asRecord(rpcResult);
    if (!rpcRecord) {
      return this.getLatestOrderForQuote(quoteId);
    }

    if (looksLikeOrderRow(rpcRecord)) {
      return this.mapDbOrderToOrder(rpcRecord);
    }

    const nestedOrderRecord = asRecord(rpcRecord.order);
    if (nestedOrderRecord && looksLikeOrderRow(nestedOrderRecord)) {
      return this.mapDbOrderToOrder(nestedOrderRecord);
    }

    const nestedDataRecord = asRecord(rpcRecord.data);
    if (nestedDataRecord && looksLikeOrderRow(nestedDataRecord)) {
      return this.mapDbOrderToOrder(nestedDataRecord);
    }

    const nestedDataArray = asRecordArray(rpcRecord.data);
    const dataArrayOrderLike = nestedDataArray.find((entry) => looksLikeOrderRow(entry));
    if (dataArrayOrderLike) {
      return this.mapDbOrderToOrder(dataArrayOrderLike);
    }

    const orderId = rpcRecord.order_id ?? rpcRecord.orderId;
    if (typeof orderId === 'string' && orderId.trim().length > 0) {
      const order = await this.getOrderById(orderId);
      if (order) {
        return order;
      }
    }

    return this.getLatestOrderForQuote(quoteId);
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
    const buildOrdersQuery = (orderColumn: 'created_at' | 'date') => {
      let query = supabase
        .from('orders')
        .select('*')
        .order(orderColumn, { ascending: false });

      if (filters?.clientId) {
        query = query.eq('client_id', filters.clientId);
      }
      if (filters?.supplierId) {
        query = query.eq('supplier_id', filters.supplierId);
      }
      if (filters?.status) {
        query = query.eq('status', this.toDbOrderStatus(filters.status));
      }

      return this.applyPagination(query, pagination);
    };

    let { data, error } = await buildOrdersQuery('created_at');

    if (error && this.isPermissionDeniedError(error)) {
      await this.refreshSessionForRlsRetry('getOrders');
      const retryResult = await buildOrdersQuery('created_at');
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error && /column "created_at" of relation "orders" does not exist/i.test(error.message || '')) {
      const fallbackResult = await buildOrdersQuery('date');
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      logger.error('Error fetching orders:', error);
      throw new Error(`Failed to fetch orders: ${error.message || 'Unknown error'}`);
    }

    return data.map((row: any) => this.mapDbOrderToOrder(row));
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
    let insertPayload: Record<string, any> = {
      quote_id: order.quoteId,
      client_id: order.clientId,
      supplier_id: order.supplierId,
      amount: order.amount,
      total_amount: order.amount,
      status: this.toDbOrderStatus(order.status || 'PENDING_PAYMENT'),
      date: order.date || new Date().toISOString().split('T')[0]
    };

    while (Object.keys(insertPayload).length > 0) {
      const { data, error } = await (supabase as any)
        .from('orders')
        .insert(insertPayload)
        .select()
        .single();

      if (!error) {
        return this.mapDbOrderToOrder(data);
      }

      const nextPayload = this.pruneMissingOrderUpdateColumn(insertPayload, error || {});
      if (nextPayload) {
        insertPayload = nextPayload;
        continue;
      }

      logger.error('Error creating order:', error);
      throw new Error(`Failed to create order: ${error.message || 'Unknown error'}`);
    }

    throw new Error('Failed to create order: no compatible order columns available');
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | null> {
    const dbUpdates: Record<string, any> = {};
    let currentDbStatus: string | null = null;

    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.status) {
      const { data: currentOrderRow, error: currentOrderError } = await (supabase as any)
        .from('orders')
        .select('status')
        .eq('id', id)
        .single();

      if (currentOrderError || !currentOrderRow) {
        throw new Error(`Cannot update order ${id}: order not found`);
      }

      currentDbStatus = String((currentOrderRow as any).status || '');
      const currentNormalizedStatus = this.normalizeOrderStatus(currentDbStatus);

      if (!canTransitionOrderStatus(currentNormalizedStatus, updates.status)) {
        throw new Error(`Invalid order status transition: ${currentNormalizedStatus} -> ${updates.status}`);
      }

      dbUpdates.status = this.toDbOrderStatus(updates.status);
    }
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.system_po_number !== undefined) dbUpdates.system_po_number = updates.system_po_number;
    if (updates.paymentReference !== undefined) dbUpdates.payment_reference = updates.paymentReference;
    if (updates.paymentConfirmedAt !== undefined) dbUpdates.payment_confirmed_at = updates.paymentConfirmedAt;
    if (updates.paymentConfirmedBy !== undefined) dbUpdates.payment_confirmed_by = updates.paymentConfirmedBy;
    if (updates.paymentNotes !== undefined) dbUpdates.payment_notes = updates.paymentNotes;
    if (updates.paymentReceiptUrl !== undefined) dbUpdates.payment_receipt_url = updates.paymentReceiptUrl;
    if (updates.paymentSubmittedAt !== undefined) dbUpdates.payment_submitted_at = updates.paymentSubmittedAt;
    if (updates.paymentLinkUrl !== undefined) dbUpdates.payment_link_url = updates.paymentLinkUrl;
    if (updates.paymentLinkSentAt !== undefined) dbUpdates.payment_link_sent_at = updates.paymentLinkSentAt;
    if (updates.shipment !== undefined) dbUpdates.shipment_details = updates.shipment;
    if (updates.pickupDetails !== undefined) dbUpdates.pickup_details = updates.pickupDetails;
    if (updates.system_po_generated !== undefined) dbUpdates.system_po_generated = updates.system_po_generated;
    if (updates.client_po_uploaded !== undefined) dbUpdates.client_po_uploaded = updates.client_po_uploaded;
    if (updates.admin_verified !== undefined) dbUpdates.admin_verified = updates.admin_verified;
    if (updates.admin_verified_by !== undefined) dbUpdates.admin_verified_by = updates.admin_verified_by;
    if (updates.admin_verified_at !== undefined) dbUpdates.admin_verified_at = updates.admin_verified_at;
    if (updates.not_test_order_confirmed_at !== undefined) dbUpdates.not_test_order_confirmed_at = updates.not_test_order_confirmed_at;
    if (updates.payment_terms_confirmed_at !== undefined) dbUpdates.payment_terms_confirmed_at = updates.payment_terms_confirmed_at;
    if (updates.client_po_confirmation_submitted_at !== undefined) {
      dbUpdates.client_po_confirmation_submitted_at = updates.client_po_confirmation_submitted_at;
    }
    if (updates.items !== undefined) dbUpdates.items = updates.items;
    dbUpdates.updated_at = updates.updatedAt || new Date().toISOString();

    if (Object.keys(dbUpdates).length === 0) {
      return this.getOrderById(id);
    }

    let updatePayload: Record<string, any> = { ...dbUpdates };
    let retryCount = 0;
    const maxStatusRetryCount = updates.status ? 2 : 0;

    while (Object.keys(updatePayload).length > 0) {
      let query = supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', id);

      // Prevent stale writes when changing status by requiring the expected current status.
      if (updates.status && currentDbStatus) {
        query = query.eq('status', currentDbStatus as unknown as DbOrderStatus);
      }

      const { data, error } = await query
        .select()
        .maybeSingle();

      if (!error) {
        if (!data) {
          if (!updates.status || !currentDbStatus || retryCount >= maxStatusRetryCount) {
            throw new Error(`Order update for ${id} did not apply (record not found or status changed concurrently)`);
          }

          const { data: latestOrderRow, error: latestOrderError } = await (supabase as any)
            .from('orders')
            .select('status')
            .eq('id', id)
            .single();

          if (latestOrderError || !latestOrderRow) {
            throw new Error(`Order update retry failed for ${id}: unable to load latest status`);
          }

          const latestDbStatus = String((latestOrderRow as any).status || '');
          if (latestDbStatus === currentDbStatus) {
            throw new Error(`Order update for ${id} did not apply and latest status was unchanged`);
          }

          const latestNormalizedStatus = this.normalizeOrderStatus(latestDbStatus);
          if (!canTransitionOrderStatus(latestNormalizedStatus, updates.status)) {
            throw new Error(
              `Order update for ${id} rejected after concurrent change: ${latestNormalizedStatus} -> ${updates.status}`
            );
          }

          currentDbStatus = latestDbStatus;
          retryCount += 1;
          logger.warn('Retrying order status update after concurrent status change', {
            orderId: id,
            retryCount,
            currentDbStatus,
            targetStatus: updates.status,
          });
          continue;
        }
        return this.mapDbOrderToOrder(data);
      }

      const nextPayload = this.pruneMissingOrderUpdateColumn(updatePayload, error || {});
      if (nextPayload) {
        logger.warn('Order update column is not available in current schema, retrying without it', {
          orderId: id,
          error: error.message,
        });
        updatePayload = nextPayload;
        continue;
      }

      logger.error('Error updating order:', error);
      throw new Error(`Failed to update order: ${error.message || 'Unknown error'}`);
    }

    logger.error(`Order update for ${id} skipped because no supported update columns were available`);
    return this.getOrderById(id);
  }

  // ============================================================================
  // MARGIN SETTINGS OPERATIONS
  // ============================================================================

  async getMarginSettings(): Promise<{ category: string | null; marginPercent: number; isDefault: boolean }[]> {
    const selectVariants = [
      'category, margin_percent, is_default, created_at, updated_at',
      'category, margin_percent, is_default',
      'category, margin_percent, created_at, updated_at',
      'category, margin_percent',
    ];

    let data: any[] = [];
    let lastError: any = null;
    for (const selectClause of selectVariants) {
      let result = await (supabase as any)
        .from('margin_settings')
        .select(selectClause);

      if (result.error && this.isPermissionDeniedError(result.error)) {
        await this.refreshSessionForRlsRetry('getMarginSettings');
        result = await (supabase as any)
          .from('margin_settings')
          .select(selectClause);
      }

      if (!result.error) {
        data = result.data || [];
        lastError = null;
        break;
      }

      lastError = result.error;
      if (!/column .* does not exist/i.test(result.error.message || '')) {
        break;
      }
    }

    if (lastError) {
      logger.error('Error fetching margin settings:', lastError);
      throw new Error(`Failed to fetch margin settings: ${lastError?.message || 'Unknown error'}`);
    }

    const latestByKey = new Map<string, {
      category: string | null;
      marginPercent: number;
      isDefault: boolean;
      timestamp: number;
    }>();

    (data || []).forEach((row: any) => {
      const normalizedCategory = typeof row.category === 'string' ? row.category.trim() : null;
      const key = normalizedCategory ? normalizedCategory.toLowerCase() : '__default__';
      const timestamp = new Date((row as any).updated_at || (row as any).created_at || 0).getTime() || 0;
      const existing = latestByKey.get(key);

      if (!existing || timestamp >= existing.timestamp) {
        latestByKey.set(key, {
          category: normalizedCategory,
          marginPercent: Number(row.margin_percent || 0),
          isDefault: Boolean((row as any).is_default) || normalizedCategory === null,
          timestamp,
        });
      }
    });

    return Array.from(latestByKey.values())
      .sort((left, right) => {
        if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
        return (left.category || '').localeCompare(right.category || '');
      })
      .map(({ category, marginPercent, isDefault }) => ({
        category,
        marginPercent,
        isDefault,
      }));
  }

  async updateMarginSetting(category: string | null, marginPercent: number): Promise<boolean> {
    const normalizedMargin = this.normalizeMarginPercent(marginPercent);
    if (normalizedMargin === null) {
      logger.error('Error updating margin setting: margin must be between 0 and 100');
      return false;
    }

    const normalizedCategory = category?.trim() || null;

    const updateMarginRow = async (
      matcher: { id?: string; category?: string | null },
      payload: Record<string, any>
    ): Promise<boolean> => {
      let updatePayload = { ...payload };

      while (Object.keys(updatePayload).length > 0) {
        let query = (supabase as any).from('margin_settings').update(updatePayload);
        if (matcher.id) {
          query = query.eq('id', matcher.id);
        } else if (matcher.category === null) {
          query = query.is('category', null);
        } else if (typeof matcher.category === 'string') {
          query = query.eq('category', matcher.category);
        }

        const { error } = await query;
        if (!error) return true;

        if (this.isPermissionDeniedError(error)) {
          await this.refreshSessionForRlsRetry('updateMarginSetting.update');
          continue;
        }

        const nextPayload = this.pruneMissingRelationColumn(
          updatePayload,
          error,
          ApiService.MISSING_MARGIN_COLUMN_REGEX
        );
        if (nextPayload) {
          updatePayload = nextPayload;
          continue;
        }

        logger.error('Error updating margin setting row:', error);
        return false;
      }

      return true;
    };

    const insertMarginRow = async (payload: Record<string, any>): Promise<boolean> => {
      let insertPayload = { ...payload };
      while (Object.keys(insertPayload).length > 0) {
        const { error } = await (supabase as any)
          .from('margin_settings')
          .insert(insertPayload);
        if (!error) return true;

        if (this.isPermissionDeniedError(error)) {
          await this.refreshSessionForRlsRetry('updateMarginSetting.insert');
          continue;
        }

        const nextPayload = this.pruneMissingRelationColumn(
          insertPayload,
          error,
          ApiService.MISSING_MARGIN_COLUMN_REGEX
        );
        if (nextPayload) {
          insertPayload = nextPayload;
          continue;
        }

        logger.error('Error inserting margin setting row:', error);
        return false;
      }

      return false;
    };

    if (normalizedCategory === null) {
      let defaultRows: Array<{ id: string }> = [];
      let defaultLookupError: any = null;

      const lookupByFlag = await (supabase as any)
        .from('margin_settings')
        .select('id')
        .eq('is_default', true)
        .limit(1);
      if (!lookupByFlag.error) {
        defaultRows = lookupByFlag.data || [];
      } else if (this.isPermissionDeniedError(lookupByFlag.error)) {
        await this.refreshSessionForRlsRetry('updateMarginSetting.lookupDefault');
        const retryLookupByFlag = await (supabase as any)
          .from('margin_settings')
          .select('id')
          .eq('is_default', true)
          .limit(1);
        if (!retryLookupByFlag.error) {
          defaultRows = retryLookupByFlag.data || [];
        } else if (/column .* does not exist/i.test(retryLookupByFlag.error.message || '')) {
          const lookupByNullCategory = await (supabase as any)
            .from('margin_settings')
            .select('id')
            .is('category', null)
            .limit(1);
          defaultRows = lookupByNullCategory.data || [];
          defaultLookupError = lookupByNullCategory.error;
        } else {
          defaultLookupError = retryLookupByFlag.error;
        }
      } else if (/column .* does not exist/i.test(lookupByFlag.error.message || '')) {
        const lookupByNullCategory = await (supabase as any)
          .from('margin_settings')
          .select('id')
          .is('category', null)
          .limit(1);
        defaultRows = lookupByNullCategory.data || [];
        defaultLookupError = lookupByNullCategory.error;
      } else {
        defaultLookupError = lookupByFlag.error;
      }

      if (defaultLookupError) {
        logger.error('Error looking up default margin setting:', defaultLookupError);
        return false;
      }

      if ((defaultRows || []).length > 0) {
        const updated = await updateMarginRow(
          { id: defaultRows[0].id },
          {
            margin_percent: normalizedMargin,
            category: null,
            is_default: true,
          }
        );
        if (!updated) return false;
      } else {
        const inserted = await insertMarginRow({
          category: null,
          margin_percent: normalizedMargin,
          is_default: true,
        });
        if (!inserted) return false;
      }
    } else {
      const { data: existingRows, error: existingLookupError } = await (supabase as any)
        .from('margin_settings')
        .select('id')
        .eq('category', normalizedCategory)
        .limit(1);

      if (existingLookupError && this.isPermissionDeniedError(existingLookupError)) {
        await this.refreshSessionForRlsRetry('updateMarginSetting.lookupCategory');
      }

      const { data: retriedExistingRows, error: retriedExistingLookupError } = existingLookupError && this.isPermissionDeniedError(existingLookupError)
        ? await (supabase as any)
          .from('margin_settings')
          .select('id')
          .eq('category', normalizedCategory)
          .limit(1)
        : { data: existingRows, error: existingLookupError };

      if (retriedExistingLookupError) {
        logger.error('Error looking up category margin setting:', retriedExistingLookupError);
        return false;
      }

      if ((retriedExistingRows || []).length > 0) {
        const updated = await updateMarginRow(
          { category: normalizedCategory },
          {
            margin_percent: normalizedMargin,
            is_default: false,
          }
        );
        if (!updated) return false;
      } else {
        const inserted = await insertMarginRow({
          category: normalizedCategory,
          margin_percent: normalizedMargin,
          is_default: false,
        });
        if (!inserted) return false;
      }
    }

    return true;
  }

  // ============================================================================
  // SYSTEM CONFIG OPERATIONS
  // ============================================================================

  async getSystemConfig(): Promise<{
    autoQuoteDelayMinutes: number;
    defaultMarginPercent: number;
    autoQuoteEnabled?: boolean;
    autoQuoteIncludeLimitedStock?: boolean;
    autoQuoteLeadTimeDays?: number;
    rfqDefaultExpiryDays?: number;
  } | null> {
    let systemSettingsQuery = (supabase as any)
      .from('system_settings')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let { data, error } = await systemSettingsQuery;

    if (error && /column "updated_at" of relation "system_settings" does not exist/i.test(error.message || '')) {
      const fallbackResult = await (supabase as any)
        .from('system_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error && this.isMissingRelationError(error, 'system_settings')) {
      const marginSettings = await this.getMarginSettings();
      const defaultMargin = marginSettings.find((setting) => setting.isDefault)?.marginPercent ?? 10;
      const fallbackConfig = this.readSystemConfigFallback();
      return {
        autoQuoteDelayMinutes: Number.isFinite(Number(fallbackConfig.autoQuoteDelayMinutes))
          ? Math.max(1, Number(fallbackConfig.autoQuoteDelayMinutes))
          : 30,
        defaultMarginPercent: Number.isFinite(Number(fallbackConfig.defaultMarginPercent))
          ? Number(fallbackConfig.defaultMarginPercent)
          : defaultMargin,
        autoQuoteEnabled: typeof fallbackConfig.autoQuoteEnabled === 'boolean' ? fallbackConfig.autoQuoteEnabled : true,
        autoQuoteIncludeLimitedStock: typeof fallbackConfig.autoQuoteIncludeLimitedStock === 'boolean'
          ? fallbackConfig.autoQuoteIncludeLimitedStock
          : false,
        autoQuoteLeadTimeDays: Number.isFinite(Number(fallbackConfig.autoQuoteLeadTimeDays))
          ? Math.max(1, Math.round(Number(fallbackConfig.autoQuoteLeadTimeDays)))
          : 3,
        rfqDefaultExpiryDays: Number.isFinite(Number(fallbackConfig.rfqDefaultExpiryDays))
          ? Math.max(1, Number(fallbackConfig.rfqDefaultExpiryDays))
          : 7,
      };
    }

    if (error) {
      if (error.code === 'PGRST116') {
        const marginSettings = await this.getMarginSettings();
        const defaultMargin = marginSettings.find((setting) => setting.isDefault)?.marginPercent ?? 10;
        const fallbackConfig = this.readSystemConfigFallback();
        return {
          autoQuoteDelayMinutes: Number.isFinite(Number(fallbackConfig.autoQuoteDelayMinutes))
            ? Math.max(1, Number(fallbackConfig.autoQuoteDelayMinutes))
            : 30,
          defaultMarginPercent: Number.isFinite(Number(fallbackConfig.defaultMarginPercent))
            ? Number(fallbackConfig.defaultMarginPercent)
            : defaultMargin,
          autoQuoteEnabled: typeof fallbackConfig.autoQuoteEnabled === 'boolean' ? fallbackConfig.autoQuoteEnabled : true,
          autoQuoteIncludeLimitedStock: typeof fallbackConfig.autoQuoteIncludeLimitedStock === 'boolean'
            ? fallbackConfig.autoQuoteIncludeLimitedStock
            : false,
          autoQuoteLeadTimeDays: Number.isFinite(Number(fallbackConfig.autoQuoteLeadTimeDays))
            ? Math.max(1, Math.round(Number(fallbackConfig.autoQuoteLeadTimeDays)))
            : 3,
          rfqDefaultExpiryDays: Number.isFinite(Number(fallbackConfig.rfqDefaultExpiryDays))
            ? Math.max(1, Number(fallbackConfig.rfqDefaultExpiryDays))
            : 7,
        };
      }
      logger.error('Error fetching system settings:', error);
      throw new Error(`Failed to fetch system settings: ${error.message || 'Unknown error'}`);
    }

    if (!data) {
      const marginSettings = await this.getMarginSettings();
      const defaultMargin = marginSettings.find((setting) => setting.isDefault)?.marginPercent ?? 10;
      const fallbackConfig = this.readSystemConfigFallback();
      return {
        autoQuoteDelayMinutes: Number.isFinite(Number(fallbackConfig.autoQuoteDelayMinutes))
          ? Math.max(1, Number(fallbackConfig.autoQuoteDelayMinutes))
          : 30,
        defaultMarginPercent: Number.isFinite(Number(fallbackConfig.defaultMarginPercent))
          ? Number(fallbackConfig.defaultMarginPercent)
          : defaultMargin,
        autoQuoteEnabled: typeof fallbackConfig.autoQuoteEnabled === 'boolean' ? fallbackConfig.autoQuoteEnabled : true,
        autoQuoteIncludeLimitedStock: typeof fallbackConfig.autoQuoteIncludeLimitedStock === 'boolean'
          ? fallbackConfig.autoQuoteIncludeLimitedStock
          : false,
        autoQuoteLeadTimeDays: Number.isFinite(Number(fallbackConfig.autoQuoteLeadTimeDays))
          ? Math.max(1, Math.round(Number(fallbackConfig.autoQuoteLeadTimeDays)))
          : 3,
        rfqDefaultExpiryDays: Number.isFinite(Number(fallbackConfig.rfqDefaultExpiryDays))
          ? Math.max(1, Number(fallbackConfig.rfqDefaultExpiryDays))
          : 7,
      };
    }

    const fallbackConfig = this.readSystemConfigFallback();
    return {
      autoQuoteDelayMinutes: Number.isFinite(Number((data as any).auto_quote_delay_minutes))
        ? Math.max(1, Number((data as any).auto_quote_delay_minutes))
        : (
          Number.isFinite(Number(fallbackConfig.autoQuoteDelayMinutes))
            ? Math.max(1, Number(fallbackConfig.autoQuoteDelayMinutes))
            : 30
        ),
      defaultMarginPercent: Number.isFinite(Number((data as any).default_margin_percent))
        ? Number((data as any).default_margin_percent)
        : (
          Number.isFinite(Number(fallbackConfig.defaultMarginPercent))
            ? Number(fallbackConfig.defaultMarginPercent)
            : 10
        ),
      autoQuoteEnabled: typeof (data as any).auto_quote_enabled === 'boolean'
        ? (data as any).auto_quote_enabled
        : fallbackConfig.autoQuoteEnabled,
      autoQuoteIncludeLimitedStock: typeof (data as any).auto_quote_include_limited_stock === 'boolean'
        ? (data as any).auto_quote_include_limited_stock
        : fallbackConfig.autoQuoteIncludeLimitedStock,
      autoQuoteLeadTimeDays: Number.isFinite(Number((data as any).auto_quote_lead_time_days))
        ? Math.max(1, Math.round(Number((data as any).auto_quote_lead_time_days)))
        : (
          Number.isFinite(Number(fallbackConfig.autoQuoteLeadTimeDays))
            ? Math.max(1, Math.round(Number(fallbackConfig.autoQuoteLeadTimeDays)))
            : 3
        ),
      rfqDefaultExpiryDays: Number.isFinite(Number((data as any).rfq_default_expiry_days))
        ? Math.max(1, Number((data as any).rfq_default_expiry_days))
        : (
          Number.isFinite(Number(fallbackConfig.rfqDefaultExpiryDays))
            ? Math.max(1, Number(fallbackConfig.rfqDefaultExpiryDays))
            : undefined
        ),
    };
  }

  async updateSystemConfig(config: {
    autoQuoteDelayMinutes: number;
    defaultMarginPercent: number;
    autoQuoteEnabled?: boolean;
    autoQuoteIncludeLimitedStock?: boolean;
    autoQuoteLeadTimeDays?: number;
    rfqDefaultExpiryDays?: number;
  }): Promise<boolean> {
    const normalizedMargin = this.normalizeMarginPercent(config.defaultMarginPercent);
    if (normalizedMargin === null) {
      logger.error('Error updating system settings: default margin must be between 0 and 100');
      return false;
    }

    const normalizedDelay = Math.max(1, Math.floor(Number(config.autoQuoteDelayMinutes) || 0));

    const systemSettingsTableProbe = await (supabase as any)
      .from('system_settings')
      .select('id')
      .limit(1);
    if (this.isMissingRelationError(systemSettingsTableProbe.error, 'system_settings')) {
      logger.warn('system_settings table not available; persisting only default margin to margin_settings');
      this.persistSystemConfigFallback({
        autoQuoteDelayMinutes: normalizedDelay,
        defaultMarginPercent: normalizedMargin,
        autoQuoteEnabled: config.autoQuoteEnabled,
        autoQuoteIncludeLimitedStock: config.autoQuoteIncludeLimitedStock,
        autoQuoteLeadTimeDays: config.autoQuoteLeadTimeDays,
        rfqDefaultExpiryDays: config.rfqDefaultExpiryDays,
      });
      return this.updateMarginSetting(null, normalizedMargin);
    }

    let targetSystemConfigId = 1;

    const latestRowResult = await (supabase as any)
      .from('system_settings')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1);

    let latestRowError = latestRowResult.error;
    let latestRows = latestRowResult.data as Array<{ id: number }> | null;

    if (latestRowError && /column "updated_at" of relation "system_settings" does not exist/i.test(latestRowError.message || '')) {
      const fallbackLatestResult = await (supabase as any)
        .from('system_settings')
        .select('id')
        .limit(1);
      latestRowError = fallbackLatestResult.error;
      latestRows = fallbackLatestResult.data as Array<{ id: number }> | null;
    }

    if (latestRowError) {
      logger.error('Error fetching existing system settings row:', latestRowError);
      return false;
    }

    if ((latestRows || []).length > 0 && Number.isFinite(Number(latestRows?.[0]?.id))) {
      targetSystemConfigId = Number(latestRows?.[0]?.id);
    }

    const missingColumnRegex = ApiService.MISSING_SYSTEM_SETTINGS_COLUMN_REGEX;
    const pruneMissingSystemColumn = (
      payload: Record<string, unknown>,
      error: { message?: string }
    ): Record<string, unknown> | null => {
      const match = missingColumnRegex.exec(error?.message || '');
      if (!match) return null;
      const columnName = match[1];
      if (!Object.prototype.hasOwnProperty.call(payload, columnName)) return null;
      const next = { ...payload };
      delete next[columnName];
      return next;
    };

    let corePayload: Record<string, unknown> = {
      id: targetSystemConfigId,
      auto_quote_delay_minutes: normalizedDelay,
      default_margin_percent: normalizedMargin,
      updated_at: new Date().toISOString()
    };

    while (Object.keys(corePayload).length > 0) {
      const { error } = await (supabase as any)
        .from('system_settings')
        .upsert(corePayload);

      if (!error) {
        break;
      }

      const nextPayload = pruneMissingSystemColumn(corePayload, error);
      if (nextPayload) {
        corePayload = nextPayload;
        continue;
      }

      logger.error('Error updating system settings:', error);
      return false;
    }

    const optionalUpdates: Record<string, unknown> = {};
    if (typeof config.autoQuoteEnabled === 'boolean') {
      optionalUpdates.auto_quote_enabled = config.autoQuoteEnabled;
    }
    if (typeof config.autoQuoteIncludeLimitedStock === 'boolean') {
      optionalUpdates.auto_quote_include_limited_stock = config.autoQuoteIncludeLimitedStock;
    }
    if (Number.isFinite(Number(config.autoQuoteLeadTimeDays))) {
      optionalUpdates.auto_quote_lead_time_days = Math.max(1, Math.round(Number(config.autoQuoteLeadTimeDays)));
    }
    if (Number.isFinite(Number(config.rfqDefaultExpiryDays))) {
      optionalUpdates.rfq_default_expiry_days = Math.max(1, Number(config.rfqDefaultExpiryDays));
    }

    if (Object.keys(optionalUpdates).length > 0) {
      for (const [field, value] of Object.entries(optionalUpdates)) {
        const { error: optionalUpdateError } = await (supabase as any)
          .from('system_settings')
          .update({ [field]: value })
          .eq('id', targetSystemConfigId);
        if (!optionalUpdateError) continue;

        if (missingColumnRegex.test(optionalUpdateError.message || '')) {
          logger.warn('Optional system settings field is not available yet', {
            field,
            error: optionalUpdateError.message,
          });
          continue;
        }

        logger.error('Error updating optional system settings field', {
          field,
          error: optionalUpdateError,
        });
        return false;
      }
    }

    this.persistSystemConfigFallback({
      autoQuoteDelayMinutes: normalizedDelay,
      defaultMarginPercent: normalizedMargin,
      autoQuoteEnabled: config.autoQuoteEnabled,
      autoQuoteIncludeLimitedStock: config.autoQuoteIncludeLimitedStock,
      autoQuoteLeadTimeDays: config.autoQuoteLeadTimeDays,
      rfqDefaultExpiryDays: config.rfqDefaultExpiryDays,
    });

    return true;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async syncQuoteItems(quoteId: string, rfqId: string, quoteItems: QuoteItem[]): Promise<void> {
    if (!quoteId || !rfqId) return;

    try {
      const { data: rfqItems, error: rfqItemsError } = await (supabase as any)
        .from('rfq_items')
        .select('id, product_id')
        .eq('rfq_id', rfqId)
        .order('created_at', { ascending: true });

      if (rfqItemsError) {
        logger.warn('Skipping quote_items sync: failed to load rfq_items', {
          quoteId,
          rfqId,
          error: rfqItemsError.message,
        });
        return;
      }

      const rfqItemIdsByProduct = new Map<string, string[]>();
      (rfqItems || []).forEach((item: { id: string; product_id: string }) => {
        const list = rfqItemIdsByProduct.get(item.product_id) || [];
        list.push(item.id);
        rfqItemIdsByProduct.set(item.product_id, list);
      });

      const rows = quoteItems
        .map((item, index) => {
          const productId = String(item.productId || '').trim();
          if (!productId) return null;

          const rfqItemCandidates = rfqItemIdsByProduct.get(productId) || [];
          const rfqItemId = rfqItemCandidates.shift() || null;
          if (!rfqItemId) {
            logger.warn('Skipping quote item: no matching rfq_item found', {
              quoteId,
              rfqId,
              productId,
              index,
            });
            return null;
          }

          const unitPrice = Number(item.unitPrice || 0);
          const quantity = Math.max(1, Number(item.quantity || 1));
          const lineTotal = Number(item.lineTotal || unitPrice * quantity);
          const isQuoted =
            typeof (item as any).isQuoted === 'boolean'
              ? Boolean((item as any).isQuoted)
              : unitPrice > 0;

          return {
            quote_id: quoteId,
            rfq_item_id: rfqItemId,
            product_id: productId,
            unit_price: Math.max(unitPrice, 0),
            quantity,
            final_unit_price: Math.max(unitPrice, 0),
            final_line_total: Math.max(lineTotal, 0),
            alternative_product_id: (item as any).alternativeProductId || null,
            is_quoted: isQuoted,
            notes: item.notes || null,
          };
        })
        .filter(Boolean);

      const { error: deleteError } = await (supabase as any)
        .from('quote_items')
        .delete()
        .eq('quote_id', quoteId);

      if (deleteError) {
        logger.warn('Existing quote_items cleanup failed', {
          quoteId,
          error: deleteError.message,
        });
      }

      if (rows.length === 0) {
        return;
      }

      const { error: insertError } = await (supabase as any)
        .from('quote_items')
        .insert(rows);

      if (insertError) {
        logger.warn('quote_items insert failed', {
          quoteId,
          error: insertError.message,
        });
      }
    } catch (error) {
      logger.warn('quote_items sync skipped due to runtime error', {
        quoteId,
        rfqId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async recalculateQuoteItemFinalPricing(quoteId: string, marginPercent: number): Promise<void> {
    try {
      const { data: quoteItemRows, error: loadError } = await (supabase as any)
        .from('quote_items')
        .select('id, unit_price, quantity')
        .eq('quote_id', quoteId);

      if (loadError) {
        logger.warn('Unable to load quote_items for margin recalculation', {
          quoteId,
          error: loadError.message,
        });
        return;
      }

      const multiplier = 1 + (Number(marginPercent || 0) / 100);
      for (const row of quoteItemRows || []) {
        const baseUnitPrice = Number(row.unit_price ?? 0);
        const quantity = Math.max(1, Number(row.quantity ?? 1));
        const finalUnitPrice = Math.round(baseUnitPrice * multiplier * 100) / 100;
        const finalLineTotal = Math.round(finalUnitPrice * quantity * 100) / 100;

        const { error: updateError } = await (supabase as any)
          .from('quote_items')
          .update({
            final_unit_price: finalUnitPrice,
            final_line_total: finalLineTotal,
          })
          .eq('id', row.id);

        if (updateError) {
          logger.warn('Failed to recalculate quote_item pricing', {
            quoteId,
            quoteItemId: row.id,
            error: updateError.message,
          });
        }
      }
    } catch (error) {
      logger.warn('Quote item margin recalculation skipped due to runtime error', {
        quoteId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async acceptQuoteFallback(id: string): Promise<{ quote: Quote | null; order: Order | null }> {
    const { data: quoteRow, error: quoteError } = await (supabase as any)
      .from('quotes')
      .select('id, rfq_id, supplier_id, supplier_price, final_price')
      .eq('id', id)
      .single();

    if (quoteError || !quoteRow) {
      logger.error('Fallback quote acceptance failed to load quote', { quoteId: id, error: quoteError });
      throw quoteError || new Error('Quote not found');
    }

    const { data: existingOrderRow, error: existingOrderError } = await (supabase as any)
      .from('orders')
      .select('*')
      .eq('quote_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingOrderError && existingOrderRow) {
      await (supabase as any)
        .from('quotes')
        .update({ status: 'ACCEPTED' })
        .eq('id', id);

      return {
        quote: await this.getQuoteById(id),
        order: this.mapDbOrderToOrder(existingOrderRow),
      };
    }

    const { data: rfqRow, error: rfqError } = await (supabase as any)
      .from('rfqs')
      .select('id, client_id')
      .eq('id', quoteRow.rfq_id)
      .single();

    if (rfqError || !rfqRow) {
      logger.error('Fallback quote acceptance failed to load RFQ', {
        quoteId: id,
        rfqId: quoteRow.rfq_id,
        error: rfqError,
      });
      throw rfqError || new Error('RFQ not found');
    }
    const orderAmount = Number(quoteRow.final_price ?? quoteRow.supplier_price ?? 0);
    if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
      throw new Error('Invalid quote amount');
    }

    const { data: clientFinancialRow, error: clientFinancialError } = await (supabase as any)
      .from('users')
      .select('id, credit_limit, credit_used, current_balance')
      .eq('id', rfqRow.client_id)
      .single();

    if (clientFinancialError || !clientFinancialRow) {
      logger.error('Fallback quote acceptance failed to load client financial record', {
        quoteId: id,
        clientId: rfqRow.client_id,
        error: clientFinancialError,
      });
      throw clientFinancialError || new Error('Client financial profile not found');
    }

    const currentCreditLimit = Math.max(0, Number((clientFinancialRow as any).credit_limit ?? 0));
    const currentCreditUsed = Math.max(
      0,
      Number((clientFinancialRow as any).credit_used ?? (clientFinancialRow as any).current_balance ?? 0)
    );
    const currentBalanceValue = Number((clientFinancialRow as any).current_balance);
    const normalizedCurrentBalance = Number.isFinite(currentBalanceValue)
      ? Math.max(0, Math.abs(currentBalanceValue))
      : currentCreditUsed;
    const effectiveCreditUsed = Math.max(currentCreditUsed, normalizedCurrentBalance);
    const availableCredit = Math.max(0, currentCreditLimit - effectiveCreditUsed);

    if (orderAmount > availableCredit) {
      throw new Error('Insufficient credit');
    }

    const reservedCreditUsed = Math.round((effectiveCreditUsed + orderAmount) * 100) / 100;
    const reservedCurrentBalance = reservedCreditUsed;

    const { data: creditUpdateResult, error: reserveCreditError } = await (supabase as any)
      .from('users')
      .update({
        credit_used: reservedCreditUsed,
        current_balance: reservedCurrentBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rfqRow.client_id)
      .select('id')
      .maybeSingle();

    if (reserveCreditError || !creditUpdateResult) {
      logger.error('Fallback quote acceptance failed to reserve client credit', {
        quoteId: id,
        clientId: rfqRow.client_id,
        error: reserveCreditError,
      });
      throw reserveCreditError || new Error('Failed to reserve client credit');
    }

    const buildOrderPayload = (statusValue: string): Record<string, unknown> => ({
      quote_id: id,
      client_id: rfqRow.client_id,
      supplier_id: quoteRow.supplier_id,
      amount: orderAmount,
      total_amount: orderAmount,
      status: this.toDbOrderStatus(statusValue),
      date: new Date().toISOString().split('T')[0],
    });

    const insertOrderWithCompat = async (statusValue: string) => {
      let payload = buildOrderPayload(statusValue);
      while (Object.keys(payload).length > 0) {
        const result = await (supabase as any)
          .from('orders')
          .insert(payload)
          .select('*')
          .single();

        if (!result.error) {
          return result;
        }

        const nextPayload = this.pruneMissingOrderUpdateColumn(payload, result.error || {});
        if (nextPayload) {
          payload = nextPayload;
          continue;
        }

        return result;
      }

      return {
        data: null,
        error: new Error('No compatible order insert columns available'),
      };
    };

    let orderInsertResult = await insertOrderWithCompat('PENDING_PO');

    if (orderInsertResult.error && /invalid input value for enum/i.test(orderInsertResult.error.message || '')) {
      orderInsertResult = await insertOrderWithCompat('PENDING_PAYMENT');
    }

    if (orderInsertResult.error || !orderInsertResult.data) {
      logger.error('Fallback quote acceptance failed to create order', {
        quoteId: id,
        error: orderInsertResult.error,
      });
      await (supabase as any)
        .from('users')
        .update({
          credit_used: currentCreditUsed,
          current_balance: normalizedCurrentBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rfqRow.client_id);
      throw orderInsertResult.error || new Error('Failed to create order');
    }

    const { error: acceptError } = await (supabase as any)
      .from('quotes')
      .update({ status: 'ACCEPTED' })
      .eq('id', id);

    if (acceptError) {
      logger.error('Fallback quote acceptance failed to update quote status', { quoteId: id, error: acceptError });
      throw acceptError;
    }

    const { error: rejectOthersError } = await (supabase as any)
      .from('quotes')
      .update({ status: 'REJECTED' })
      .eq('rfq_id', quoteRow.rfq_id)
      .neq('id', id)
      .in('status', ['SENT_TO_CLIENT', 'PENDING_ADMIN']);

    if (rejectOthersError) {
      logger.warn('Fallback quote acceptance could not reject other quotes', {
        quoteId: id,
        rfqId: quoteRow.rfq_id,
        error: rejectOthersError.message,
      });
    }

    const { error: closeRfqError } = await (supabase as any)
      .from('rfqs')
      .update({ status: 'CLOSED' })
      .eq('id', quoteRow.rfq_id);

    if (closeRfqError) {
      logger.warn('Fallback quote acceptance failed to close RFQ', {
        quoteId: id,
        rfqId: quoteRow.rfq_id,
        error: closeRfqError.message,
      });
    }

    return {
      quote: await this.getQuoteById(id),
      order: this.mapDbOrderToOrder(orderInsertResult.data),
    };
  }

  private mapDbCreditLimitAdjustment(dbAdjustment: any): CreditLimitAdjustment {
    return {
      id: dbAdjustment.adjustment_id || dbAdjustment.id,
      clientId: dbAdjustment.adjustment_client_id || dbAdjustment.client_id,
      adminId: dbAdjustment.adjustment_admin_id || dbAdjustment.admin_id,
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
    const rawCreditUsed = Number(dbUser.credit_used);
    const rawCurrentBalance = Number(dbUser.current_balance);
    const derivedCreditUsed = Number.isFinite(rawCurrentBalance)
      ? Math.max(0, Math.abs(rawCurrentBalance))
      : undefined;
    const paymentSettings = dbUser.payment_settings && typeof dbUser.payment_settings === 'object'
      ? {
        bankName: dbUser.payment_settings.bankName || dbUser.payment_settings.bank_name || undefined,
        accountHolder: dbUser.payment_settings.accountHolder || dbUser.payment_settings.account_holder || undefined,
        iban: dbUser.payment_settings.iban || undefined,
        swiftCode: dbUser.payment_settings.swiftCode || dbUser.payment_settings.swift_code || undefined,
      }
      : undefined;
    const kycDocuments = dbUser.kyc_documents && typeof dbUser.kyc_documents === 'object'
      ? dbUser.kyc_documents as Record<string, string>
      : undefined;
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: this.normalizeDbRole(dbUser.role),
      companyName: dbUser.company_name,
      verified: dbUser.verified,
      publicId: dbUser.public_id,
      rating: dbUser.rating,
      status: dbUser.status,
      kycStatus: dbUser.kyc_status,
      dateJoined: dbUser.date_joined,
      creditLimit: dbUser.credit_limit ?? undefined,
      clientMargin: dbUser.client_margin ?? undefined,
      creditUsed: Number.isFinite(rawCreditUsed) ? Math.max(0, rawCreditUsed) : derivedCreditUsed,
      phone: dbUser.phone ?? undefined,
      paymentSettings,
      kycDocuments,
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
      supplierPrice: dbProduct.cost_price ?? dbProduct.supplier_price,
      retailPrice: dbProduct.retail_price ?? undefined,
      marginPercent: dbProduct.margin_percent ?? undefined,
      sku: dbProduct.sku,
      stock: dbProduct.stock ?? dbProduct.stock_quantity ?? undefined,
      brand: dbProduct.brand ?? undefined,
      createdAt: dbProduct.created_at || undefined,
      updatedAt: dbProduct.updated_at || undefined,
    };
  }

  private mapDbRfqToRfq(dbRfq: any): RFQ {
    const expiresAt = dbRfq.expires_at || dbRfq.valid_until || null;
    const rfqLevelFlexibility = this.mapDbRfqFlexibility(dbRfq.flexibility);
    return {
      id: dbRfq.id,
      clientId: dbRfq.client_id,
      items: (dbRfq.rfq_items || []).map((item: any) => ({
        productId: item.product_id,
        quantity: item.quantity,
        notes: item.notes || '',
        flexibility: this.mapDbRfqFlexibility(item.flexibility ?? item.item_flexibility) || rfqLevelFlexibility || undefined,
      })),
      status: dbRfq.status,
      date: dbRfq.date,
      createdAt: dbRfq.created_at || dbRfq.date,
      autoQuoteTriggered: dbRfq.auto_quote_triggered ?? false,
      validUntil: expiresAt || undefined,
      expiryDate: expiresAt ? String(expiresAt).split('T')[0] : undefined,
      deliveryLocation: dbRfq.delivery_location || undefined,
      desiredDeliveryDate: dbRfq.desired_delivery_date || undefined,
      flexibility: rfqLevelFlexibility || undefined,
      generalRequirements: dbRfq.general_requirements || undefined,
      title: dbRfq.title || undefined,
    };
  }

  private mapRfqFlexibilityToDb(
    flexibility?: RFQ['flexibility']
  ): 'exact_match' | 'open_to_equivalent' | 'open_to_alternatives' | null {
    switch (flexibility) {
      case 'OPEN_TO_ALTERNATIVES':
        return 'open_to_alternatives';
      case 'OPEN_TO_EQUIVALENT':
        return 'open_to_equivalent';
      case 'EXACT':
        return 'exact_match';
      default:
        return null;
    }
  }

  private mapDbRfqFlexibility(
    flexibility: unknown
  ): RFQ['flexibility'] | null {
    if (typeof flexibility !== 'string') return null;
    const normalized = flexibility.toLowerCase();
    if (normalized === 'open_to_alternatives') return 'OPEN_TO_ALTERNATIVES';
    if (normalized === 'open_to_equivalent') return 'OPEN_TO_EQUIVALENT';
    if (normalized === 'exact_match') return 'EXACT';
    return null;
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
      status: dbQuote.status,
      type: dbQuote.type === 'auto' ? 'auto' : 'custom',
      notes: dbQuote.notes || undefined,
      shippingCost: dbQuote.shipping_cost ?? undefined,
      tax: dbQuote.tax ?? undefined,
      quoteItems: Array.isArray(dbQuote.quote_items)
        ? dbQuote.quote_items
          .filter((item: any) => item.is_quoted !== false)
          .map((item: any) => ({
            id: item.id,
            productId: item.product_id,
            productName: item.product_name || item.product?.name || item.product_id,
            brand: item.product?.brand || undefined,
            unitPrice: Number(item.final_unit_price ?? item.unit_price ?? 0),
            quantity: Number(item.quantity ?? 0),
            lineTotal: Number(item.final_line_total ?? item.line_total ?? 0),
            leadTime: item.lead_time || undefined,
            notes: item.notes || undefined,
            isAlternative: Boolean(item.alternative_product_id),
            alternativeProductName: item.alternative_product?.name || undefined,
          }))
        : undefined,
      createdAt: dbQuote.created_at || undefined,
      updatedAt: dbQuote.updated_at || undefined,
    };
  }

  private normalizeOrderStatus(rawStatus: unknown): OrderStatus {
    if (typeof rawStatus !== 'string') return OrderStatus.PENDING_PAYMENT;

    const normalized = rawStatus.trim();
    if (!normalized) return OrderStatus.PENDING_PAYMENT;

    const directMatch = (Object.values(OrderStatus) as string[]).find((value) => value === normalized);
    if (directMatch) {
      return directMatch as OrderStatus;
    }

    const key = normalized.toUpperCase().replace(/\s+/g, '_');
    const normalizedMap: Record<string, OrderStatus> = {
      IN_TRANSIT: OrderStatus.IN_TRANSIT,
      DELIVERED: OrderStatus.DELIVERED,
      CANCELLED: OrderStatus.CANCELLED,
      PENDING_PO: OrderStatus.PENDING_ADMIN_CONFIRMATION,
      READY_FOR_PICKUP: OrderStatus.READY_FOR_PICKUP,
      PICKUP_SCHEDULED: OrderStatus.PICKUP_SCHEDULED,
      PICKED_UP: OrderStatus.PICKED_UP,
      OUT_FOR_DELIVERY: OrderStatus.OUT_FOR_DELIVERY,
      SHIPPED: OrderStatus.SHIPPED,
      COMPLETED: OrderStatus.COMPLETED,
      DISPUTED: OrderStatus.DISPUTED,
      REFUNDED: OrderStatus.REFUNDED,
      CONFIRMED: OrderStatus.CONFIRMED,
      PROCESSING: OrderStatus.PROCESSING,
      PENDING_PAYMENT: OrderStatus.PENDING_PAYMENT,
      AWAITING_CONFIRMATION: OrderStatus.AWAITING_CONFIRMATION,
      PAYMENT_CONFIRMED: OrderStatus.PAYMENT_CONFIRMED,
      PENDING_ADMIN_CONFIRMATION: OrderStatus.PENDING_ADMIN_CONFIRMATION,
    };

    return normalizedMap[key] || OrderStatus.PENDING_PAYMENT;
  }

  private toDbOrderStatus(status: Order['status'] | string): DbOrderStatus {
    const normalized = this.normalizeOrderStatus(status);
    const mappedStatuses: Partial<Record<OrderStatus, DbOrderStatus>> = {
      [OrderStatus.PICKED_UP]: OrderStatus.OUT_FOR_DELIVERY,
      [OrderStatus.COMPLETED]: OrderStatus.DELIVERED,
      [OrderStatus.DISPUTED]: OrderStatus.CANCELLED,
      [OrderStatus.REFUNDED]: OrderStatus.CANCELLED,
      // The DB enum uses PENDING_PO; the app model uses PENDING_ADMIN_CONFIRMATION
      [OrderStatus.PENDING_ADMIN_CONFIRMATION]: 'PENDING_PO' as DbOrderStatus,
    };

    return mappedStatuses[normalized] || normalized;
  }

  private mapDbOrderToOrder(dbOrder: any): Order {
    const normalizedStatus = this.normalizeOrderStatus(dbOrder.status);
    const rawAmount = Number(
      dbOrder.amount
      ?? dbOrder.total_amount
      ?? dbOrder.total
      ?? dbOrder.final_amount
      ?? 0
    );

    return {
      id: dbOrder.id,
      quoteId: dbOrder.quote_id || undefined,
      system_po_number: dbOrder.system_po_number || undefined,
      clientId: dbOrder.client_id,
      supplierId: dbOrder.supplier_id,
      amount: Number.isFinite(rawAmount) ? rawAmount : 0,
      status: normalizedStatus,
      date: dbOrder.date || dbOrder.created_at || new Date().toISOString(),
      paymentReference: dbOrder.payment_reference || undefined,
      paymentConfirmedAt: dbOrder.payment_confirmed_at || undefined,
      paymentConfirmedBy: dbOrder.payment_confirmed_by || undefined,
      paymentNotes: dbOrder.payment_notes || undefined,
      paymentReceiptUrl: dbOrder.payment_receipt_url || undefined,
      paymentSubmittedAt: dbOrder.payment_submitted_at || undefined,
      paymentLinkUrl: dbOrder.payment_link_url || undefined,
      paymentLinkSentAt: dbOrder.payment_link_sent_at || undefined,
      system_po_generated: dbOrder.system_po_generated || false,
      client_po_uploaded: dbOrder.client_po_uploaded || false,
      admin_verified: dbOrder.admin_verified || false,
      admin_verified_by: dbOrder.admin_verified_by || undefined,
      admin_verified_at: dbOrder.admin_verified_at || undefined,
      not_test_order_confirmed_at: dbOrder.not_test_order_confirmed_at || undefined,
      payment_terms_confirmed_at: dbOrder.payment_terms_confirmed_at || undefined,
      client_po_confirmation_submitted_at: dbOrder.client_po_confirmation_submitted_at || undefined,
      items: dbOrder.items || undefined,
      pickupDetails: dbOrder.pickup_details || undefined,
      // Map shipment details
      shipment: dbOrder.shipment_details || undefined,
      createdAt: dbOrder.created_at || undefined,
      updatedAt: dbOrder.updated_at || undefined
    };
  }
}

export const api = ApiService.getInstance();
