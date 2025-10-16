import { useMemo } from 'react';
import { useQuery, UseQueryResult } from '../../app/query';
import { fetchProfileById, fetchProfiles } from './api';
import { ProfileListItem } from './types';

type FetchProfilesResult = Awaited<ReturnType<typeof fetchProfiles>>;

const rootKey = ['profiles'] as const;

export const profilesKeys = {
  all: rootKey,
  list: (params: { page: number; limit: number; query: string; refreshKey: number }) =>
    [...rootKey, 'list', params] as const,
  detail: (id: number) => [...rootKey, 'detail', id] as const
};

interface UseProfilesQueryParams {
  page: number;
  limit: number;
  query: string;
  refreshKey?: number;
}

export const useProfilesQuery = ({ page, limit, query, refreshKey = 0 }: UseProfilesQueryParams) => {
  const normalizedQuery = query.trim();
  const key = useMemo(
    () => profilesKeys.list({ page, limit, query: normalizedQuery, refreshKey }),
    [page, limit, normalizedQuery, refreshKey]
  );
  return useQuery<FetchProfilesResult>({
    queryKey: key,
    queryFn: ({ signal }) => fetchProfiles({ page, limit, query: normalizedQuery, signal }),
    staleTime: 30_000
  });
};

interface UseProfileQueryOptions {
  enabled?: boolean;
  onSuccess?: (profile: ProfileListItem) => void;
  onError?: (error: unknown) => void;
}

export const useProfileQuery = (
  id: number | null | undefined,
  { enabled = true, onSuccess, onError }: UseProfileQueryOptions = {}
): UseQueryResult<ProfileListItem> => {
  const key = useMemo(
    () => (id ? profilesKeys.detail(id) : ([...rootKey, 'detail', 'empty'] as const)),
    [id]
  );
  return useQuery<ProfileListItem>({
    queryKey: key,
    queryFn: ({ signal }) => {
      if (!id) {
        return Promise.reject(new Error('Profil introuvable'));
      }
      return fetchProfileById(id, signal);
    },
    enabled: Boolean(id) && enabled,
    staleTime: 5 * 60 * 1000,
    onSuccess,
    onError
  });
};

export type ProfilesQueryResult = ReturnType<typeof useProfilesQuery>;
