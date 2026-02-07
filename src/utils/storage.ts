import { logger } from '@/src/utils/logger';
/**
 * Storage Utilities
 * Handles localStorage operations and state management
 */

import { appConfig } from '../config/appConfig';

const STORAGE_KEY = 'mwrd-storage';
const MODE_KEY = 'mwrd-app-mode';

/**
 * Check if the stored mode matches the current mode
 * If they don't match, clear the storage to prevent inconsistencies
 */
export function validateStorageMode(): boolean {
  try {
    const storedMode = localStorage.getItem(MODE_KEY);
    const currentMode = appConfig.mode;

    if (storedMode && storedMode !== currentMode) {
      if (appConfig.debug.logStateChanges) {
        logger.warn('App mode changed. Clearing stored state.', {
          previousMode: storedMode,
          currentMode
        });
      }
      clearStorage();
      localStorage.setItem(MODE_KEY, currentMode);
      return false;
    }

    if (!storedMode) {
      localStorage.setItem(MODE_KEY, currentMode);
    }

    return true;
  } catch (error) {
    logger.error('Error validating storage mode:', error);
    return false;
  }
}

/**
 * Clear all app storage
 */
export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MODE_KEY);
    if (appConfig.debug.logStateChanges) {
      logger.info('Storage cleared successfully');
    }
  } catch (error) {
    logger.error('Error clearing storage:', error);
  }
}

/**
 * Get stored state
 */
export function getStoredState(): any {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    logger.error('Error getting stored state:', error);
    return null;
  }
}

/**
 * Validate stored auth state
 * Returns true if the state is valid, false otherwise
 */
export function validateAuthState(state: any): boolean {
  if (!state) return true; // No stored state is valid

  // If authenticated, must have a user object
  if (state.state?.isAuthenticated && !state.state?.currentUser) {
    if (appConfig.debug.logStateChanges) {
      logger.warn('Invalid auth state: authenticated but no user');
    }
    return false;
  }

  // In mock mode, must have mock data
  if (!appConfig.features.useDatabase && state.state?.isAuthenticated) {
    if (!state.state?.users || state.state.users.length === 0) {
      if (appConfig.debug.logStateChanges) {
        logger.warn('Invalid auth state: mock mode but no users data');
      }
      return false;
    }
  }

  return true;
}

/**
 * Initialize storage with validation
 */
export function initializeStorage(): void {
  if (appConfig.debug.logStateChanges) {
    logger.info('Initializing storage...');
  }

  // Validate mode hasn't changed
  if (!validateStorageMode()) {
    if (appConfig.debug.logStateChanges) {
      logger.info('Mode changed - storage cleared');
    }
    return;
  }

  // Validate stored auth state
  const storedState = getStoredState();
  if (!validateAuthState(storedState)) {
    if (appConfig.debug.logStateChanges) {
      logger.info('Invalid auth state - clearing storage');
    }
    clearStorage();
  }
}
