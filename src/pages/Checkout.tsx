import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../hooks/useToast';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { appConfig } from '../config/appConfig';
import type { PaymentSummary } from '../types/payment';
import type { BankDetails } from '../types/types';
import bankTransferService from '../services/bankTransferService';
import { logger } from '../utils/logger';
import { calculatePricingBreakdown } from '../utils/pricing';

interface CheckoutProps {
  orderId: string;
  clientId: string;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const FALLBACK_BANK_DETAILS: BankDetails = {
  id: 'fallback',
  bankName: 'Not configured',
  accountName: 'Not configured',
  accountNumber: 'Not configured',
  iban: undefined,
  swiftCode: undefined,
  currency: 'SAR',
  notes: 'Bank details are not configured yet.',
  isActive: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const Checkout: React.FC<CheckoutProps> = ({
  orderId,
  clientId,
  amount,
  onSuccess,
  onCancel,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'bank_transfer' | 'external_link'>('bank_transfer');
  const [transferReference, setTransferReference] = useState('');
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [isLoadingSetup, setIsLoadingSetup] = useState(true);
  const vatRatePercent = appConfig.pricing.vatRatePercent;
  const pricing = calculatePricingBreakdown(amount, vatRatePercent, 0);

  const paymentSummary: PaymentSummary = {
    subtotal: pricing.subtotal,
    tax: pricing.vatAmount,
    discount: pricing.discountAmount,
    total: pricing.total,
    currency: 'SAR',
  };

  // Generate a unique reference for this order
  const orderReference = `MWRD-${orderId.slice(0, 8).toUpperCase()}`;

  useEffect(() => {
    let isMounted = true;

    const loadPaymentSetup = async () => {
      setIsLoadingSetup(true);
      try {
        const [activeBankDetails, order] = await Promise.all([
          bankTransferService.getActiveBankDetails(),
          bankTransferService.getOrderById(orderId),
        ]);

        if (!isMounted) {
          return;
        }

        setBankDetails(activeBankDetails);
        setPaymentLinkUrl(order?.paymentLinkUrl ?? null);
      } catch (error) {
        logger.error('Error loading checkout payment setup:', error);
        if (isMounted) {
          toast.error(t('checkout.paymentSetupError', 'Unable to load payment setup. Please try again.'));
        }
      } finally {
        if (isMounted) {
          setIsLoadingSetup(false);
        }
      }
    };

    void loadPaymentSetup();

    return () => {
      isMounted = false;
    };
  }, [orderId, t, toast]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      logger.error('Clipboard write failed:', error);
      toast.error(t('common.copyFailed', 'Failed to copy'));
    }
  };

  const handleBankTransferSubmit = async () => {
    if (!bankDetails) {
      toast.error(t('checkout.bankDetailsMissing', 'Bank details are not configured yet. Please contact support.'));
      return;
    }

    if (!transferReference.trim()) {
      toast.error('Please enter the bank transfer reference number');
      return;
    }

    setIsProcessing(true);

    try {
      await bankTransferService.addPaymentReference(
        orderId,
        transferReference.trim(),
        `Submitted from checkout by client ${clientId}`
      );
      toast.success('Bank transfer details submitted. We will verify your payment and confirm shortly.');
      onSuccess();
    } catch (error) {
      logger.error('Error submitting bank transfer:', error);
      toast.error('Failed to submit payment details. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExternalPaymentLink = () => {
    if (!paymentLinkUrl) {
      toast.info(t('checkout.paymentLinkUnavailable', 'No payment link is available for this order yet.'));
      return;
    }

    window.open(paymentLinkUrl, '_blank', 'noopener,noreferrer');
  };

  const effectiveBankDetails = bankDetails || FALLBACK_BANK_DETAILS;
  const canSubmitBankTransfer = Boolean(bankDetails) && transferConfirmed && Boolean(transferReference.trim());

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8 md:py-12 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-[#0A2540] text-white px-4 sm:px-6 md:px-8 py-4 sm:py-6">
            <h1 className="text-xl sm:text-2xl font-bold">{t('checkout.title', 'Secure Checkout')}</h1>
            <p className="text-gray-300 mt-1 text-sm sm:text-base">
              {t('checkout.subtitle', 'Complete your payment securely')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8 p-4 sm:p-6 md:p-8">
            {/* Payment Method Selection */}
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">
                {t('checkout.paymentMethod', 'Payment Method')}
              </h2>

              {/* Payment Method Tabs */}
              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('bank_transfer')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${selectedMethod === 'bank_transfer'
                      ? 'border-[#0A2540] bg-[#0A2540]/5 text-[#0A2540]'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                >
                  <span className="material-symbols-outlined block text-2xl mb-1">account_balance</span>
                  <span className="text-sm font-medium">Bank Transfer</span>
                </button>

                {appConfig.payment.enableExternalPaymentLinks && (
                  <button
                    type="button"
                    onClick={() => setSelectedMethod('external_link')}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${selectedMethod === 'external_link'
                        ? 'border-[#0A2540] bg-[#0A2540]/5 text-[#0A2540]'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                  >
                    <span className="material-symbols-outlined block text-2xl mb-1">link</span>
                    <span className="text-sm font-medium">Payment Link</span>
                  </button>
                )}
              </div>

              {/* Bank Transfer Details */}
              {selectedMethod === 'bank_transfer' && (
                <div className="space-y-4">
                  {isLoadingSetup && (
                    <div className="flex items-center justify-center py-4">
                      <LoadingSpinner size="sm" />
                    </div>
                  )}

                  {!isLoadingSetup && !bankDetails && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
                      {t('checkout.bankDetailsMissing', 'Bank details are not configured yet. Please contact support.')}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined">info</span>
                      Bank Transfer Instructions
                    </h3>
                    <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                      <li>Transfer the exact amount shown to our bank account</li>
                      <li>Use the order reference as the transfer description</li>
                      <li>Enter your transfer reference number below</li>
                      <li>We'll verify and confirm within 24 hours</li>
                    </ol>
                  </div>

                  {/* Bank Details */}
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <h4 className="font-medium text-gray-900">Bank Account Details</h4>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Bank Name</span>
                        <span className="font-medium">{effectiveBankDetails.bankName}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Account Name</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{effectiveBankDetails.accountName}</span>
                          <button
                            onClick={() => void copyToClipboard(effectiveBankDetails.accountName, 'Account name')}
                            disabled={!bankDetails}
                            className="text-[#0A2540] hover:text-[#0A2540]/70"
                          >
                            <span className="material-symbols-outlined text-lg">content_copy</span>
                          </button>
                        </div>
                      </div>

                      {effectiveBankDetails.iban && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">IBAN</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium font-mono text-sm">{effectiveBankDetails.iban}</span>
                            <button
                              onClick={() => void copyToClipboard(effectiveBankDetails.iban!, 'IBAN')}
                              disabled={!bankDetails}
                              className="text-[#0A2540] hover:text-[#0A2540]/70"
                            >
                              <span className="material-symbols-outlined text-lg">content_copy</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {effectiveBankDetails.swiftCode && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">SWIFT Code</span>
                          <span className="font-medium">{effectiveBankDetails.swiftCode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Order Reference */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-sm text-yellow-800">Order Reference (use as description)</span>
                        <p className="font-bold text-yellow-900 text-lg">{orderReference}</p>
                      </div>
                      <button
                        onClick={() => void copyToClipboard(orderReference, 'Order reference')}
                        className="p-2 text-yellow-700 hover:bg-yellow-100 rounded-lg"
                      >
                        <span className="material-symbols-outlined">content_copy</span>
                      </button>
                    </div>
                  </div>

                  {/* Transfer Reference Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Your Bank Transfer Reference
                    </label>
                    <input
                      type="text"
                      value={transferReference}
                      onChange={(e) => setTransferReference(e.target.value)}
                      placeholder="Enter transfer reference number"
                      disabled={!bankDetails}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This is the reference number from your bank after making the transfer
                    </p>
                  </div>

                  {/* Confirmation Checkbox */}
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="transferConfirmed"
                      checked={transferConfirmed}
                      onChange={(e) => setTransferConfirmed(e.target.checked)}
                      disabled={!bankDetails}
                      className="w-4 h-4 mt-1 text-[#0A2540] border-gray-300 rounded focus:ring-[#0A2540]"
                    />
                    <label htmlFor="transferConfirmed" className="text-sm text-gray-700">
                      I confirm that I have transferred{' '}
                      <strong>{paymentSummary.total.toFixed(2)} {paymentSummary.currency}</strong>{' '}
                      to the bank account above
                    </label>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 mt-6">
                    <button
                      type="button"
                      onClick={onCancel}
                      disabled={isProcessing}
                      className="flex-1 px-4 sm:px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[48px]"
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleBankTransferSubmit}
                      disabled={isProcessing || !canSubmitBankTransfer}
                      className="flex-1 px-4 sm:px-6 py-3 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                    >
                      {isProcessing ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">check_circle</span>
                          <span>Confirm Payment</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* External Payment Link */}
              {selectedMethod === 'external_link' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                    <span className="material-symbols-outlined text-4xl text-gray-400 mb-3">link</span>
                    <h3 className="font-semibold text-gray-900 mb-2">External Payment Link</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Pay securely using our hosted payment page. You'll be redirected to complete your payment.
                    </p>
                    <button
                      onClick={handleExternalPaymentLink}
                      disabled={!paymentLinkUrl}
                      className="px-6 py-3 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors inline-flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined">open_in_new</span>
                      Open Payment Link
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={onCancel}
                    className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                </div>
              )}

              {/* Security Notice */}
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-green-600 text-xl">verified_user</span>
                  <div>
                    <p className="text-sm font-medium text-green-900">Secure Payment</p>
                    <p className="text-xs text-green-700 mt-1">
                      Your payment details are protected. Bank transfers are verified by our team.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">
                {t('checkout.orderSummary', 'Order Summary')}
              </h2>

              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <div className="flex justify-between text-gray-700">
                  <span>{t('checkout.subtotal', 'Subtotal')}</span>
                  <span>{paymentSummary.subtotal.toFixed(2)} {paymentSummary.currency}</span>
                </div>

                <div className="flex justify-between text-gray-700">
                  <span>{`${t('checkout.vat', 'VAT')} (${vatRatePercent}%)`}</span>
                  <span>{paymentSummary.tax.toFixed(2)} {paymentSummary.currency}</span>
                </div>

                {paymentSummary.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{t('checkout.discount', 'Discount')}</span>
                    <span>-{paymentSummary.discount.toFixed(2)} {paymentSummary.currency}</span>
                  </div>
                )}

                <div className="border-t border-gray-300 pt-4">
                  <div className="flex justify-between text-lg font-bold text-gray-900">
                    <span>{t('common.total', 'Total')}</span>
                    <span>{paymentSummary.total.toFixed(2)} {paymentSummary.currency}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  {t('checkout.acceptedMethods', 'Accepted Payment Methods')}
                </p>
                <div className="flex gap-3">
                  <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">account_balance</span>
                    Bank Transfer
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900">{t('checkout.needHelp', 'Need Help?')}</p>
                <p className="text-xs text-blue-700 mt-1">
                  {t('checkout.supportContact', 'Contact our support team at support@mwrd.sa')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-sm text-gray-500">
          <p>{t('checkout.poweredBy', 'Secured by MWRD Payment System')}</p>
        </div>
      </div>
    </div>
  );
};
