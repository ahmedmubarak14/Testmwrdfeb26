import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

const PROFILE_PICTURE_BUCKET = 'profile-pictures';
const MAX_PROFILE_PICTURE_SIZE_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export interface ProfilePictureUploadResult {
  success: boolean;
  publicUrl?: string;
  storagePath?: string;
  error?: string;
}

const getFileExtension = (file: File): string => {
  const fromName = file.name.split('.').pop()?.trim().toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (file.type.startsWith('image/')) {
    return file.type.replace('image/', '').toLowerCase();
  }

  return 'png';
};

export const profilePictureService = {
  async uploadProfilePicture(userId: string, file: File): Promise<ProfilePictureUploadResult> {
    if (!file.type.startsWith('image/')) {
      return { success: false, error: 'Please upload an image file.' };
    }

    if (file.size > MAX_PROFILE_PICTURE_SIZE_BYTES) {
      return { success: false, error: 'File size must be less than 5MB.' };
    }

    const extension = getFileExtension(file);
    const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_PICTURE_BUCKET)
      .upload(storagePath, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type
      });

    if (uploadError) {
      logger.error('Failed to upload profile picture:', uploadError);
      return { success: false, error: uploadError.message };
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(PROFILE_PICTURE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      logger.warn('Profile picture uploaded but signed URL generation failed', {
        storagePath,
        error: signedUrlError?.message
      });
    }

    return {
      success: true,
      publicUrl: signedUrlData?.signedUrl,
      storagePath
    };
  }
};
