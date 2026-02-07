import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabase = vi.hoisted(() => {
  const upload = vi.fn();
  const createSignedUrl = vi.fn();

  const from = vi.fn(() => ({
    upload,
    createSignedUrl,
  }));

  return {
    storage: { from },
    upload,
    createSignedUrl,
    from,
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: mockSupabase.storage,
  },
}));

import { profilePictureService } from './profilePictureService';

function buildImageFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

describe('profilePictureService.uploadProfilePicture', () => {
  beforeEach(() => {
    mockSupabase.upload.mockReset();
    mockSupabase.createSignedUrl.mockReset();
    mockSupabase.from.mockClear();
  });

  it('rejects non-image files', async () => {
    const textFile = new File(['content'], 'notes.txt', { type: 'text/plain' });
    const result = await profilePictureService.uploadProfilePicture('user-1', textFile);

    expect(result.success).toBe(false);
    expect(result.error).toContain('image file');
    expect(mockSupabase.upload).not.toHaveBeenCalled();
  });

  it('uploads image and returns signed URL + storage path', async () => {
    mockSupabase.upload.mockResolvedValue({ error: null });
    mockSupabase.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed/profile.png' },
      error: null,
    });

    const result = await profilePictureService.uploadProfilePicture('user-2', buildImageFile('avatar.png'));

    expect(result.success).toBe(true);
    expect(result.publicUrl).toBe('https://example.com/signed/profile.png');
    expect(result.storagePath).toContain('user-2/');
    expect(mockSupabase.from).toHaveBeenCalledWith('profile-pictures');
    expect(mockSupabase.upload).toHaveBeenCalledTimes(1);
    expect(mockSupabase.createSignedUrl).toHaveBeenCalledTimes(1);
  });
});
