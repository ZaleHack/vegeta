import { apiClient } from '../../app/api/apiClient';
import { ProfileListItem, ProfilesResponse, ProfileResponse } from './types';

const normalizeProfile = (profile: ProfileListItem): ProfileListItem => ({
  ...profile,
  attachments: Array.isArray(profile.attachments) ? profile.attachments : []
});

export interface FetchProfilesOptions {
  page: number;
  limit: number;
  query?: string;
  signal?: AbortSignal;
}

export const fetchProfiles = async ({ page, limit, query, signal }: FetchProfilesOptions) => {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(limit)
  };
  const trimmed = query?.trim();
  if (trimmed) {
    params.q = trimmed;
  }
  const response = await apiClient.get<ProfilesResponse>('/api/profiles', {
    params,
    signal
  });
  const profiles = Array.isArray(response?.profiles) ? response.profiles.map(normalizeProfile) : [];
  const total = typeof response?.total === 'number' ? response.total : 0;
  return { profiles, total };
};

export const fetchProfileById = async (id: number, signal?: AbortSignal) => {
  const response = await apiClient.get<ProfileResponse>(`/api/profiles/${id}`, { signal });
  if (!response?.profile) {
    throw new Error('Profil introuvable');
  }
  return normalizeProfile(response.profile);
};

export const deleteProfileById = (id: number) => apiClient.delete(`/api/profiles/${id}`);

export const exportProfilePdf = (id: number, signal?: AbortSignal) =>
  apiClient.get<Blob>(`/api/profiles/${id}/pdf`, { responseType: 'blob', signal });

export interface SaveProfileOptions {
  formData: FormData;
  profileId?: number | null;
  signal?: AbortSignal;
}

export const saveProfile = async ({ formData, profileId, signal }: SaveProfileOptions) => {
  const url = profileId ? `/api/profiles/${profileId}` : '/api/profiles';
  const method = profileId ? 'PATCH' : 'POST';
  const response = await apiClient.request<ProfileResponse>(url, {
    method,
    body: formData,
    signal
  });
  if (response?.profile) {
    return {
      profile: normalizeProfile(response.profile)
    };
  }
  return response;
};
