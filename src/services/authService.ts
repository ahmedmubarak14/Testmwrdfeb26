// Supabase Authentication Service
// Handles user authentication, registration, and session management

import { supabase, auth } from '../lib/supabase';
import { User, UserRole } from '../types/types';
import type { AuthError, Session } from '@supabase/supabase-js';
import { appConfig } from '../config/appConfig';
import { logger } from '../utils/logger';

const PROFILE_PICTURE_BUCKET = 'profile-pictures';
const PROFILE_PICTURE_STORAGE_REF_PREFIX = `storage://${PROFILE_PICTURE_BUCKET}/`;
const PROFILE_PICTURE_SIGNED_URL_TTL_SECONDS = 60 * 60;
const LOGIN_ATTEMPTS_STORAGE_KEY = 'mwrd_login_attempts';

type RateLimitAction = 'check_login_attempt' | 'record_failed_login' | 'reset_login_attempts';

interface RateLimitFunctionPayload {
  action: RateLimitAction;
  email: string;
}

interface RateLimitFunctionResponse {
  allowed?: boolean;
  message?: string;
  retryAfterSeconds?: number;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  session?: Session;
  error?: string;
}

export interface ActionResponse {
  success: boolean;
  error?: string;
}

export interface SignUpData {
  email: string;
  password: string;
  name: string;
  companyName: string;
  // SECURITY: Role is NOT accepted from client
  // All new signups default to CLIENT role via database trigger
  // Role can only be changed by ADMIN via admin panel
}

class AuthService {
  private static instance: AuthService;
  private readonly loginAttemptWindowMs = 15 * 60 * 1000;
  private readonly maxLoginAttemptsPerWindow = 8;
  private loginAttemptsByEmail = new Map<string, number[]>();
  private hasWarnedAboutMissingRateLimitFunction = false;

  private constructor() {
    this.hydrateLoginAttemptsFromStorage();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hydrateLoginAttemptsFromStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(LOGIN_ATTEMPTS_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, number[]>;
      Object.entries(parsed).forEach(([email, timestamps]) => {
        if (Array.isArray(timestamps)) {
          this.loginAttemptsByEmail.set(
            email,
            timestamps.filter((value) => Number.isFinite(value))
          );
        }
      });
    } catch (error) {
      logger.warn('Unable to hydrate login attempts from storage', error);
    }
  }

