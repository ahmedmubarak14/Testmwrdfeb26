import { logger } from '@/src/utils/logger';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../hooks/useToast';
import { LoadingSpinner } from './ui/LoadingSpinner';
import customItemRequestService from '../services/customItemRequestService';
import { RequestPriority } from '../types/types';
import { supabase } from '../lib/supabase';
import { appConfig } from '../config/appConfig';

interface CustomItemRequestFormProps {
  clientId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const CustomItemRequestForm: React.FC<CustomItemRequestFormProps> = ({
  clientId,
  onSuccess,
  onCancel,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referenceImageFiles, setReferenceImageFiles] = useState<File[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    itemName: '',
    description: '',
    specifications: '',
    category: '',
    quantity: 1,
    targetPrice: '',
    deadline: '',
    priority: RequestPriority.MEDIUM,
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
  const REQUEST_FILES_BUCKET = 'custom-request-files';

  const sanitizeFileName = (name: string): string => name.replace(/[^a-zA-Z0-9._-]/g, '_');

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>, type: 'images' | 'attachments') => {
    const selected = Array.from(event.target.files || []);
    if (selected.length === 0) return;

    const oversized = selected.find((file) => file.size > MAX_UPLOAD_FILE_BYTES);
    if (oversized) {
      toast.error(t('customRequest.fileTooLarge', 'Each file must be smaller than 10MB.'));
      event.target.value = '';
      return;
    }

    if (type === 'images') {
      const invalid = selected.find((file) => !file.type.startsWith('image/'));
      if (invalid) {
        toast.error(t('customRequest.imagesOnly', 'Please select image files only.'));
        event.target.value = '';
        return;
      }

      setReferenceImageFiles((prev) => [...prev, ...selected]);
    } else {
      setAttachmentFiles((prev) => [...prev, ...selected]);
    }

    event.target.value = '';
  };

  const removeSelectedFile = (type: 'images' | 'attachments', index: number) => {
    if (type === 'images') {
      setReferenceImageFiles((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFilesToStorage = async (files: File[], folder: 'reference-images' | 'attachments'): Promise<string[]> => {
    if (!appConfig.features.useDatabase || files.length === 0) {
      return [];
    }

    const uploads = await Promise.all(
      files.map(async (file, index) => {
        const uniquePart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}_${index}`;
        const filePath = `${clientId}/${folder}/${uniquePart}_${sanitizeFileName(file.name)}`;

        const { error } = await supabase.storage
          .from(REQUEST_FILES_BUCKET)
          .upload(filePath, file, { upsert: false });

        if (error) {
          throw new Error(error.message);
        }

        return `storage://${REQUEST_FILES_BUCKET}/${filePath}`;
      })
    );

    return uploads;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.itemName.trim() || !formData.description.trim()) {
      toast.error(t('errors.requiredFields'));
      return;
    }

    setIsSubmitting(true);
    try {
      const [referenceImages, attachmentUrls] = await Promise.all([
        uploadFilesToStorage(referenceImageFiles, 'reference-images'),
        uploadFilesToStorage(attachmentFiles, 'attachments'),
      ]);

      await customItemRequestService.createCustomRequest({
        clientId,
        itemName: formData.itemName,
        description: formData.description,
        specifications: formData.specifications || undefined,
        category: formData.category || undefined,
        quantity: formData.quantity,
        targetPrice: formData.targetPrice ? parseFloat(formData.targetPrice) : undefined,
        currency: 'SAR',
        deadline: formData.deadline || undefined,
        priority: formData.priority,
        referenceImages,
        attachmentUrls,
      });

      toast.success(t('toast.customRequestSubmitted'));
      onSuccess?.();
    } catch (error) {
      logger.error('Error submitting request:', error);
      toast.error(t('toast.failedToSubmitRequest'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('customRequest.title')}</h2>
        <p className="text-gray-600 mt-1">
          {t('customRequest.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('customRequest.itemName')} *
          </label>
          <input
            type="text"
            name="itemName"
            value={formData.itemName}
            onChange={handleInputChange}
            required
            placeholder={t('customRequest.itemNamePlaceholder')}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('customRequest.description')} *
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            required
            rows={4}
            placeholder={t('customRequest.descriptionPlaceholder')}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('customRequest.specifications')}
          </label>
          <textarea
            name="specifications"
            value={formData.specifications}
            onChange={handleInputChange}
            rows={3}
            placeholder={t('customRequest.specificationsPlaceholder')}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('customRequest.category')}
            </label>
            <input
              type="text"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              placeholder={t('customRequest.categoryPlaceholder')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('customRequest.quantity')} *
            </label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleInputChange}
              required
              min="1"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('customRequest.targetPrice')}
            </label>
            <input
              type="number"
              name="targetPrice"
              value={formData.targetPrice}
              onChange={handleInputChange}
              min="0"
              step="0.01"
              placeholder="0.00"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">{t('customRequest.targetPriceHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('customRequest.priority')}
            </label>
            <select
              name="priority"
              value={formData.priority}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
            >
              <option value={RequestPriority.LOW}>{t('customRequest.priorityLow')}</option>
              <option value={RequestPriority.MEDIUM}>{t('customRequest.priorityMedium')}</option>
              <option value={RequestPriority.HIGH}>{t('customRequest.priorityHigh')}</option>
              <option value={RequestPriority.URGENT}>{t('customRequest.priorityUrgent')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('customRequest.neededBy')}
          </label>
          <input
            type="date"
            name="deadline"
            value={formData.deadline}
            onChange={handleInputChange}
            min={new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('customRequest.referenceImages', 'Reference Images')}
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => handleFilesSelected(event, 'images')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
            />
            {referenceImageFiles.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                {referenceImageFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                    <span className="truncate pr-2">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeSelectedFile('images', index)}
                      className="text-red-600 hover:text-red-700 font-medium"
                    >
                      {t('common.remove', 'Remove')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('customRequest.attachments', 'Attachments')}
            </label>
            <input
              type="file"
              multiple
              onChange={(event) => handleFilesSelected(event, 'attachments')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
            />
            {attachmentFiles.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                {attachmentFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                    <span className="truncate pr-2">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeSelectedFile('attachments', index)}
                      className="text-red-600 hover:text-red-700 font-medium"
                    >
                      {t('common.remove', 'Remove')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-blue-600 text-xl">info</span>
            <div>
              <p className="text-sm font-medium text-blue-900">{t('customRequest.whatHappensNext')}</p>
              <ul className="text-sm text-blue-700 mt-2 space-y-1">
                <li>• {t('customRequest.step1')}</li>
                <li>• {t('customRequest.step2')}</li>
                <li>• {t('customRequest.step3')}</li>
                <li>• {t('customRequest.step4')}</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="sm" />
                <span>{t('customRequest.submitting')}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">send</span>
                <span>{t('customRequest.submitRequest')}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
