'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { UserProfile, ProfileUpdateData } from '../types/profile';
import {
  PROFILE_DISPLAY_NAME_MIN_LENGTH,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_PHONE_REGEX,
} from '../types/profile';

interface ProfileFormProps {
  profile: UserProfile;
  onSubmit: (data: ProfileUpdateData) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  display_name?: string;
  bio?: string;
  phone?: string;
}

/** Pure validation — returns a map of field → error message. */
export function validateProfileForm(data: ProfileUpdateData): FormErrors {
  const errors: FormErrors = {};

  if (data.display_name !== undefined) {
    const name = data.display_name.trim();
    if (name.length < PROFILE_DISPLAY_NAME_MIN_LENGTH) {
      errors.display_name = `Display name must be at least ${PROFILE_DISPLAY_NAME_MIN_LENGTH} characters`;
    } else if (data.display_name.length > PROFILE_DISPLAY_NAME_MAX_LENGTH) {
      errors.display_name = `Display name must not exceed ${PROFILE_DISPLAY_NAME_MAX_LENGTH} characters`;
    }
  }

  if (data.bio && data.bio.length > PROFILE_BIO_MAX_LENGTH) {
    errors.bio = `Bio must not exceed ${PROFILE_BIO_MAX_LENGTH} characters`;
  }

  if (data.phone && data.phone.trim() !== '' && !PROFILE_PHONE_REGEX.test(data.phone)) {
    errors.phone = 'Invalid phone number format';
  }

  return errors;
}

export function ProfileForm({
  profile,
  onSubmit,
  onCancel,
  isLoading = false,
}: ProfileFormProps) {
  const [formData, setFormData] = useState<ProfileUpdateData>({
    display_name: profile.display_name,
    bio: profile.bio ?? '',
    job_title: profile.job_title ?? '',
    department: profile.department ?? '',
    phone: profile.phone ?? '',
    timezone: profile.timezone,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    const validationErrors = validateProfileForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      await onSubmit(formData);
      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save profile');
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Edit profile form">
      <div className="space-y-4">
        {/* Display Name */}
        <div>
          <label htmlFor="display_name" className="text-sm font-medium">
            Display Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            value={formData.display_name}
            onChange={handleChange}
            required
            aria-required="true"
            aria-describedby={errors.display_name ? 'display_name-error' : undefined}
            aria-invalid={!!errors.display_name}
            className="mt-1 block w-full border border-input rounded-md px-3 py-2 text-sm"
          />
          {errors.display_name && (
            <p id="display_name-error" role="alert" className="mt-1 text-xs text-destructive">
              {errors.display_name}
            </p>
          )}
        </div>

        {/* Bio */}
        <div>
          <label htmlFor="bio" className="text-sm font-medium">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            value={formData.bio ?? ''}
            onChange={handleChange}
            rows={3}
            aria-describedby={errors.bio ? 'bio-error' : 'bio-count'}
            aria-invalid={!!errors.bio}
            className="mt-1 block w-full border border-input rounded-md px-3 py-2 text-sm"
          />
          <p id="bio-count" className="mt-0.5 text-xs text-muted-foreground">
            {(formData.bio ?? '').length}/{PROFILE_BIO_MAX_LENGTH}
          </p>
          {errors.bio && (
            <p id="bio-error" role="alert" className="mt-1 text-xs text-destructive">
              {errors.bio}
            </p>
          )}
        </div>

        {/* Job Title */}
        <div>
          <label htmlFor="job_title" className="text-sm font-medium">
            Job Title
          </label>
          <input
            id="job_title"
            name="job_title"
            type="text"
            value={formData.job_title ?? ''}
            onChange={handleChange}
            className="mt-1 block w-full border border-input rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* Department */}
        <div>
          <label htmlFor="department" className="text-sm font-medium">
            Department
          </label>
          <input
            id="department"
            name="department"
            type="text"
            value={formData.department ?? ''}
            onChange={handleChange}
            className="mt-1 block w-full border border-input rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="text-sm font-medium">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone ?? ''}
            onChange={handleChange}
            aria-describedby={errors.phone ? 'phone-error' : undefined}
            aria-invalid={!!errors.phone}
            className="mt-1 block w-full border border-input rounded-md px-3 py-2 text-sm"
          />
          {errors.phone && (
            <p id="phone-error" role="alert" className="mt-1 text-xs text-destructive">
              {errors.phone}
            </p>
          )}
        </div>

        {/* Timezone */}
        <div>
          <label htmlFor="timezone" className="text-sm font-medium">
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            value={formData.timezone}
            onChange={handleChange}
            className="mt-1 block w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="America/New_York">Eastern Time (ET)</option>
            <option value="America/Chicago">Central Time (CT)</option>
            <option value="America/Denver">Mountain Time (MT)</option>
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="UTC">UTC</option>
            <option value="Europe/London">London (GMT/BST)</option>
            <option value="Europe/Paris">Paris (CET/CEST)</option>
          </select>
        </div>

        {/* Status messages */}
        {submitError && (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        )}
        {submitSuccess && (
          <p role="status" className="text-sm text-green-600">
            Profile saved successfully!
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading} aria-busy={isLoading}>
            {isLoading ? 'Saving\u2026' : 'Save Profile'}
          </Button>
        </div>
      </div>
    </form>
  );
}
