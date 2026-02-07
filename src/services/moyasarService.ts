// ============================================================================
// MOYASAR PAYMENT SERVICE
// Official API Docs: https://moyasar.com/docs/api/
// 
// SECURITY NOTE: This service is for future use when Moyasar is enabled.
// Currently disabled via appConfig.payment.enableMoyasar = false
// 
// IMPORTANT: Secret API keys (VITE_MOYASAR_API_KEY) have been REMOVED from
// client-side code. Any Moyasar API calls requiring the secret key MUST be
// done server-side (e.g., Supabase Edge Functions).
// ============================================================================

import type {
  MoyasarPaymentRequest,
  MoyasarPaymentResponse,
  MoyasarRefundRequest,
  MoyasarRefundResponse,
  Payment,
} from '../types/payment';
import { PaymentMethodType, PaymentStatus } from '../types/payment';
import { logger } from '../utils/logger';

const MOYASAR_API_URL = 'https://api.moyasar.com/v1';
// SECURITY: Only publishable key is allowed on client-side
// Secret API key has been REMOVED - use server-side for API calls
const MOYASAR_PUBLISHABLE_KEY = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY || '';

// Import app config to check if Moyasar is enabled
import { appConfig } from '../config/appConfig';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert amount to halalas (smallest currency unit)
 * Moyasar expects amounts in halalas (1 SAR = 100 halalas)
 */
