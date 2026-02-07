import React from 'react';
import { useTranslation } from 'react-i18next';
import { Order } from '../../../types/types';

interface PaymentReviewModalProps {
  order: Order | null;
  paymentReferenceInput: string;
  paymentReviewNotes: string;
  isConfirmingPayment: boolean;
  isRejectingPayment: boolean;
  canConfirmPayment: boolean;
  canRejectPayment: boolean;
  statusLabel: (status: string) => string;
  onPaymentReferenceInputChange: (value: string) => void;
  onPaymentReviewNotesChange: (value: string) => void;
  onClose: () => void;
  onReject: () => void;
  onConfirm: () => void;
}

export const PaymentReviewModal: React.FC<PaymentReviewModalProps> = ({
  order,
  paymentReferenceInput,
  paymentReviewNotes,
  isConfirmingPayment,
  isRejectingPayment,
  canConfirmPayment,
  canRejectPayment,
  statusLabel,
  onPaymentReferenceInputChange,
  onPaymentReviewNotesChange,
  onClose,
  onReject,
  onConfirm,
}) => {
  const { t } = useTranslation();

  if (!order) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {t('admin.orders.reviewPayment', 'Review Payment')}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {t('admin.orders.reviewPaymentDesc', 'Confirm or reject this bank transfer submission before fulfillment.')}
        </p>

        <div className="space-y-3 text-sm mb-5">
          <p><span className="font-semibold">{t('admin.orders.orderId')}:</span> {order.id}</p>
          <p><span className="font-semibold">{t('admin.orders.amount')}:</span> ${order.amount.toLocaleString()}</p>
          <p><span className="font-semibold">{t('admin.orders.status')}:</span> {statusLabel(order.status)}</p>
          {order.status === 'PENDING_PAYMENT' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              {t('admin.orders.pendingPaymentHint', 'No client reference is currently submitted. Confirm only after external verification or keep waiting.')}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.orders.paymentReference', 'Payment Reference')}
            </label>
            <input
              type="text"
              data-testid="admin-orders-review-payment-reference-input"
              value={paymentReferenceInput}
              onChange={(e) => onPaymentReferenceInputChange(e.target.value)}
              placeholder={t('admin.orders.noReferenceProvided', 'Enter or verify payment reference')}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.orders.paymentNotes', 'Admin Notes')}
            </label>
            <textarea
              data-testid="admin-orders-review-payment-notes-input"
              value={paymentReviewNotes}
              onChange={(e) => onPaymentReviewNotesChange(e.target.value)}
              placeholder={t('admin.orders.paymentNotesPlaceholder', 'Add verification notes or rejection reason')}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
            disabled={isConfirmingPayment || isRejectingPayment}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onReject}
            data-testid="admin-orders-reject-payment-button"
            disabled={!canRejectPayment}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {isRejectingPayment
              ? t('common.saving', 'Saving...')
              : t('admin.orders.rejectPayment', 'Reject Payment')}
          </button>
          <button
            onClick={onConfirm}
            data-testid="admin-orders-confirm-payment-button"
            disabled={!canConfirmPayment}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {isConfirmingPayment
              ? t('common.saving', 'Saving...')
              : t('admin.orders.confirmPayment', 'Confirm Payment')}
          </button>
        </div>
      </div>
    </div>
  );
};

