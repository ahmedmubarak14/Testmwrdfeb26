import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orderDocumentService } from '../services/orderDocumentService';
import { poGeneratorService, POData } from '../services/poGeneratorService';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { logger } from '../utils/logger';
import { OrderStatus } from '../types/types';
import { poConfirmationService } from '../services/poConfirmationService';

interface DualPOFlowProps {
  orderId: string;
  quoteId: string;
  onComplete: () => void;
  onCancel: () => void;
}

export const DualPOFlow: React.FC<DualPOFlowProps> = ({ orderId, quoteId, onComplete, onCancel }) => {
  const { t } = useTranslation();
  const toast = useToast();

  // Use individual selectors to avoid returning a new object on every render
  // (which causes "Maximum update depth exceeded" / infinite re-render loop).
  const currentUser = useStore((state) => state.currentUser);
  const orders = useStore((state) => state.orders);
  const quotes = useStore((state) => state.quotes);
  const rfqs = useStore((state) => state.rfqs);
  const products = useStore((state) => state.products);
  const updateOrder = useStore((state) => state.updateOrder);
  const addNotification = useStore((state) => state.addNotification);

  const [step, setStep] = useState<'confirmation' | 'download' | 'upload' | 'pending'>('confirmation');
  const [uploading, setUploading] = useState(false);
  const [downloadedPO, setDownloadedPO] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submittingConfirmation, setSubmittingConfirmation] = useState(false);
  const [isNotTestOrderConfirmed, setIsNotTestOrderConfirmed] = useState(false);
  const [isPaymentTermsConfirmed, setIsPaymentTermsConfirmed] = useState(false);
  const currentOrder = orders.find((item) => item.id === orderId);

  useEffect(() => {
    if (!currentOrder) return;

    const hasSubmittedConfirmation = Boolean(
      currentOrder.client_po_confirmation_submitted_at
      || (currentOrder.not_test_order_confirmed_at && currentOrder.payment_terms_confirmed_at)
    );

    if (currentOrder.client_po_uploaded) {
      setDownloadedPO(Boolean(currentOrder.system_po_generated));
      setStep('pending');
      return;
    }

    if (currentOrder.system_po_generated) {
      setDownloadedPO(true);
      setStep('upload');
      return;
    }

    if (hasSubmittedConfirmation) {
      setStep('download');
      return;
    }

    setDownloadedPO(false);
    setStep('confirmation');
  }, [
    currentOrder?.id,
    currentOrder?.client_po_uploaded,
    currentOrder?.system_po_generated,
    currentOrder?.client_po_confirmation_submitted_at,
    currentOrder?.not_test_order_confirmed_at,
    currentOrder?.payment_terms_confirmed_at,
  ]);

  const handleSubmitForConfirmation = async () => {
    if (!currentUser) return;
    if (!isNotTestOrderConfirmed || !isPaymentTermsConfirmed) return;

    setSubmittingConfirmation(true);
    try {
      const confirmationTimestamp = new Date().toISOString();

      await poConfirmationService.submitClientPOConfirmation(orderId, {
        notTestOrderConfirmedAt: confirmationTimestamp,
        paymentTermsConfirmedAt: confirmationTimestamp,
        submittedAt: confirmationTimestamp,
      });

      await updateOrder(orderId, {
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

      setStep('download');
      toast.success(t('client.po.confirmationSubmitted'));
    } catch (error) {
      logger.error('Failed to submit PO confirmation:', error);
      toast.error(t('client.po.confirmationSubmitError'));
    } finally {
      setSubmittingConfirmation(false);
    }
  };

  const handleDownloadPO = async () => {
    try {
      if (!currentUser) return;
      setGenerating(true);

      const order = currentOrder;
      const quote = quotes.find((item) => item.id === quoteId);
      const rfq = quote ? rfqs.find((item) => item.id === quote.rfqId) : null;

      if (!order || !quote || !rfq) {
        toast.error(t('client.po.orderDetailsNotFound'));
        return;
      }

      const poData: POData = {
        order,
        quote,
        rfq,
        products,
        client: currentUser,
      };

      await poGeneratorService.downloadPO(poData);
      const pdfBlob = await poGeneratorService.generateSystemPO(poData);
      await orderDocumentService.generateSystemPO(orderId, currentUser.id, pdfBlob);

      setDownloadedPO(true);
      toast.success(t('client.po.downloadSuccess'));
      setTimeout(() => setStep('upload'), 500);
    } catch (error) {
      logger.error('Error downloading PO:', error);
      toast.error(t('client.po.downloadError'));
    } finally {
      setGenerating(false);
    }
  };

  const handleUploadPO = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    if (file.type !== 'application/pdf') {
      toast.error(t('client.po.invalidFileType'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('client.po.fileTooLarge'));
      return;
    }

    setUploading(true);
    try {
      await orderDocumentService.uploadClientPO(orderId, file, currentUser.id);

      await updateOrder(orderId, {
        status: OrderStatus.PENDING_ADMIN_CONFIRMATION,
        client_po_uploaded: true,
      });

      addNotification({
        type: 'order',
        title: t('notifications.poPendingAdminTitle'),
        message: t('notifications.poPendingAdminMessage'),
        actionUrl: '/app?tab=orders',
      });

      setStep('pending');
      toast.success(t('client.po.uploadSuccess'));
      setTimeout(() => onComplete(), 1400);
    } catch (error) {
      logger.error('Upload failed:', error);
      toast.error(t('client.po.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 'confirmation' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
                <span className="material-symbols-outlined text-sm">fact_check</span>
              </div>
              <span className="text-xs mt-2 font-medium">{t('client.po.step0')}</span>
            </div>

            <div className={`w-14 h-0.5 ${step === 'confirmation' ? 'bg-neutral-300' : 'bg-green-600'}`} />

            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 'download' ? 'bg-blue-600 text-white' : downloadedPO ? 'bg-green-600 text-white' : 'bg-neutral-300 text-neutral-500'}`}>
                <span className="material-symbols-outlined text-sm">download</span>
              </div>
              <span className="text-xs mt-2 font-medium">{t('client.po.step1')}</span>
            </div>

            <div className={`w-14 h-0.5 ${step === 'upload' || step === 'pending' ? 'bg-green-600' : 'bg-neutral-300'}`} />

            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 'upload' ? 'bg-blue-600 text-white' : step === 'pending' ? 'bg-green-600 text-white' : 'bg-neutral-300 text-neutral-500'}`}>
                <span className="material-symbols-outlined text-sm">upload</span>
              </div>
              <span className="text-xs mt-2 font-medium">{t('client.po.step2')}</span>
            </div>

            <div className={`w-14 h-0.5 ${step === 'pending' ? 'bg-green-600' : 'bg-neutral-300'}`} />

            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 'pending' ? 'bg-blue-600 text-white' : 'bg-neutral-300 text-neutral-500'}`}>
                <span className="material-symbols-outlined text-sm">pending</span>
              </div>
              <span className="text-xs mt-2 font-medium">{t('client.po.step3')}</span>
            </div>
          </div>
        </div>

        <div className="min-h-[320px] flex flex-col items-center justify-center">
          {step === 'confirmation' && (
            <div className="w-full max-w-xl">
              <div className="inline-block p-4 bg-blue-100 rounded-full mb-4">
                <span className="material-symbols-outlined text-blue-600 text-4xl">assignment_turned_in</span>
              </div>
              <h3 className="text-xl font-bold mb-4 text-neutral-800 text-center">{t('client.po.confirmationTitle')}</h3>
              <p className="text-neutral-600 mb-6 text-center">{t('client.po.confirmationDesc')}</p>

              <div className="space-y-3 mb-8">
                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={isNotTestOrderConfirmed}
                    onChange={(event) => setIsNotTestOrderConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#137fec] focus:ring-[#137fec]"
                    aria-label={t('client.po.checkboxNotTestOrder')}
                  />
                  <span className="text-sm text-gray-700">{t('client.po.checkboxNotTestOrder')}</span>
                </label>

                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={isPaymentTermsConfirmed}
                    onChange={(event) => setIsPaymentTermsConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#137fec] focus:ring-[#137fec]"
                    aria-label={t('client.po.checkboxPaymentTerms')}
                  />
                  <span className="text-sm text-gray-700">{t('client.po.checkboxPaymentTerms')}</span>
                </label>
              </div>

              <div className="flex justify-center gap-3">
                <button
                  onClick={onCancel}
                  className="px-6 py-3 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSubmitForConfirmation}
                  disabled={submittingConfirmation || !isNotTestOrderConfirmed || !isPaymentTermsConfirmed}
                  className="px-6 py-3 bg-[#137fec] text-white rounded-lg hover:bg-[#137fec]/90 font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-base">
                    {submittingConfirmation ? 'hourglass_empty' : 'send'}
                  </span>
                  <span>{t('client.po.submitForConfirmation')}</span>
                </button>
              </div>
            </div>
          )}

          {step === 'download' && (
            <div className="text-center max-w-md">
              <div className="inline-block p-4 bg-blue-100 rounded-full mb-4">
                <span className="material-symbols-outlined text-blue-600 text-4xl">description</span>
              </div>
              <h3 className="text-xl font-bold mb-4 text-neutral-800">{t('client.po.downloadTitle')}</h3>
              <p className="text-neutral-600 mb-6">{t('client.po.downloadDesc')}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={onCancel}
                  className="px-6 py-3 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleDownloadPO}
                  disabled={generating}
                  className="px-6 py-3 bg-[#137fec] text-white rounded-lg hover:bg-[#137fec]/90 font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined">{generating ? 'hourglass_empty' : 'download'}</span>
                  {generating ? t('client.po.generating') : t('client.po.downloadButton')}
                </button>
              </div>
            </div>
          )}

          {step === 'upload' && (
            <div className="text-center max-w-md">
              <div className="inline-block p-4 bg-green-100 rounded-full mb-4">
                <span className="material-symbols-outlined text-green-600 text-4xl">upload_file</span>
              </div>
              <h3 className="text-xl font-bold mb-4 text-neutral-800">{t('client.po.uploadTitle')}</h3>
              <p className="text-neutral-600 mb-6">{t('client.po.uploadDesc')}</p>

              <label className="cursor-pointer block">
                <div className="border-2 border-dashed border-neutral-300 rounded-lg p-8 hover:border-blue-500 hover:bg-blue-50 transition-colors">
                  <span className="material-symbols-outlined text-neutral-400 text-5xl mb-2">cloud_upload</span>
                  <p className="text-neutral-700 font-medium mb-1">
                    {uploading ? t('client.po.uploading') : t('client.po.clickToUpload')}
                  </p>
                  <p className="text-xs text-neutral-500">{t('client.po.pdfOnly')}</p>
                </div>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleUploadPO}
                  className="hidden"
                  disabled={uploading}
                />
              </label>

              <button
                onClick={onCancel}
                className="mt-4 px-4 py-2 text-neutral-600 hover:text-neutral-800"
                disabled={uploading}
              >
                {t('common.cancel')}
              </button>
            </div>
          )}

          {step === 'pending' && (
            <div className="text-center max-w-md">
              <div className="inline-block p-4 bg-orange-100 rounded-full mb-4">
                <span className="material-symbols-outlined text-orange-600 text-4xl">hourglass_top</span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-neutral-800">{t('client.po.pendingAdminTitle')}</h3>
              <p className="text-neutral-600 mb-6">{t('client.po.pendingAdminMessage')}</p>
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <p className="text-sm text-orange-800">
                  <span className="font-semibold">{t('client.po.orderStatus')}:</span> {t('status.pending_admin_confirmation')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