export function toHalalas(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert halalas back to SAR
 */
export function fromHalalas(halalas: number): number {
  return halalas / 100;
}

/**
 * Get authorization header for Moyasar API
 * SECURITY: This function is DISABLED on client-side.
 * Moyasar API calls requiring secret key must be done server-side.
 */
function getAuthHeaders(): HeadersInit {
  // SECURITY: Do not use secret API key on client-side
  // This function should only be called from server-side code
  logger.error('getAuthHeaders called from client - Moyasar API calls must be server-side');
  throw new Error('Moyasar API calls requiring secret key must be done server-side (Supabase Edge Functions)');
}

/**
 * Map Moyasar status to our internal PaymentStatus
 */
function mapMoyasarStatus(moyasarStatus: string): PaymentStatus {
  const statusMap: Record<string, PaymentStatus> = {
    'initiated': PaymentStatus.PENDING,
    'paid': PaymentStatus.PAID,
    'failed': PaymentStatus.FAILED,
    'authorized': PaymentStatus.AUTHORIZED,
    'captured': PaymentStatus.CAPTURED,
    'refunded': PaymentStatus.REFUNDED,
    'voided': PaymentStatus.CANCELLED,
  };

  return statusMap[moyasarStatus] || PaymentStatus.PENDING;
}

// ============================================================================
// MOYASAR API CALLS
// ============================================================================

/**
 * Create a payment with Moyasar
 */
export async function createMoyasarPayment(
  paymentRequest: MoyasarPaymentRequest
): Promise<MoyasarPaymentResponse> {
  try {
    const response = await fetch(`${MOYASAR_API_URL}/payments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(paymentRequest),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Payment creation failed');
    }

    const data: MoyasarPaymentResponse = await response.json();
    return data;
  } catch (error) {
    logger.error('Moyasar payment creation failed', error);
    throw error;
  }
}

/**
 * Fetch payment status from Moyasar
 */
export async function fetchMoyasarPayment(
  paymentId: string
): Promise<MoyasarPaymentResponse> {
  try {
    const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch payment');
    }

    const data: MoyasarPaymentResponse = await response.json();
    return data;
  } catch (error) {
    logger.error('Moyasar fetch payment error:', error);
    throw error;
  }
}

/**
 * Refund a payment through Moyasar
 */
export async function refundMoyasarPayment(
  paymentId: string,
  refundRequest: MoyasarRefundRequest
): Promise<MoyasarRefundResponse> {
  try {
    const response = await fetch(
      `${MOYASAR_API_URL}/payments/${paymentId}/refund`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(refundRequest),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Refund failed');
    }

    const data: MoyasarRefundResponse = await response.json();
    return data;
  } catch (error) {
    logger.error('Moyasar refund error:', error);
    throw error;
  }
}

/**
 * List all payments (for admin purposes)
 */
export async function listMoyasarPayments(
  page: number = 1
): Promise<MoyasarPaymentResponse[]> {
  try {
    const response = await fetch(
      `${MOYASAR_API_URL}/payments?page=${page}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to list payments');
    }

    const data = await response.json();
    return data.payments || [];
  } catch (error) {
    logger.error('Moyasar list payments error:', error);
    throw error;
  }
}

// ============================================================================
// PAYMENT PROCESSING HELPERS
// ============================================================================

/**
 * Process a credit card payment
 */
export async function processCreditCardPayment(
  orderId: string,
  amount: number,
  cardDetails: {
    name: string;
    number: string;
    cvc: string;
    month: string;
    year: string;
  },
  callbackUrl: string,
  description: string
): Promise<MoyasarPaymentResponse> {
  const paymentRequest: MoyasarPaymentRequest = {
    amount: toHalalas(amount),
    currency: 'SAR',
    description,
    callback_url: callbackUrl,
    source: {
      type: 'creditcard',
      name: cardDetails.name,
      number: cardDetails.number.replace(/\s/g, ''),
      cvc: cardDetails.cvc,
      month: cardDetails.month,
      year: cardDetails.year,
    },
    metadata: {
      order_id: orderId,
    },
  };

  return createMoyasarPayment(paymentRequest);
}

/**
 * Process an Apple Pay payment
 */
export async function processApplePayPayment(
  orderId: string,
  amount: number,
  token: string,
  callbackUrl: string,
  description: string
): Promise<MoyasarPaymentResponse> {
  const paymentRequest: MoyasarPaymentRequest = {
    amount: toHalalas(amount),
    currency: 'SAR',
    description,
    callback_url: callbackUrl,
    source: {
      type: 'applepay',
      token,
    },
    metadata: {
      order_id: orderId,
    },
  };

  return createMoyasarPayment(paymentRequest);
}

/**
 * Verify webhook signature from Moyasar
 * SECURITY: This prevents webhook spoofing attacks
 * Note: Check Moyasar docs for their specific signature verification method
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const normalizedSignature = signature.replace(/^sha256=/i, '').trim().toLowerCase();

  if (!secret) {
    logger.warn('Webhook verification failed: missing webhook secret');
    return Promise.resolve(false);
  }

  if (!normalizedSignature) {
    logger.warn('Webhook verification failed: missing signature header');
    return Promise.resolve(false);
  }

  if (!globalThis.crypto?.subtle) {
    logger.warn('Webhook verification failed: Web Crypto API unavailable');
    return Promise.resolve(false);
  }

  const encoder = new TextEncoder();
  const constantTimeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  };

  const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  return globalThis.crypto.subtle
    .importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    .then((key) => globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
    .then((signatureBuffer) => {
      const computed = toHex(new Uint8Array(signatureBuffer)).toLowerCase();
      const isValid = constantTimeEqual(computed, normalizedSignature);
      if (!isValid) {
        logger.warn('Webhook verification failed: signature mismatch');
      }
      return isValid;
    })
    .catch((error) => {
      logger.error('Webhook signature verification failed', error);
      return false;
    });
}

// ============================================================================
// PAYMENT STATUS HELPERS
// ============================================================================

/**
 * Check if payment is successful
 */
export function isPaymentSuccessful(status: PaymentStatus): boolean {
  return status === PaymentStatus.PAID || status === PaymentStatus.CAPTURED;
}

/**
 * Check if payment is pending
 */
export function isPaymentPending(status: PaymentStatus): boolean {
  return status === PaymentStatus.PENDING || status === PaymentStatus.AUTHORIZED;
}

/**
 * Check if payment failed
 */
export function isPaymentFailed(status: PaymentStatus): boolean {
  return status === PaymentStatus.FAILED || status === PaymentStatus.CANCELLED;
}

/**
 * Get payment status display text
 */
export function getPaymentStatusText(status: PaymentStatus): string {
  const statusText: Record<PaymentStatus, string> = {
    [PaymentStatus.PENDING]: 'Pending',
    [PaymentStatus.AWAITING_CONFIRMATION]: 'Awaiting Confirmation',
    [PaymentStatus.CONFIRMED]: 'Confirmed',
    [PaymentStatus.REJECTED]: 'Rejected',
    [PaymentStatus.AUTHORIZED]: 'Authorized',
    [PaymentStatus.CAPTURED]: 'Captured',
    [PaymentStatus.PAID]: 'Paid',
    [PaymentStatus.FAILED]: 'Failed',
    [PaymentStatus.REFUNDED]: 'Refunded',
    [PaymentStatus.PARTIALLY_REFUNDED]: 'Partially Refunded',
    [PaymentStatus.CANCELLED]: 'Cancelled',
  };

  return statusText[status] || status;
}

/**
 * Get payment method display text
 */
export function getPaymentMethodText(method: PaymentMethodType): string {
  const methodText: Record<PaymentMethodType, string> = {
    [PaymentMethodType.CREDITCARD]: 'Credit Card',
    [PaymentMethodType.MADA]: 'MADA',
    [PaymentMethodType.APPLEPAY]: 'Apple Pay',
    [PaymentMethodType.STC_PAY]: 'STC Pay',
    [PaymentMethodType.BANK_TRANSFER]: 'Bank Transfer',
  };

  return methodText[method] || method;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Check if Moyasar is configured AND enabled
 * PRODUCTION: Moyasar is disabled via appConfig.payment.enableMoyasar
 * This allows keeping the code for future use while using bank transfer for now
 */
export function isMoyasarConfigured(): boolean {
  // First check if Moyasar is enabled in the app config
  if (!appConfig.payment.enableMoyasar) {
    return false;
  }
  // SECURITY: Only check publishable key on client-side
  // Secret API key has been removed from client - API calls must be server-side
  return Boolean(MOYASAR_PUBLISHABLE_KEY);
}

/**
 * Get publishable key for frontend
 */
export function getMoyasarPublishableKey(): string {
  return MOYASAR_PUBLISHABLE_KEY;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const moyasarService = {
  // API calls
  createPayment: createMoyasarPayment,
  fetchPayment: fetchMoyasarPayment,
  refundPayment: refundMoyasarPayment,
  listPayments: listMoyasarPayments,

  // Payment processing
  processCreditCard: processCreditCardPayment,
  processApplePay: processApplePayPayment,

  // Utilities
  toHalalas,
  fromHalalas,
  mapMoyasarStatus,
  verifyWebhookSignature,

  // Status helpers
  isPaymentSuccessful,
  isPaymentPending,
  isPaymentFailed,
  getPaymentStatusText,
  getPaymentMethodText,

  // Configuration
  isConfigured: isMoyasarConfigured,
  getPublishableKey: getMoyasarPublishableKey,
};

export default moyasarService;