  private persistLoginAttempts(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const serialized: Record<string, number[]> = {};
    this.loginAttemptsByEmail.forEach((timestamps, email) => {
      if (timestamps.length > 0) {
        serialized[email] = timestamps;
      }
    });

    try {
      window.localStorage.setItem(LOGIN_ATTEMPTS_STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      logger.warn('Unable to persist login attempts to storage', error);
    }
  }

  private pruneAttempts(email: string): number[] {
    const now = Date.now();
    const attempts = (this.loginAttemptsByEmail.get(email) || []).filter(
      (timestamp) => now - timestamp < this.loginAttemptWindowMs
    );
    this.loginAttemptsByEmail.set(email, attempts);
    this.persistLoginAttempts();
    return attempts;
  }

  private canAttemptLogin(email: string): boolean {
    const attempts = this.pruneAttempts(email);
    return attempts.length < this.maxLoginAttemptsPerWindow;
  }

  private recordFailedLoginAttempt(email: string): void {
    const attempts = this.pruneAttempts(email);
    attempts.push(Date.now());
    this.loginAttemptsByEmail.set(email, attempts);
    this.persistLoginAttempts();
  }

  private resetLoginAttempts(email: string): void {
    this.loginAttemptsByEmail.delete(email);
    this.persistLoginAttempts();
  }

  private isLikelyMissingFunctionError(error: unknown): boolean {
    const message = String((error as any)?.message || '').toLowerCase();
    return message.includes('not found')
      || message.includes('404')
      || message.includes('no route matched');
  }

  private formatRateLimitError(retryAfterSeconds?: number): string {
    if (!retryAfterSeconds || retryAfterSeconds <= 0) {
      return 'Too many login attempts. Please wait and try again.';
    }

    const minutes = Math.ceil(retryAfterSeconds / 60);
    if (minutes <= 1) {
      return 'Too many login attempts. Please wait about 1 minute and try again.';
    }

    return `Too many login attempts. Please wait about ${minutes} minutes and try again.`;
  }

  private async invokeRateLimitFunction(payload: RateLimitFunctionPayload): Promise<{
    data: RateLimitFunctionResponse | null;
    error: unknown;
  }> {
    const { data, error } = await supabase.functions.invoke(
      appConfig.auth.rateLimitFunctionName,
      { body: payload }
    );

    return {
      data: (data as RateLimitFunctionResponse | null) ?? null,
      error: error ?? null,
    };
  }

  private async checkServerRateLimit(email: string): Promise<{ allowed: boolean; error?: string }> {
    if (!appConfig.auth.enableRateLimit || !appConfig.supabase.isConfigured) {
      return { allowed: true };
    }

    const { data, error } = await this.invokeRateLimitFunction({
      action: 'check_login_attempt',
      email,
    });

    if (error) {
      if (this.isLikelyMissingFunctionError(error)) {
        if (!this.hasWarnedAboutMissingRateLimitFunction) {
          logger.warn(
            `Rate limit function "${appConfig.auth.rateLimitFunctionName}" is not deployed. Falling back to local throttling.`
          );
          this.hasWarnedAboutMissingRateLimitFunction = true;
        }
        return { allowed: true };
      }

      logger.warn('Server-side rate limit check failed. Falling back to local throttling.', error);
      return { allowed: true };
    }

    if (data?.allowed === false) {
      return {
        allowed: false,
        error: data.message || this.formatRateLimitError(data.retryAfterSeconds),
      };
    }

    return { allowed: true };
  }

  private async notifyServerOfFailedLogin(email: string): Promise<void> {
    if (!appConfig.auth.enableRateLimit || !appConfig.supabase.isConfigured) {
      return;
    }

    const { error } = await this.invokeRateLimitFunction({
      action: 'record_failed_login',
      email,
    });

    if (error && !this.isLikelyMissingFunctionError(error)) {
      logger.warn('Failed to record server-side login attempt.', error);
    }
  }

  private async notifyServerOfSuccessfulLogin(email: string): Promise<void> {
    if (!appConfig.auth.enableRateLimit || !appConfig.supabase.isConfigured) {
      return;
    }

    const { error } = await this.invokeRateLimitFunction({
      action: 'reset_login_attempts',
      email,
    });

    if (error && !this.isLikelyMissingFunctionError(error)) {
      logger.warn('Failed to reset server-side login attempts.', error);
    }
  }

  private extractProfilePictureStoragePath(
    dbUser: any,
    authMetadata?: Record<string, unknown> | null
  ): string | undefined {
    if (typeof dbUser.profile_picture_path === 'string' && dbUser.profile_picture_path.length > 0) {
      return dbUser.profile_picture_path;
    }

    const metadataPath = authMetadata?.profile_picture_path;
    if (typeof metadataPath === 'string' && metadataPath.length > 0) {
      return metadataPath;
    }

    const legacyUrl =
      (typeof dbUser.profile_picture === 'string' && dbUser.profile_picture.length > 0
        ? dbUser.profile_picture
        : undefined) ||
      (typeof dbUser.profilePicture === 'string' && dbUser.profilePicture.length > 0
        ? dbUser.profilePicture
        : undefined) ||
      (typeof authMetadata?.profile_picture_url === 'string' && authMetadata.profile_picture_url.length > 0
        ? authMetadata.profile_picture_url
        : undefined);

    if (legacyUrl?.startsWith(PROFILE_PICTURE_STORAGE_REF_PREFIX)) {
      return legacyUrl.slice(PROFILE_PICTURE_STORAGE_REF_PREFIX.length);
    }

    return undefined;
  }

  private async resolveProfilePicture(
    dbUser: any,
    authMetadata?: Record<string, unknown> | null
  ): Promise<string | undefined> {
    const storagePath = this.extractProfilePictureStoragePath(dbUser, authMetadata);
    if (storagePath) {
      const { data, error } = await supabase.storage
        .from(PROFILE_PICTURE_BUCKET)
        .createSignedUrl(storagePath, PROFILE_PICTURE_SIGNED_URL_TTL_SECONDS);

      if (error || !data?.signedUrl) {
        logger.warn('Unable to resolve signed profile picture URL', {
          storagePath,
          error: error?.message
        });
      } else {
        return data.signedUrl;
      }
    }

    const metadataUrl = authMetadata?.profile_picture_url;
    if (typeof metadataUrl === 'string' && metadataUrl.length > 0) {
      return metadataUrl;
    }

    if (typeof dbUser.profile_picture === 'string' && dbUser.profile_picture.length > 0) {
      return dbUser.profile_picture;
    }

    if (typeof dbUser.profilePicture === 'string' && dbUser.profilePicture.length > 0) {
      return dbUser.profilePicture;
    }

    return undefined;
  }

  // Sign up a new user
  async signUp(data: SignUpData): Promise<AuthResponse> {
    try {
      // SECURITY: Role is NOT passed to Supabase - database trigger assigns CLIENT role
      const { data: authData, error: authError } = await auth.signUp(
        data.email,
        data.password,
        {
          name: data.name,
          companyName: data.companyName
          // role intentionally omitted - assigned by database trigger
        }
      );

      if (authError) {
        return { success: false, error: authError.message };
      }

      if (!authData.user) {
        return { success: false, error: 'Failed to create user' };
      }

      // Note: User profile is created automatically by database trigger (handle_new_user)
      // The trigger defaults new users to CLIENT role

      // Fetch the created profile
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        logger.error('Error fetching user profile after signup:', profileError);
        return { success: false, error: 'Failed to retrieve user profile' };
      }

      const user = await this.mapDbUserToUser(
        profile,
        authData.user.user_metadata as Record<string, unknown>
      );

      return {
        success: true,
        user,
        session: authData.session || undefined
      };
    } catch (error) {
      logger.error('Sign up error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  // Sign in existing user
  async signIn(email: string, password: string): Promise<AuthResponse> {
    // If Supabase is not configured, don't attempt authentication
    if (!appConfig.supabase.isConfigured) {
      if (appConfig.debug.logAuthFlow) {
        logger.warn('authService.signIn() called in MOCK mode. Login should be handled by useStore mock authentication.');
      }
      return { success: false, error: 'Supabase not configured. Use mock mode authentication.' };
    }

    const normalizedEmail = this.normalizeEmail(email);
    if (!this.canAttemptLogin(normalizedEmail)) {
      return { success: false, error: 'Too many login attempts. Please wait and try again.' };
    }

    const serverRateLimit = await this.checkServerRateLimit(normalizedEmail);
    if (!serverRateLimit.allowed) {
      return {
        success: false,
        error: serverRateLimit.error || 'Too many login attempts. Please wait and try again.'
      };
    }

    if (appConfig.debug.logAuthFlow) {
      logger.auth('Attempting Supabase authentication', {
        email: normalizedEmail,
        supabaseUrl: appConfig.supabase.url
      });
    }

    try {
      const { data: authData, error: authError } = await auth.signIn(normalizedEmail, password);

      if (appConfig.debug.logAuthFlow) {
        logger.auth('Supabase auth response received', {
          error: authError ? authError.message : null,
          user: authData?.user?.email ?? null,
          errorCode: authError?.status,
          errorDetails: authError ?? null
        });
      }

      if (authError) {
        logger.error('❌ Supabase auth error:', authError);
        this.recordFailedLoginAttempt(normalizedEmail);
        await this.notifyServerOfFailedLogin(normalizedEmail);
        return { success: false, error: authError.message };
      }

      if (!authData.user) {
        logger.error('❌ No user data returned from Supabase');
        this.recordFailedLoginAttempt(normalizedEmail);
        await this.notifyServerOfFailedLogin(normalizedEmail);
        return { success: false, error: 'Invalid credentials' };
      }

      if (appConfig.debug.logAuthFlow) {
        logger.auth('Supabase authentication successful', { userId: authData.user.id });
        logger.auth('Fetching user profile from database');
      }

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (appConfig.debug.logAuthFlow) {
        logger.auth('User profile query response', {
          error: profileError ? profileError.message : null,
          profileFound: Boolean(profile),
          errorDetails: profileError ?? null,
          profileSummary: profile
            ? { name: (profile as any).name, role: (profile as any).role }
            : null
        });
      }

      if (profileError) {
        logger.error('❌ Error fetching user profile:', profileError);
        logger.error('   Code:', profileError.code);
        logger.error('   Details:', profileError.details);
        logger.error('   Hint:', profileError.hint);
        this.recordFailedLoginAttempt(normalizedEmail);
        await this.notifyServerOfFailedLogin(normalizedEmail);
        return { success: false, error: 'User profile not found' };
      }

      if (!profile) {
        logger.error('❌ No profile data returned');
        this.recordFailedLoginAttempt(normalizedEmail);
        await this.notifyServerOfFailedLogin(normalizedEmail);
        return { success: false, error: 'User profile not found' };
      }

      const user = await this.mapDbUserToUser(
        profile,
        authData.user.user_metadata as Record<string, unknown>
      );

      if (appConfig.debug.logAuthFlow) {
        logger.auth('Complete authentication successful', {
          userName: user.name,
          role: user.role
        });
      }

      this.resetLoginAttempts(normalizedEmail);
      await this.notifyServerOfSuccessfulLogin(normalizedEmail);

      return {
        success: true,
        user,
        session: authData.session || undefined
      };
    } catch (error) {
      logger.error('❌ Sign in error:', error);
      this.recordFailedLoginAttempt(normalizedEmail);
      await this.notifyServerOfFailedLogin(normalizedEmail);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  // Sign out
  async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await auth.signOut();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      logger.error('Sign out error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  // Send password reset email
  async requestPasswordReset(email: string, redirectTo?: string): Promise<ActionResponse> {
    if (!appConfig.supabase.isConfigured) {
      return { success: false, error: 'Supabase not configured. Password reset is unavailable in mock mode.' };
    }

    try {
      const { error } = await auth.resetPasswordForEmail(email, redirectTo);
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      logger.error('Password reset request error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  // Complete password reset/update for authenticated recovery session
  async updatePassword(newPassword: string): Promise<ActionResponse> {
    if (!appConfig.supabase.isConfigured) {
      return { success: false, error: 'Supabase not configured. Password update is unavailable in mock mode.' };
    }

    try {
      const { error } = await auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      logger.error('Password update error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  // Get current session
  async getSession(): Promise<{ session: Session | null; user: User | null }> {
    // If Supabase is not configured, return null session
    if (!appConfig.supabase.isConfigured) {
      if (appConfig.debug.logAuthFlow) {
        logger.auth('getSession() called in MOCK mode - returning null');
      }
      return { session: null, user: null };
    }

    try {
      const { data } = await auth.getSession();

      if (!data.session?.user) {
        return { session: null, user: null };
      }

      // Fetch user profile
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.session.user.id)
        .single();

      if (error || !profile) {
        return { session: data.session, user: null };
      }

      const user = await this.mapDbUserToUser(
        profile,
        data.session.user.user_metadata as Record<string, unknown>
      );

      return {
        session: data.session,
        user
      };
    } catch (error) {
      logger.error('Get session error:', error);
      return { session: null, user: null };
    }
  }

  // Get current user profile
  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: authData } = await auth.getUser();

      if (!authData.user) {
        return null;
      }

      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (error || !profile) {
        return null;
      }

      return await this.mapDbUserToUser(
        profile,
        authData.user.user_metadata as Record<string, unknown>
      );
    } catch (error) {
      logger.error('Get current user error:', error);
      return null;
    }
  }

  // Update user profile (SAFE FIELDS ONLY)
  // SECURITY: Users can only update their name and company name
  // Sensitive fields (role, verified, status, kycStatus, creditLimit) require ADMIN
  async updateProfile(userId: string, updates: Partial<Pick<User, 'name' | 'companyName'>>): Promise<AuthResponse> {
    try {
      // SECURITY: Only allow safe fields to be updated by users
      const dbUpdates: { name?: string; company_name?: string } = {};

      if (updates.name) dbUpdates.name = updates.name;
      if (updates.companyName) dbUpdates.company_name = updates.companyName;

      // BLOCKED FIELDS (require admin):
      // - role: privilege escalation risk
      // - verified: trust indicator
      // - status: account state
      // - kycStatus: compliance state
      // - creditLimit/creditUsed: financial risk
      // - rating: integrity risk

      if (Object.keys(dbUpdates).length === 0) {
        return { success: false, error: 'No valid fields to update' };
      }

      // Using type assertion since we're only updating safe fields
      // Note: The Supabase type inference may not perfectly match - using explicit cast
      const { data, error } = await (supabase
        .from('users') as any)
        .update(dbUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      const { data: authUserData } = await auth.getUser();
      const user = await this.mapDbUserToUser(
        data,
        authUserData.user?.user_metadata as Record<string, unknown> | undefined
      );
      return { success: true, user };
    } catch (error) {
      logger.error('Update profile error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  async updateProfilePicture(
    profilePictureUrl: string | null,
    profilePicturePath: string | null
  ): Promise<AuthResponse> {
    try {
      const metadataUpdates: Record<string, unknown> = {
        profile_picture_url: profilePictureUrl,
        profile_picture_path: profilePicturePath
      };

      const { data: authData, error: authError } = await auth.updateUser({
        data: metadataUpdates
      });

      if (authError || !authData.user) {
        return { success: false, error: authError?.message || 'Failed to update profile picture' };
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        return { success: false, error: profileError?.message || 'Failed to refresh profile' };
      }

      const user = await this.mapDbUserToUser(
        profile,
        authData.user.user_metadata as Record<string, unknown>
      );
      return { success: true, user };
    } catch (error) {
      logger.error('Update profile picture error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  // Subscribe to auth state changes
  onAuthStateChange(callback: (user: User | null) => void): () => void {
    const { data: subscription } = auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        callback(null);
        return;
      }

      // Fetch user profile on auth state change
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!profile) {
        callback(null);
        return;
      }

      const user = await this.mapDbUserToUser(
        profile,
        session.user.user_metadata as Record<string, unknown>
      );
      callback(user);
    });

    return () => subscription?.subscription.unsubscribe();
  }

  // Map database user to app User type
  private async mapDbUserToUser(
    dbUser: any,
    authMetadata?: Record<string, unknown> | null
  ): Promise<User> {
    // Normalize role to handle case sensitivity and potential "vendor" alias
    let role = (dbUser.role || '').toUpperCase();
    if (role === 'VENDOR') {
      role = 'SUPPLIER'; // Map Vendor to Supplier
    }

    const derivedCreditUsed = typeof dbUser.current_balance === 'number'
      ? Math.max(0, -dbUser.current_balance)
      : undefined;

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: role as UserRole,
      companyName: dbUser.company_name,
      verified: dbUser.verified,
      publicId: dbUser.public_id,
      rating: dbUser.rating,
      status: dbUser.status,
      kycStatus: dbUser.kyc_status,
      dateJoined: dbUser.date_joined,
      creditLimit: dbUser.credit_limit ?? undefined,
      creditUsed: dbUser.credit_used ?? derivedCreditUsed,
      clientMargin: dbUser.client_margin ?? undefined,
      phone: dbUser.phone ?? undefined,
      profilePicture: await this.resolveProfilePicture(dbUser, authMetadata)
    };
  }
}

export const authService = AuthService.getInstance();
export default authService;
