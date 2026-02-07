import { appConfig } from './appConfig';
import { logger } from '../utils/logger';

export function validateEnv(): void {
  const errors: string[] = [];

  if (appConfig.features.useDatabase) {
    if (!appConfig.supabase.url) {
      errors.push('VITE_SUPABASE_URL is required when database mode is enabled.');
    }

    if (!appConfig.supabase.anonKey) {
      errors.push('VITE_SUPABASE_ANON_KEY is required when database mode is enabled.');
    }
  } else if (!appConfig.supabase.isConfigured) {
    // Intentionally allow running in mock mode without Supabase env variables.
    if (appConfig.debug.logModeDetection) {
      logger.warn('Supabase env vars not found. Starting in mock mode.');
    }
  }

  if (import.meta.env.PROD && !appConfig.features.useDatabase && !appConfig.features.allowProdMockMode) {
    errors.push('Production runtime cannot use mock mode. Configure Supabase env vars or set VITE_ALLOW_PROD_MOCK_MODE=true for intentional demo deployments.');
    errors.push('Vite injects VITE_* variables at build time. After changing Vercel env vars, trigger a new deployment.');
  }

  if (appConfig.payment.enableMoyasar && !import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY) {
    errors.push('VITE_MOYASAR_PUBLISHABLE_KEY is required when Moyasar payment is enabled.');
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join('\n- ')}`);
  }
}

export default validateEnv;
