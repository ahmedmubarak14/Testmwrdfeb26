import { logger } from '@/src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../hooks/useToast';
import { LoadingSpinner } from './ui/LoadingSpinner';
import bankTransferService from '../services/bankTransferService';
import type { BankDetails, Order } from '../types/types';

interface PaymentInstructionsProps {
  order: Order;
  onPaymentReferenceAdded?: () => void;
}

export const PaymentInstructions: React.FC<PaymentInstructionsProps> = ({
  order,
  onPaymentReferenceAdded,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentReference, setPaymentReference] = useState(order.paymentReference || '');
  const [paymentNotes, setPaymentNotes] = useState(order.paymentNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const isAwaitingAdminReview = order.status === 'AWAITING_CONFIRMATION';

  useEffect(() => {
    loadBankDetails();
  }, []);

  const loadBankDetails = async () => {
    setIsLoading(true);
    try {
      const data = await bankTransferService.getActiveBankDetails();
      setBankDetails(data);
    } catch (error) {
      logger.error('Error loading bank details:', error);
      toast.error(t('toast.bankDetailsLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveReference = async () => {
    if (!paymentReference.trim()) {
      toast.error(t('errors.paymentReferenceRequired'));
      return;
    }

    setIsSaving(true);
    try {
      await bankTransferService.addPaymentReference(
        order.id,
        paymentReference,
        paymentNotes
      );
      toast.success(t('toast.paymentReferenceSaved'));
      onPaymentReferenceAdded?.();
    } catch (error) {
      logger.error('Error saving reference:', error);
      toast.error(t('toast.failedToSaveReference'));
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} ${t('toast.copiedToClipboard')}`);
    } catch (error) {
      logger.error('Clipboard write failed:', error);
      toast.error(t('common.copyFailed', 'Failed to copy'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!bankDetails) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-yellow-600 text-2xl">warning</span>
          <div>
            <p className="font-medium text-yellow-900">{t('paymentInstructions.bankNotConfigured')}</p>
            <p className="text-sm text-yellow-700 mt-1">
              {t('paymentInstructions.contactSupport')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-xl p-6 ${
        order.paymentConfirmedAt
          ? 'bg-green-50 border border-green-200'
          : 'bg-blue-50 border border-blue-200'
      }`}>
        <div className="flex items-start gap-3">
          <span className={`material-symbols-outlined text-2xl ${
            order.paymentConfirmedAt ? 'text-green-600' : 'text-blue-600'
          }`}>
            {order.paymentConfirmedAt ? 'check_circle' : 'info'}
          </span>
          <div>
            <p className={`font-medium ${
              order.paymentConfirmedAt ? 'text-green-900' : 'text-blue-900'
            }`}>
              {order.paymentConfirmedAt ? t('paymentInstructions.paymentConfirmed') : t('paymentInstructions.awaitingPayment')}
            </p>
            <p className={`text-sm mt-1 ${
              order.paymentConfirmedAt ? 'text-green-700' : 'text-blue-700'
            }`}>
              {order.paymentConfirmedAt
                ? `${t('paymentInstructions.paymentConfirmedOn')} ${new Date(order.paymentConfirmedAt).toLocaleDateString()}`
                : t('paymentInstructions.transferInstructions')}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-[#0A2540] text-white px-6 py-4">
          <h3 className="text-lg font-semibold">{t('paymentInstructions.bankAccountTitle')}</h3>
          <p className="text-sm text-gray-300 mt-1">{t('paymentInstructions.transferToAccount')}</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-500">{t('payment.bankTransfer.bankName')}</p>
              <p className="font-semibold text-gray-900 text-lg">{bankDetails.bankName}</p>
            </div>
            <button
              onClick={() => void copyToClipboard(bankDetails.bankName, t('payment.bankTransfer.bankName'))}
              className="p-2 text-gray-600 hover:text-[#0A2540] transition-colors"
            >
              <span className="material-symbols-outlined">content_copy</span>
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-500">{t('payment.bankTransfer.accountName')}</p>
              <p className="font-semibold text-gray-900 text-lg">{bankDetails.accountName}</p>
            </div>
            <button
              onClick={() => void copyToClipboard(bankDetails.accountName, t('payment.bankTransfer.accountName'))}
              className="p-2 text-gray-600 hover:text-[#0A2540] transition-colors"
            >
              <span className="material-symbols-outlined">content_copy</span>
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-500">{t('payment.bankTransfer.accountNumber')}</p>
              <p className="font-semibold text-gray-900 text-lg font-mono">{bankDetails.accountNumber}</p>
            </div>
            <button
              onClick={() => void copyToClipboard(bankDetails.accountNumber, t('payment.bankTransfer.accountNumber'))}
              className="p-2 text-gray-600 hover:text-[#0A2540] transition-colors"
            >
              <span className="material-symbols-outlined">content_copy</span>
            </button>
          </div>

          {bankDetails.iban && (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">{t('payment.bankTransfer.iban')}</p>
                <p className="font-semibold text-gray-900 text-lg font-mono">{bankDetails.iban}</p>
              </div>
              <button
                onClick={() => void copyToClipboard(bankDetails.iban!, t('payment.bankTransfer.iban'))}
                className="p-2 text-gray-600 hover:text-[#0A2540] transition-colors"
              >
                <span className="material-symbols-outlined">content_copy</span>
              </button>
            </div>
          )}

          {bankDetails.swiftCode && (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">{t('payment.bankTransfer.swiftCode')}</p>
                <p className="font-semibold text-gray-900 text-lg font-mono">{bankDetails.swiftCode}</p>
              </div>
              <button
                onClick={() => void copyToClipboard(bankDetails.swiftCode!, t('payment.bankTransfer.swiftCode'))}
                className="p-2 text-gray-600 hover:text-[#0A2540] transition-colors"
              >
                <span className="material-symbols-outlined">content_copy</span>
              </button>
            </div>
          )}

          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700">{t('paymentInstructions.amountToTransfer')}</p>
            <p className="font-bold text-green-900 text-2xl">{order.amount.toFixed(2)} {bankDetails.currency}</p>
          </div>

          {bankDetails.notes && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-1">{t('paymentInstructions.important')}</p>
              <p className="text-sm text-blue-700">{bankDetails.notes}</p>
            </div>
          )}
        </div>
      </div>

      {!order.paymentConfirmedAt && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-900 mb-4">{t('paymentInstructions.afterTransfer')}</h4>
          <p className="text-sm text-gray-600 mb-4">
            {isAwaitingAdminReview
              ? t('paymentInstructions.awaitingAdminReview', 'Reference submitted. Waiting for admin verification.')
              : t('paymentInstructions.referenceInstructions')}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('paymentInstructions.paymentReference')} *
              </label>
              <input
                type="text"
                data-testid="payment-reference-input"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder={t('paymentInstructions.referencePlaceholder')}
                disabled={isAwaitingAdminReview}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('paymentInstructions.additionalNotes')}
              </label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={3}
                placeholder={t('paymentInstructions.notesPlaceholder')}
                disabled={isAwaitingAdminReview}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
              />
            </div>

            <button
              onClick={handleSaveReference}
              data-testid="payment-reference-submit"
              disabled={isSaving || isAwaitingAdminReview || !paymentReference.trim()}
              className="w-full px-6 py-3 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>{t('paymentInstructions.saving')}</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">{isAwaitingAdminReview ? 'hourglass_top' : 'save'}</span>
                  <span>
                    {isAwaitingAdminReview
                      ? t('paymentInstructions.referenceSubmitted', 'Reference submitted')
                      : t('paymentInstructions.submitReference')}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-xl p-6">
        <h4 className="font-semibold text-gray-900 mb-3">{t('paymentInstructions.helpTitle')}</h4>
        <div className="space-y-2 text-sm text-gray-600">
          <p>• {t('paymentInstructions.helpTip1')}</p>
          <p>• {t('paymentInstructions.helpTip2')}</p>
          <p>• {t('paymentInstructions.helpTip3')}</p>
          <p>• {t('paymentInstructions.helpTip4')}</p>
        </div>
      </div>
    </div>
  );
};
