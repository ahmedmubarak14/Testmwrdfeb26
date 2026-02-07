import { logger } from '@/src/utils/logger';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../hooks/useToast';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import bankTransferService from '../../services/bankTransferService';
import type { Order } from '../../types/types';

interface MarkAsPaidButtonProps {
  order: Order;
  onSuccess?: () => void;
}

export const MarkAsPaidButton: React.FC<MarkAsPaidButtonProps> = ({
  order,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [paymentReference, setPaymentReference] = useState(order.paymentReference || '');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirmPayment = async () => {
    if (!paymentReference.trim()) {
      toast.error(t('errors.paymentReferenceRequired'));
      return;
    }

    setIsProcessing(true);
    try {
      await bankTransferService.markOrderAsPaid(
        order.id,
        paymentReference,
        paymentNotes
      );
      toast.success(t('toast.paymentConfirmed'));
      setShowModal(false);
      onSuccess?.();
    } catch (error) {
      logger.error('Error confirming payment:', error);
      toast.error(t('toast.failedToConfirmPayment'));
    } finally {
      setIsProcessing(false);
    }
  };

  if (order.paymentConfirmedAt) {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <span className="material-symbols-outlined">check_circle</span>
        <span className="text-sm font-medium">{t('markAsPaid.paymentConfirmed')}</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
      >
        <span className="material-symbols-outlined">payments</span>
        {t('markAsPaid.markAsPaid')}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{t('markAsPaid.confirmTitle')}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {t('markAsPaid.confirmSubtitle')}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">{t('markAsPaid.orderId')}</span>
                  <span className="font-mono text-sm font-medium text-gray-900">
                    {order.id.slice(0, 8)}...
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{t('markAsPaid.amount')}</span>
                  <span className="font-bold text-lg text-gray-900">
                    {order.amount.toFixed(2)} SAR
                  </span>
                </div>
                {order.paymentReference && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-gray-600">{t('markAsPaid.clientReference')}</span>
                    <span className="font-mono text-sm text-gray-900">
                      {order.paymentReference}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('markAsPaid.bankTransferRef')} *
                </label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder={t('markAsPaid.refPlaceholder')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('markAsPaid.refHint')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('markAsPaid.adminNotes')}
                </label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={3}
                  placeholder={t('markAsPaid.notesPlaceholder')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-yellow-600 text-lg">warning</span>
                  <p className="text-xs text-yellow-800">
                    {t('markAsPaid.warning')}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={isProcessing || !paymentReference.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>{t('markAsPaid.confirming')}</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">check_circle</span>
                    <span>{t('markAsPaid.confirmPayment')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
