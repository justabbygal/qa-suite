export type UserRole = 'Owner' | 'Admin' | 'User';

export interface UserProfile {
  id: string;
  user_id: string;
  organization_id: string;
  display_name: string;
  email: string;
  bio: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  timezone: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdateData {
  display_name?: string;
  bio?: string | null;
  job_title?: string | null;
  department?: string | null;
  phone?: string | null;
  timezone?: string;
}

export interface ProfileQueryOptions {
  organization_id: string;
  page?: number;
  per_page?: number;
  search?: string;
  department?: string;
}

export interface ProfileListResponse {
  data: UserProfile[];
  count: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ProfilePermissions {
  canViewProfiles: boolean;
  canEditOwnProfile: boolean;
  canEditAllProfiles: boolean;
  canDeleteProfiles: boolean;
  canDeleteOwnerProfile: boolean;
  canManageAnyAvatar: boolean;
  canManageOwnAvatar: boolean;
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export interface ImageUploadResult {
  success: boolean;
  avatarUrl?: string;
  error?: string;
}

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_SIZE_MB = 5;
export const AVATAR_STORAGE_BUCKET = 'avatars';
export const PROFILE_DISPLAY_NAME_MIN_LENGTH = 2;
export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 100;
export const PROFILE_BIO_MAX_LENGTH = 500;
export const PROFILE_PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/;
