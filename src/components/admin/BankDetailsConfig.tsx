import { logger } from '@/src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../hooks/useToast';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import bankTransferService from '../../services/bankTransferService';
import type { BankDetails } from '../../types/types';

export const BankDetailsConfig: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const [bankDetails, setBankDetails] = useState<BankDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({
    bankName: '',
    accountName: '',
    accountNumber: '',
    iban: '',
    swiftCode: '',
    branchName: '',
    branchCode: '',
    currency: 'SAR',
    notes: '',
  });

  useEffect(() => {
    loadBankDetails();
  }, []);

  const loadBankDetails = async () => {
    setIsLoading(true);
    try {
      const data = await bankTransferService.getAllBankDetails();
      setBankDetails(data);
    } catch (error) {
      logger.error('Error loading bank details:', error);
      toast.error(t('toast.bankDetailsLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        await bankTransferService.updateBankDetails(editingId, formData);
        toast.success(t('toast.bankDetailsUpdated'));
      } else {
        await bankTransferService.createBankDetails({
          ...formData,
          isActive: bankDetails.length === 0,
        });
        toast.success(t('toast.bankDetailsCreated'));
      }

      setIsEditing(false);
      setEditingId(null);
      resetForm();
      loadBankDetails();
    } catch (error) {
      logger.error('Error saving bank details:', error);
      toast.error(t('toast.failedToSaveBankDetails'));
    }
  };

  const handleEdit = (details: BankDetails) => {
    setFormData({
      bankName: details.bankName,
      accountName: details.accountName,
      accountNumber: details.accountNumber,
      iban: details.iban || '',
      swiftCode: details.swiftCode || '',
      branchName: details.branchName || '',
      branchCode: details.branchCode || '',
      currency: details.currency,
      notes: details.notes || '',
    });
    setEditingId(details.id);
    setIsEditing(true);
  };

  const handleSetActive = async (id: string) => {
    try {
      await bankTransferService.setActiveBankDetails(id);
      toast.success(t('toast.activeBankUpdated'));
      loadBankDetails();
    } catch (error) {
      logger.error('Error setting active:', error);
      toast.error(t('toast.failedToSetActive'));
    }
  };

  const handleDelete = async (id: string) => {
    setPendingDeleteId(id);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      setIsDeleting(true);
      await bankTransferService.deleteBankDetails(pendingDeleteId);
      toast.success(t('toast.bankDetailsDeleted'));
      setPendingDeleteId(null);
      loadBankDetails();
    } catch (error) {
      logger.error('Error deleting:', error);
      toast.error(t('toast.failedToDeleteBank'));
    } finally {
      setIsDeleting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      bankName: '',
      accountName: '',
      accountNumber: '',
      iban: '',
      swiftCode: '',
      branchName: '',
      branchCode: '',
      currency: 'SAR',
      notes: '',
    });
    setEditingId(null);
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('bankConfig.title')}</h2>
          <p className="text-gray-600 mt-1">{t('bankConfig.subtitle')}</p>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined">add</span>
            {t('bankConfig.addBankAccount')}
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? t('bankConfig.editBankDetails') : t('bankConfig.addNewBank')}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bankConfig.bankName')} *
                </label>
                <input
                  type="text"
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleInputChange}
                  required
                  placeholder="Al Rajhi Bank"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bankConfig.accountName')} *
                </label>
                <input
                  type="text"
                  name="accountName"
                  value={formData.accountName}
                  onChange={handleInputChange}
                  required
                  placeholder="MWRD Trading Company"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bankConfig.accountNumber')} *
                </label>
                <input
                  type="text"
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={handleInputChange}
                  required
                  placeholder="123456789012"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bankConfig.iban')}
                </label>
                <input
                  type="text"
                  name="iban"
                  value={formData.iban}
                  onChange={handleInputChange}
                  placeholder="SA00XXXX0000000000000000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bankConfig.swiftCode')}
                </label>
                <input
                  type="text"
                  name="swiftCode"
                  value={formData.swiftCode}
                  onChange={handleInputChange}
                  placeholder="BANKSA00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bankConfig.currency')}
                </label>
                <input
                  type="text"
                  name="currency"
                  value={formData.currency}
                  onChange={handleInputChange}
                  placeholder="SAR"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bankConfig.branchName')}
                </label>
                <input
                  type="text"
                  name="branchName"
                  value={formData.branchName}
                  onChange={handleInputChange}
                  placeholder="Riyadh Main Branch"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bankConfig.branchCode')}
                </label>
                <input
                  type="text"
                  name="branchCode"
                  value={formData.branchCode}
                  onChange={handleInputChange}
                  placeholder="001"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('bankConfig.notes')}
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={3}
                placeholder={t('bankConfig.notesPlaceholder')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors"
              >
                {editingId ? t('bankConfig.update') : t('bankConfig.create')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {bankDetails.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <span className="material-symbols-outlined text-gray-400 text-6xl">account_balance</span>
            <p className="mt-4 text-gray-600">{t('bankConfig.noBankDetails')}</p>
            <p className="text-sm text-gray-500 mt-2">{t('bankConfig.addFirstAccount')}</p>
          </div>
        ) : (
          bankDetails.map(details => (
            <div
              key={details.id}
              className={`bg-white rounded-xl shadow-sm border-2 p-6 ${
                details.isActive ? 'border-green-500' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="size-12 bg-[#0A2540] rounded-lg flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-2xl">account_balance</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{details.bankName}</h3>
                      <p className="text-sm text-gray-600">{details.accountName}</p>
                    </div>
                    {details.isActive && (
                      <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                        {t('bankConfig.active')}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">{t('bankConfig.accountNumber')}</p>
                      <p className="font-medium text-gray-900">{details.accountNumber}</p>
                    </div>
                    {details.iban && (
                      <div>
                        <p className="text-gray-500">{t('bankConfig.iban')}</p>
                        <p className="font-medium text-gray-900">{details.iban}</p>
                      </div>
                    )}
                    {details.swiftCode && (
                      <div>
                        <p className="text-gray-500">{t('bankConfig.swiftCode')}</p>
                        <p className="font-medium text-gray-900">{details.swiftCode}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-500">{t('bankConfig.currency')}</p>
                      <p className="font-medium text-gray-900">{details.currency}</p>
                    </div>
                  </div>

                  {details.notes && (
                    <p className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                      {details.notes}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  {!details.isActive && (
                    <button
                      onClick={() => handleSetActive(details.id)}
                      className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                    >
                      {t('bankConfig.setActive')}
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(details)}
                    className="p-2 text-gray-600 hover:text-[#0A2540] transition-colors"
                  >
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(details.id)}
                    className="p-2 text-gray-600 hover:text-red-600 transition-colors"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteId)}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title={t('bankConfig.deleteTitle', 'Delete bank account')}
        message={t('bankConfig.deleteConfirm')}
        confirmText={t('common.delete', 'Delete')}
        cancelText={t('common.cancel', 'Cancel')}
        type="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};
