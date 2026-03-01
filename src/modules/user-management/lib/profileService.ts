import { supabase } from '@/lib/supabase';
import type { UserProfile, ProfileUpdateData, ProfileQueryOptions, ProfileListResponse } from '../types/profile';

export async function getProfiles(options: ProfileQueryOptions): Promise<ProfileListResponse> {
  const { organization_id, page = 1, per_page = 20, search, department } = options;
  let query = supabase.from('profiles').select('*', { count: 'exact' })
    .eq('organization_id', organization_id).order('display_name');
  if (search) query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%,job_title.ilike.%${search}%`);
  if (department) query = query.eq('department', department);
  const from = (page - 1) * per_page;
  query = query.range(from, from + per_page - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return { data: data ?? [], count: total, page, per_page, total_pages: per_page > 0 ? Math.ceil(total / per_page) : 0 };
}

export async function getProfileById(id: string, organizationId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).eq('organization_id', organizationId).single();
  if (error) { if (error.code === 'PGRST116') return null; throw new Error(error.message); }
  return (data as UserProfile) ?? null;
}

export async function updateProfile(id: string, organizationId: string, updateData: ProfileUpdateData): Promise<UserProfile> {
  const { data, error } = await supabase.from('profiles')
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', id).eq('organization_id', organizationId).select().single();
  if (error) throw new Error(error.message);
  return data as UserProfile;
}

export async function deleteProfile(id: string, organizationId: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('id', id).eq('organization_id', organizationId);
  if (error) throw new Error(error.message);
}
