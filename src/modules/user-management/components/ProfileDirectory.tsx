'use client';

import React, { useState, useMemo } from 'react';
import { ProfileCard } from './ProfileCard';
import type { UserProfile, UserRole } from '../types/profile';

interface ProfileDirectoryProps {
  profiles: UserProfile[];
  currentUserId: string;
  currentUserRole: UserRole;
  isLoading?: boolean;
  onEditProfile?: (profile: UserProfile) => void;
  onDeleteProfile?: (profile: UserProfile) => void;
}

export function ProfileDirectory({
  profiles,
  currentUserId,
  currentUserRole,
  isLoading = false,
  onEditProfile,
  onDeleteProfile,
}: ProfileDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const departments = useMemo(() => {
    const depts = new Set(
      profiles.map((p) => p.department).filter(Boolean) as string[],
    );
    return Array.from(depts).sort();
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return profiles.filter((profile) => {
      const matchesSearch =
        !q ||
        profile.display_name.toLowerCase().includes(q) ||
        profile.email.toLowerCase().includes(q) ||
        (profile.job_title?.toLowerCase().includes(q) ?? false);

      const matchesDepartment =
        !departmentFilter || profile.department === departmentFilter;

      return matchesSearch && matchesDepartment;
    });
  }, [profiles, searchQuery, departmentFilter]);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading profiles"
        className="text-center py-8 text-muted-foreground"
      >
        Loading profiles&hellip;
      </div>
    );
  }

  return (
    <div>
      {/* Search + filter bar */}
      <div className="flex gap-3 mb-4">
        <input
          type="search"
          placeholder="Search profiles&hellip;"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search profiles"
          className="flex-1 border border-input rounded-md px-3 py-2 text-sm"
        />
        {departments.length > 0 && (
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            aria-label="Filter by department"
            className="border border-input rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Results */}
      {filteredProfiles.length === 0 ? (
        <div
          role="status"
          aria-label="No profiles found"
          className="text-center py-8 text-muted-foreground"
        >
          {searchQuery || departmentFilter
            ? 'No profiles match your search'
            : 'No profiles found'}
        </div>
      ) : (
        <div
          role="list"
          aria-label={`${filteredProfiles.length} profile${filteredProfiles.length !== 1 ? 's' : ''}`}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filteredProfiles.map((profile) => (
            <div key={profile.id} role="listitem">
              <ProfileCard
                profile={profile}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onEdit={onEditProfile}
                onDelete={onDeleteProfile}
              />
            </div>
          ))}
        </div>
      )}

      {filteredProfiles.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          Showing {filteredProfiles.length} of {profiles.length} profile
          {profiles.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
