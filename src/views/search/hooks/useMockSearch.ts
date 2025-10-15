import { useMemo } from 'react';
import { MOCK_SEARCH_RESULTS, MockSearchResult } from '../data/mockSearchResults';

export interface UseMockSearchOptions {
  query: string;
  tags?: string[];
}

export interface UseMockSearchResult {
  results: MockSearchResult[];
  total: number;
  query: string;
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const useMockSearch = ({ query, tags = [] }: UseMockSearchOptions): UseMockSearchResult => {
  return useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    const normalizedTags = tags.map((tag) => normalize(tag));

    const filtered = MOCK_SEARCH_RESULTS.filter((result) => {
      const haystacks = [result.name, result.phone, result.division, ...result.tags].map(normalize);

      const matchesQuery = normalizedQuery.length === 0 || haystacks.some((value) => value.includes(normalizedQuery));
      const matchesTags = normalizedTags.length === 0 || normalizedTags.every((tag) => haystacks.some((value) => value.includes(tag)));

      return matchesQuery && matchesTags;
    });

    return {
      results: filtered,
      total: filtered.length,
      query
    };
  }, [query, tags]);
};
