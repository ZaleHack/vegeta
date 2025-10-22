import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface SearchHistoryEntry {
  query: string;
  timestamp: number;
}

const SEARCH_HISTORY_STORAGE_KEY = 'devine-intelligence-unified-search-history';
const SEARCH_HISTORY_PREVIEW_LIMIT = 6;
const SEARCH_HISTORY_LIMIT = 10;

const loadSearchHistoryFromStorage = (): SearchHistoryEntry[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .map((entry) => {
        if (!entry || typeof entry.query !== 'string') {
          return null;
        }

        const timestamp = Number(entry.timestamp);
        if (!Number.isFinite(timestamp)) {
          return null;
        }

        return { query: entry.query, timestamp } as SearchHistoryEntry;
      })
      .filter((entry): entry is SearchHistoryEntry => Boolean(entry))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, SEARCH_HISTORY_LIMIT);

    return normalized;
  } catch (error) {
    console.error("Impossible de lire l'historique de recherche:", error);
    return [];
  }
};

interface UseSearchHistoryOptions {
  onSelect: (query: string) => void;
}

export const useSearchHistory = ({ onSelect }: UseSearchHistoryOptions) => {
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>(() => loadSearchHistoryFromStorage());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        SEARCH_HISTORY_STORAGE_KEY,
        JSON.stringify(searchHistory.slice(0, SEARCH_HISTORY_LIMIT))
      );
    } catch (error) {
      console.error("Impossible d'enregistrer l'historique de recherche:", error);
    }
  }, [searchHistory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      if (!containerRef.current.contains(event.target as Node)) {
        setIsHistoryOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHistoryOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const addToSearchHistory = useCallback((query: string) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return;
    }

    setSearchHistory((prev) => {
      const filtered = prev.filter(
        (entry) => entry.query.toLowerCase() !== normalizedQuery.toLowerCase()
      );
      const updated: SearchHistoryEntry[] = [
        { query: normalizedQuery, timestamp: Date.now() },
        ...filtered
      ];

      return updated.slice(0, SEARCH_HISTORY_LIMIT);
    });
  }, []);

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
  }, []);

  const removeSearchHistoryEntry = useCallback((query: string) => {
    setSearchHistory((prev) => prev.filter((entry) => entry.query !== query));
  }, []);

  const handleHistorySelection = useCallback(
    (query: string) => {
      setIsHistoryOpen(false);
      onSelect(query);
    },
    [onSelect]
  );

  const visibleHistoryEntries = useMemo(
    () =>
      isHistoryOpen
        ? searchHistory
        : searchHistory.slice(0, SEARCH_HISTORY_PREVIEW_LIMIT),
    [isHistoryOpen, searchHistory]
  );

  const hasMoreHistoryEntries = useMemo(
    () => searchHistory.length > SEARCH_HISTORY_PREVIEW_LIMIT,
    [searchHistory]
  );

  const getHistoryRelativeLabel = useCallback((timestamp: number) => {
    try {
      return formatDistanceToNow(timestamp, { addSuffix: true, locale: fr });
    } catch (error) {
      console.error('Erreur formatage historique:', error);
      return '';
    }
  }, []);

  return {
    searchHistory,
    isHistoryOpen,
    setIsHistoryOpen,
    containerRef,
    visibleHistoryEntries,
    hasMoreHistoryEntries,
    addToSearchHistory,
    clearSearchHistory,
    removeSearchHistoryEntry,
    handleHistorySelection,
    getHistoryRelativeLabel
  } as const;
};

export type UseSearchHistoryReturn = ReturnType<typeof useSearchHistory>;
