import React from 'react';
import { useTranslation } from 'react-i18next';
import { Order } from '../../../types/types';

interface PaymentLinkModalProps {
  order: Order | null;
  paymentLinkUrl: string;
  isSaving: boolean;
  onPaymentLinkUrlChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

export const PaymentLinkModal: React.FC<PaymentLinkModalProps> = ({
  order,
  paymentLinkUrl,
  isSaving,
  onPaymentLinkUrlChange,
  onCancel,
  onSave,
}) => {
  const { t } = useTranslation();

  if (!order) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {t('admin.orders.setPaymentLink', 'Set Payment Link')}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {t('admin.orders.setPaymentLinkDesc', 'Store the external payment link for this order. Only admins can edit this.')}
        </p>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            {t('admin.orders.paymentLink', 'Payment Link')}
          </label>
          <input
            type="url"
            value={paymentLinkUrl}
            onChange={(e) => onPaymentLinkUrlChange(e.target.value)}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {order.paymentLinkSentAt && (
            <p className="text-xs text-gray-500">
              {t('admin.orders.paymentLinkSentAt', 'Last sent')}: {new Date(order.paymentLinkSentAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving
              ? t('common.saving', 'Saving...')
              : t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
};

