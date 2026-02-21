import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { logger } from '../utils/logger';
import { poConfirmationService } from '../services/poConfirmationService';
import { OrderStatus } from '../types/types';

interface DualPOFlowProps {
  orderId: string;
  quoteId: string;
  onComplete: () => void;
  onCancel: () => void;
}

export const DualPOFlow: React.FC<DualPOFlowProps> = ({ orderId, quoteId, onComplete, onCancel }) => {
  const { t } = useTranslation();
  const toast = useToast();

  // Individual selectors to prevent infinite re-render loop
  const currentUser = useStore((state) => state.currentUser);
  const orders = useStore((state) => state.orders);
  const updateOrder = useStore((state) => state.updateOrder);
  const addNotification = useStore((state) => state.addNotification);

  const [step, setStep] = useState<'confirmation' | 'pending'>('confirmation');
  const [submitting, setSubmitting] = useState(false);
  const [isNotTestOrderConfirmed, setIsNotTestOrderConfirmed] = useState(false);
  const [isPaymentTermsConfirmed, setIsPaymentTermsConfirmed] = useState(false);

  const currentOrder = orders.find((item) => item.id === orderId);

  // Restore state if client already submitted confirmation
  useEffect(() => {
    if (!currentOrder) return;
    const hasSubmittedConfirmation = Boolean(
      currentOrder.client_po_confirmation_submitted_at
      || (currentOrder.not_test_order_confirmed_at && currentOrder.payment_terms_confirmed_at)
    );
    if (hasSubmittedConfirmation) {
      setStep('pending');
    }
  }, [
    currentOrder?.id,
    currentOrder?.client_po_confirmation_submitted_at,
    currentOrder?.not_test_order_confirmed_at,
    currentOrder?.payment_terms_confirmed_at,
  ]);

  const handleSubmitForConfirmation = async () => {
    if (!currentUser) return;
    if (!isNotTestOrderConfirmed || !isPaymentTermsConfirmed) return;

    setSubmitting(true);
    try {
      const confirmationTimestamp = new Date().toISOString();

      await poConfirmationService.submitClientPOConfirmation(orderId, {
        notTestOrderConfirmedAt: confirmationTimestamp,
        paymentTermsConfirmedAt: confirmationTimestamp,
        submittedAt: confirmationTimestamp,
      });

      await updateOrder(orderId, {
        status: OrderStatus.PENDING_ADMIN_CONFIRMATION,
        not_test_order_confirmed_at: confirmationTimestamp,
        payment_terms_confirmed_at: confirmationTimestamp,
        client_po_confirmation_submitted_at: confirmationTimestamp,
      });

      addNotification({
        type: 'order',
        title: t('notifications.poSubmittedTitle'),
        message: t('notifications.poSubmittedMessage'),
        actionUrl: '/app?tab=orders',
      });

      setStep('pending');
      toast.success(t('client.po.confirmationSubmitted'));
    } catch (error) {
      logger.error('Failed to submit PO confirmation:', error);
      toast.error(t('client.po.confirmationSubmitError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-8 shadow-2xl">

        {/* Step indicators */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 'confirmation' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
                <span className="material-symbols-outlined text-sm">fact_check</span>
              </div>
              <span className="text-xs mt-2 font-medium">{t('client.po.step0') || 'Confirm'}</span>
            </div>

            <div className={`w-16 h-0.5 ${step === 'pending' ? 'bg-green-600' : 'bg-neutral-300'}`} />

            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 'pending' ? 'bg-blue-600 text-white' : 'bg-neutral-300 text-neutral-500'}`}>
                <span className="material-symbols-outlined text-sm">pending</span>
              </div>
              <span className="text-xs mt-2 font-medium">{t('client.po.step3') || 'Pending'}</span>
            </div>
          </div>
        </div>

        {/* Step: Confirmation */}
        {step === 'confirmation' && (
          <div className="w-full">
            <div className="inline-block p-4 bg-blue-100 rounded-full mb-4">
              <span className="material-symbols-outlined text-blue-600 text-4xl">assignment_turned_in</span>
            </div>
            <h3 className="text-xl font-bold mb-2 text-neutral-800 text-center">
              {t('client.po.confirmationTitle') || 'Confirm Your Order'}
            </h3>
            <p className="text-neutral-500 text-sm mb-6 text-center">
              {t('client.po.confirmationDesc') || 'Please confirm the details below before submitting to our team for review.'}
            </p>

            <div className="space-y-3 mb-8">
              <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={isNotTestOrderConfirmed}
                  onChange={(e) => setIsNotTestOrderConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#137fec] focus:ring-[#137fec]"
                />
                <span className="text-sm text-gray-700">{t('client.po.checkboxNotTestOrder') || 'I confirm this is a real order, not a test.'}</span>
              </label>

              <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={isPaymentTermsConfirmed}
                  onChange={(e) => setIsPaymentTermsConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#137fec] focus:ring-[#137fec]"
                />
                <span className="text-sm text-gray-700">{t('client.po.checkboxPaymentTerms') || 'I understand and agree to the payment terms for this order.'}</span>
              </label>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={onCancel}
                className="px-6 py-3 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 font-medium"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleSubmitForConfirmation}
                disabled={submitting || !isNotTestOrderConfirmed || !isPaymentTermsConfirmed}
                className="px-6 py-3 bg-[#137fec] text-white rounded-lg hover:bg-[#137fec]/90 font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-base">
                  {submitting ? 'hourglass_empty' : 'send'}
                </span>
                {submitting ? (t('common.submitting') || 'Submitting…') : (t('client.po.submitForConfirmation') || 'Submit for Review')}
              </button>
            </div>
          </div>
        )}

        {/* Step: Pending admin review */}
        {step === 'pending' && (
          <div className="text-center">
            <div className="inline-block p-4 bg-amber-100 rounded-full mb-4">
              <span className="material-symbols-outlined text-amber-600 text-4xl">hourglass_top</span>
            </div>
            <h3 className="text-xl font-bold mb-2 text-neutral-800">
              {t('client.po.pendingAdminTitle') || 'Submitted for Review'}
            </h3>
            <p className="text-neutral-600 mb-6 text-sm">
              {t('client.po.pendingAdminMessage') || 'Your order confirmation has been received. Our team will review it and update the status shortly.'}
            </p>
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 mb-6">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">{t('client.po.orderStatus') || 'Status'}:</span> {t('client.po.pendingAdminReview') || 'Pending admin review'}
              </p>
            </div>
            <button
              onClick={onComplete}
              className="px-6 py-3 bg-[#137fec] text-white rounded-lg hover:bg-[#137fec]/90 font-semibold"
            >
              {t('common.done') || 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
