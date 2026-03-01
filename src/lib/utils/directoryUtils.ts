import type { UserProfile, UserRole } from '@/modules/user-management/types/profile';

export type SortField = 'name' | 'role' | 'join_date';
export type SortOrder = 'asc' | 'desc';
export type ViewMode = 'grid' | 'list';

export interface DirectoryFilters {
  search: string;
  role: UserRole | '';
  sortField: SortField;
  sortOrder: SortOrder;
}

const ROLE_ORDER: Record<UserRole, number> = {
  Owner: 0,
  Admin: 1,
  User: 2,
};

export function filterProfiles(
  profiles: UserProfile[],
  filters: Pick<DirectoryFilters, 'search' | 'role'>,
): UserProfile[] {
  const q = filters.search.toLowerCase().trim();
  return profiles.filter((profile) => {
    const matchesSearch =
      !q ||
      profile.display_name.toLowerCase().includes(q) ||
      profile.email.toLowerCase().includes(q) ||
      (profile.bio?.toLowerCase().includes(q) ?? false);
    const matchesRole = !filters.role || profile.role === filters.role;
    return matchesSearch && matchesRole;
  });
}

export function sortProfiles(
  profiles: UserProfile[],
  sortField: SortField,
  sortOrder: SortOrder,
): UserProfile[] {
  const sorted = [...profiles].sort((a, b) => {
    switch (sortField) {
      case 'name':
        return a.display_name.localeCompare(b.display_name);
      case 'role':
        return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      case 'join_date':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      default:
        return 0;
    }
  });
  return sortOrder === 'desc' ? sorted.reverse() : sorted;
}

export function filterAndSortProfiles(
  profiles: UserProfile[],
  filters: DirectoryFilters,
): UserProfile[] {
  const filtered = filterProfiles(profiles, filters);
  return sortProfiles(filtered, filters.sortField, filters.sortOrder);
}