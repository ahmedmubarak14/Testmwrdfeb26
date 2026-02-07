/**
 * Centralized Application Configuration
 * Single source of truth for app mode and feature flags
 */
import { logger } from '../utils/logger';

// Check if Supabase is properly configured
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const forceMockMode = import.meta.env.VITE_FORCE_MOCK_MODE === 'true';
const allowProdMockMode = import.meta.env.VITE_ALLOW_PROD_MOCK_MODE === 'true';
const useDatabase = isSupabaseConfigured && !forceMockMode;
const mode = useDatabase ? 'SUPABASE' : 'MOCK';
const configuredVatRatePercent = Number(import.meta.env.VITE_DEFAULT_VAT_RATE_PERCENT ?? 15);
const vatRatePercent = Number.isFinite(configuredVatRatePercent) && configuredVatRatePercent >= 0
  ? configuredVatRatePercent
  : 15;
const enableAuthRateLimit = import.meta.env.VITE_ENABLE_AUTH_RATE_LIMIT !== 'false';

export const appConfig = {
  // Supabase configuration
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    isConfigured: isSupabaseConfigured,
  },

  // App mode
  mode,

  // Feature flags
  features: {
    useDatabase, // Auto-fallbacks to mock mode when Supabase env vars are missing
    enableMockData: !useDatabase,
    validatePasswordInMockMode: false, // Not applicable in production
    allowProdMockMode,
  },

  // Payment configuration
  // MVP: bank transfer is the default production path. External links can be enabled later.
  payment: {
    // Set to true to enable Moyasar direct card processing (requires PCI compliance)
    enableMoyasar: false,
    // Bank transfer is always available
    enableBankTransfer: true,
    // External payment links (e.g., Moyasar hosted checkout, PayPal links)
    enableExternalPaymentLinks: false,
    // Supabase Edge Function used for secure webhook verification and payment sync
    moyasarWebhookFunctionName: import.meta.env.VITE_MOYASAR_WEBHOOK_FUNCTION_NAME || 'moyasar-webhook',
  },

  auth: {
    // App-side hook for Supabase Edge Function auth throttling.
    // Keep enabled by default; service fails open if the function isn't deployed yet.
    enableRateLimit: enableAuthRateLimit,
    rateLimitFunctionName: import.meta.env.VITE_AUTH_RATE_LIMIT_FUNCTION_NAME || 'auth-rate-limit',
  },

  pricing: {
    vatRatePercent,
  },

  // Debug logging - disabled for production
  debug: {
    logAuthFlow: false,
    logStateChanges: false,
    logModeDetection: false,
  },
} as const;

// Log configuration on module load
if (appConfig.debug.logModeDetection) {
  logger.info('MWRD Application Configuration');
  logger.info(`Mode: ${appConfig.mode}`);
  logger.info(`Database: ${appConfig.features.useDatabase ? 'ENABLED (Supabase)' : 'DISABLED (Mock Data)'}`);
  logger.info(`Mock Password Validation: ${appConfig.features.validatePasswordInMockMode ? 'ENABLED' : 'DISABLED'}`);
  logger.info(`Debug Logging: ${appConfig.debug.logAuthFlow ? 'ENABLED' : 'DISABLED'}`);

  if (!appConfig.supabase.isConfigured) {
    logger.info('Tip: To enable Supabase database:');
    logger.info('1. Copy .env.example to .env.local');
    logger.info('2. Set VITE_SUPABASE_URL');
    logger.info('3. Set VITE_SUPABASE_ANON_KEY');
    logger.info('4. Restart the dev server');
  }
}

export default appConfig;
