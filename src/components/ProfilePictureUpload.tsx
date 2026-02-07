import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { appConfig } from '../config/appConfig';
import { authService } from '../services/authService';
import { profilePictureService } from '../services/profilePictureService';
import { logger } from '../utils/logger';

interface ProfilePictureUploadProps {
  currentImage?: string;
  userName?: string;
}

export const ProfilePictureUpload: React.FC<ProfilePictureUploadProps> = ({ 
  currentImage,
  userName = 'User'
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const currentUser = useStore(state => state.currentUser);
  const setProfilePicture = useStore(state => state.setProfilePicture);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (previewImage?.startsWith('blob:')) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

  const clearSelection = () => {
    setPreviewImage(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('settings.profilePicture.fileTooLarge', 'File size must be less than 5MB'));
        return;
      }

      if (!file.type.startsWith('image/')) {
        toast.error(t('settings.profilePicture.invalidFileType', 'Please select an image file'));
        return;
      }

      if (previewImage?.startsWith('blob:')) {
        URL.revokeObjectURL(previewImage);
      }

      const objectUrl = URL.createObjectURL(file);
      setPreviewImage(objectUrl);
      setSelectedFile(file);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) {
      return;
    }

    try {
      setIsSaving(true);

      if (appConfig.supabase.isConfigured) {
        if (!currentUser?.id) {
          toast.error(t('errors.unauthorized', 'You must be signed in'));
          return;
        }

        const uploadResult = await profilePictureService.uploadProfilePicture(currentUser.id, selectedFile);
        if (!uploadResult.success || !uploadResult.storagePath) {
          toast.error(uploadResult.error || t('settings.profilePicture.uploadFailed', 'Failed to upload profile picture'));
          return;
        }

        const metadataResult = await authService.updateProfilePicture(
          null,
          uploadResult.storagePath
        );
        if (!metadataResult.success) {
          toast.error(metadataResult.error || t('settings.profilePicture.uploadFailed', 'Failed to save profile picture'));
          return;
        }

        const resolvedProfilePicture =
          metadataResult.user?.profilePicture || uploadResult.publicUrl || '';
        setProfilePicture(resolvedProfilePicture);
      } else if (previewImage) {
        setProfilePicture(previewImage);
      }

      toast.success(t('settings.profilePicture.saved', 'Profile picture updated'));
      clearSelection();
    } catch (error) {
      logger.error('Error saving profile picture:', error);
      toast.error(t('settings.profilePicture.uploadFailed', 'Failed to upload profile picture'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (previewImage?.startsWith('blob:')) {
      URL.revokeObjectURL(previewImage);
    }
    clearSelection();
  };

  const handleRemove = async () => {
    try {
      setIsSaving(true);
      if (appConfig.supabase.isConfigured) {
        const metadataResult = await authService.updateProfilePicture(null, null);
        if (!metadataResult.success) {
          toast.error(metadataResult.error || t('settings.profilePicture.removeFailed', 'Failed to remove profile picture'));
          return;
        }
      }

      setProfilePicture('');
      if (previewImage?.startsWith('blob:')) {
        URL.revokeObjectURL(previewImage);
      }
      clearSelection();
      toast.success(t('settings.profilePicture.removed', 'Profile picture removed'));
    } catch (error) {
      logger.error('Error removing profile picture:', error);
      toast.error(t('settings.profilePicture.removeFailed', 'Failed to remove profile picture'));
    } finally {
      setIsSaving(false);
    }
  };

  const displayImage = previewImage || currentImage;
  const initial = userName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
      <div 
        className="relative"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="w-24 h-24 rounded-full overflow-hidden bg-[#137fec] flex items-center justify-center text-white text-3xl font-bold shadow-lg">
          {displayImage ? (
            <img 
              src={displayImage} 
              alt={userName}
              className="w-full h-full object-cover"
            />
          ) : (
            initial
          )}
        </div>
        
        {isHovering && !previewImage && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSaving}
            className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white transition-opacity"
          >
            <span className="material-symbols-outlined text-2xl">photo_camera</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {t('settings.profilePicture.title', 'Profile Picture')}
          </h3>
          <p className="text-sm text-gray-500">
            {t('settings.profilePicture.description', 'Upload a photo to personalize your account')}
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {previewImage ? (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-[#137fec] text-white rounded-lg text-sm font-medium hover:bg-[#137fec]/90 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">check</span>
              {isSaving
                ? t('common.saving', 'Saving...')
                : t('common.save', 'Save')}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving}
              className="px-4 py-2 bg-[#137fec] text-white rounded-lg text-sm font-medium hover:bg-[#137fec]/90 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">upload</span>
              {t('settings.profilePicture.upload', 'Upload Photo')}
            </button>
            {currentImage && (
              <button
                onClick={handleRemove}
                disabled={isSaving}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                {t('settings.profilePicture.remove', 'Remove')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
