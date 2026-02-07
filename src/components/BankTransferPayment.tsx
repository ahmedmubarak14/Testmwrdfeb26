import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getActiveBankDetails } from '../services/bankTransferService';
import type { BankDetails } from '../types/types';

interface BankTransferPaymentProps {
  orderId: string;
  amount: number;
  onConfirm: (receiptFile?: File) => void;
  onCancel: () => void;
}

export const BankTransferPayment: React.FC<BankTransferPaymentProps> = ({
  orderId,
  amount,
  onConfirm,
  onCancel
}) => {
  const { t } = useTranslation();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [loadingBank, setLoadingBank] = useState(true);

  useEffect(() => {
    getActiveBankDetails()
      .then(details => setBankDetails(details))
      .catch(() => setBankDetails(null))
      .finally(() => setLoadingBank(false));
  }, []);

  const paymentReference = `MWRD-${orderId}-${Date.now().toString(36).toUpperCase()}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
    }
  };

  const handleConfirmPayment = () => {
    setConfirmed(true);
    setTimeout(() => {
      onConfirm(uploadedFile || undefined);
    }, 1500);
  };

  if (confirmed) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-green-600 text-3xl">check_circle</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('payment.bankTransfer.awaitingConfirmation')}</h2>
          <p className="text-gray-600 mb-4">{t('payment.bankTransfer.processingTime')}</p>
          <div className="animate-pulse flex justify-center">
            <span className="material-symbols-outlined text-[#137fec] animate-spin">progress_activity</span>
          </div>
        </div>
      </div>
    );
  }

  if (loadingBank) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <span className="material-symbols-outlined text-[#137fec] animate-spin text-3xl">progress_activity</span>
          <p className="mt-2 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!bankDetails) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <span className="material-symbols-outlined text-amber-500 text-3xl mb-2">warning</span>
          <p className="text-gray-800 font-medium">{t('paymentInstructions.bankNotConfigured')}</p>
          <p className="text-gray-500 text-sm mt-1">{t('paymentInstructions.contactSupport')}</p>
          <button onClick={onCancel} className="mt-4 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full my-8">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">{t('payment.bankTransfer.title')}</h2>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-blue-800 text-sm font-medium">{t('payment.bankTransfer.instructions')}</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">{t('payment.bankTransfer.bankName')}</p>
                <p className="font-medium text-gray-900">{bankDetails.bankName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('payment.bankTransfer.accountName')}</p>
                <p className="font-medium text-gray-900">{bankDetails.accountName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('payment.bankTransfer.accountNumber')}</p>
                <p className="font-medium text-gray-900 font-mono">{bankDetails.accountNumber}</p>
              </div>
              {bankDetails.swiftCode && (
              <div>
                <p className="text-sm text-gray-500">{t('payment.bankTransfer.swiftCode')}</p>
                <p className="font-medium text-gray-900 font-mono">{bankDetails.swiftCode}</p>
              </div>
              )}
            </div>
            {bankDetails.iban && (
            <div>
              <p className="text-sm text-gray-500">{t('payment.bankTransfer.iban')}</p>
              <p className="font-medium text-gray-900 font-mono text-sm break-all">{bankDetails.iban}</p>
            </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600">info</span>
              <div>
                <p className="font-medium text-amber-800">{t('payment.bankTransfer.reference')}</p>
                <p className="font-mono text-lg text-amber-900 mt-1">{paymentReference}</p>
                <p className="text-sm text-amber-700 mt-1">{t('payment.bankTransfer.referenceHint')}</p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-green-800 font-medium">{t('payment.bankTransfer.amount')}</span>
              <span className="text-2xl font-bold text-green-900">{amount.toLocaleString('en-SA', {style: 'currency', currency: 'SAR', minimumFractionDigits: 2})}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('payment.bankTransfer.uploadReceipt')}</label>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-[#137fec] transition-colors cursor-pointer">
              <input
                type="file"
                onChange={handleFileChange}
                accept="image/*,.pdf"
                className="hidden"
                id="receipt-upload"
              />
              <label htmlFor="receipt-upload" className="cursor-pointer">
                {uploadedFile ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <span className="material-symbols-outlined">check_circle</span>
                    <span className="font-medium">{uploadedFile.name}</span>
                  </div>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-gray-400 text-3xl mb-2">upload_file</span>
                    <p className="text-sm text-gray-500">{t('payment.bankTransfer.uploadReceipt')}</p>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirmPayment}
            className="flex-1 px-4 py-3 rounded-xl bg-[#137fec] text-white font-bold hover:bg-[#137fec]/90 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">check</span>
            {t('payment.bankTransfer.confirmPayment')}
          </button>
        </div>
      </div>
    </div>
  );
};
