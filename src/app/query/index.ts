import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from 'react';

export type QueryKey = readonly unknown[];

const stableSerialize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => stableSerialize(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSerialize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
};

const stringifyQueryKey = (key: QueryKey): string => JSON.stringify(stableSerialize(key));

type QueryStatus = 'idle' | 'pending' | 'success' | 'error';
type FetchStatus = 'idle' | 'fetching';

export interface QueryState<TData = unknown> {
  data?: TData;
  error?: unknown;
  status: QueryStatus;
  fetchStatus: FetchStatus;
  updatedAt: number;
}

type QueryListener = () => void;

type QueryFn<TData> = (context: { signal: AbortSignal }) => Promise<TData>;

interface InternalQueryOptions<TData> {
  queryFn: QueryFn<TData>;
  staleTime: number;
}

interface QueryEntry<TData = unknown> extends QueryState<TData> {
  key: QueryKey;
  hash: string;
  staleTime: number;
  listeners: Set<QueryListener>;
  options?: InternalQueryOptions<TData>;
  promise?: Promise<TData>;
  controller?: AbortController;
}

const cloneState = <TData,>(entry: QueryEntry<TData>): QueryState<TData> => ({
  data: entry.data,
  error: entry.error,
  status: entry.status,
  fetchStatus: entry.fetchStatus,
  updatedAt: entry.updatedAt
});

const keysMatch = (partial: QueryKey, full: QueryKey) => {
  if (partial.length > full.length) return false;
  return partial.every((value, index) => stringifyQueryKey([value]) === stringifyQueryKey([full[index]]));
};

export interface EnsureQueryOptions<TData> {
  queryKey: QueryKey;
  queryFn: QueryFn<TData>;
  staleTime?: number;
}

export class QueryClient {
  private readonly queries = new Map<string, QueryEntry>();

  private ensureEntry<TData>(key: QueryKey): QueryEntry<TData> {
    const hash = stringifyQueryKey(key);
    const existing = this.queries.get(hash) as QueryEntry<TData> | undefined;
    if (existing) {
      existing.key = key;
      return existing;
    }
    const entry: QueryEntry<TData> = {
      key,
      hash,
      status: 'idle',
      fetchStatus: 'idle',
      updatedAt: 0,
      staleTime: 0,
      listeners: new Set()
    };
    this.queries.set(hash, entry);
    return entry;
  }

  private notify(entry: QueryEntry) {
    entry.listeners.forEach(listener => listener());
  }

  private shouldUseCached(entry: QueryEntry, staleTime: number, force: boolean) {
    if (force) return false;
    if (entry.status !== 'success') return false;
    if (staleTime <= 0) return false;
    return Date.now() - entry.updatedAt < staleTime;
  }

  private async executeFetch<TData>(entry: QueryEntry<TData>, options: EnsureQueryOptions<TData>): Promise<TData> {
    if (entry.fetchStatus === 'fetching' && entry.promise) {
      return entry.promise;
    }

    entry.controller?.abort();
    const controller = new AbortController();
    entry.controller = controller;
    entry.fetchStatus = 'fetching';
    if (entry.status === 'idle' || entry.status === 'error') {
      entry.status = 'pending';
    }
    this.notify(entry);

    const promise = options
      .queryFn({ signal: controller.signal })
      .then(data => {
        entry.data = data;
        entry.error = undefined;
        entry.status = 'success';
        entry.fetchStatus = 'idle';
        entry.updatedAt = Date.now();
        entry.promise = undefined;
        this.notify(entry);
        return data;
      })
      .catch(error => {
        entry.fetchStatus = 'idle';
        entry.promise = undefined;
        if (controller.signal.aborted) {
          this.notify(entry);
          throw error;
        }
        entry.error = error;
        entry.status = 'error';
        this.notify(entry);
        throw error;
      })
      .finally(() => {
        if (entry.controller === controller) {
          entry.controller = undefined;
        }
      });

    entry.promise = promise;
    return promise;
  }

  ensureQueryData<TData>(options: EnsureQueryOptions<TData>, force = false) {
    const entry = this.ensureEntry<TData>(options.queryKey);
    entry.options = {
      queryFn: options.queryFn,
      staleTime: options.staleTime ?? 0
    };
    entry.staleTime = entry.options.staleTime;
    if (this.shouldUseCached(entry, entry.staleTime, force)) {
      return Promise.resolve(entry.data as TData);
    }
    return this.executeFetch(entry, options);
  }

  getQueryState<TData>(key: QueryKey): QueryState<TData> {
    const entry = this.ensureEntry<TData>(key);
    return cloneState(entry);
  }

  getQueryData<TData>(key: QueryKey) {
    const entry = this.ensureEntry<TData>(key);
    return entry.data as TData | undefined;
  }

  setQueryData<TData>(key: QueryKey, updater: TData | ((value?: TData) => TData)) {
    const entry = this.ensureEntry<TData>(key);
    const value = typeof updater === 'function' ? (updater as (val?: TData) => TData)(entry.data as TData | undefined) : updater;
    entry.data = value;
    entry.error = undefined;
    entry.status = 'success';
    entry.updatedAt = Date.now();
    this.notify(entry);
  }

  subscribe(key: QueryKey, listener: QueryListener) {
    const entry = this.ensureEntry(key);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
    };
  }

  cancelQuery(key: QueryKey) {
    const entry = this.ensureEntry(key);
    entry.controller?.abort();
    entry.controller = undefined;
    entry.fetchStatus = 'idle';
    entry.promise = undefined;
    this.notify(entry);
  }

  invalidateQueries(partialKey?: QueryKey) {
    this.queries.forEach(entry => {
      if (!partialKey || keysMatch(partialKey, entry.key)) {
        entry.updatedAt = 0;
        if (entry.options) {
          this.executeFetch(entry, { ...entry.options, queryKey: entry.key }).catch(() => undefined);
        } else {
          this.notify(entry);
        }
      }
    });
  }

  async refetchQueries(partialKey?: QueryKey) {
    const tasks: Promise<unknown>[] = [];
    this.queries.forEach(entry => {
      if (!partialKey || keysMatch(partialKey, entry.key)) {
        if (entry.options) {
          tasks.push(this.executeFetch(entry, { ...entry.options, queryKey: entry.key }));
        }
      }
    });
    await Promise.allSettled(tasks);
  }
}

const QueryClientContext = createContext<QueryClient | null>(null);

interface QueryClientProviderProps {
  client: QueryClient;
  children: React.ReactNode;
}

export const QueryClientProvider = ({ client, children }: QueryClientProviderProps) => {
  return <QueryClientContext.Provider value={client}>{children}</QueryClientContext.Provider>;
};

export const useQueryClient = () => {
  const client = useContext(QueryClientContext);
  if (!client) {
    throw new Error('useQueryClient must be used within a QueryClientProvider');
  }
  return client;
};

export interface UseQueryOptions<TData, TSelected = TData> {
  queryKey: QueryKey;
  queryFn: QueryFn<TData>;
  enabled?: boolean;
  staleTime?: number;
  select?: (data: TData) => TSelected;
  onSuccess?: (data: TSelected) => void;
  onError?: (error: unknown) => void;
}

export interface UseQueryResult<TData> extends QueryState<TData> {
  data: TData | undefined;
  refetch: () => Promise<TData | undefined>;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
}

export function useQuery<TData, TSelected = TData>(options: UseQueryOptions<TData, TSelected>): UseQueryResult<TSelected> {
  const client = useQueryClient();
  const {
    queryKey,
    queryFn,
    enabled = true,
    staleTime = 0,
    select,
    onSuccess,
    onError
  } = options;

  const serializedKey = useMemo(() => stringifyQueryKey(queryKey), [queryKey]);
  const stableKeyRef = useRef<QueryKey>(queryKey);
  if (stableKeyRef.current !== queryKey && stringifyQueryKey(stableKeyRef.current) !== serializedKey) {
    stableKeyRef.current = queryKey;
  } else if (stableKeyRef.current !== queryKey && stringifyQueryKey(stableKeyRef.current) === serializedKey) {
    stableKeyRef.current = queryKey;
  }
  const stableKey = stableKeyRef.current;

  const subscribe = useMemo(() => client.subscribe.bind(client, stableKey), [client, stableKey, serializedKey]);
  const getSnapshot = useMemo(() => client.getQueryState.bind(client, stableKey), [client, stableKey, serializedKey]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!enabled) {
      client.cancelQuery(stableKey);
      return;
    }
    client.ensureQueryData({ queryKey: stableKey, queryFn, staleTime }).catch(() => undefined);
  }, [client, queryFn, stableKey, staleTime, enabled, serializedKey]);

  const rawData = state.data as TData | undefined;
  const selectedData = useMemo(() => {
    if (rawData === undefined) return undefined;
    return select ? select(rawData) : ((rawData as unknown) as TSelected);
  }, [rawData, select]);

  useEffect(() => {
    if (state.status === 'success' && selectedData !== undefined) {
      onSuccess?.(selectedData);
    }
  }, [state.status, selectedData, onSuccess]);

  useEffect(() => {
    if (state.status === 'error' && state.error) {
      onError?.(state.error);
    }
  }, [state.status, state.error, onError]);

  const refetch = useMemo(
    () => () =>
      client
        .ensureQueryData({ queryKey: stableKey, queryFn, staleTime }, true)
        .then(data => (select ? select(data) : ((data as unknown) as TSelected)))
        .catch(error => {
          onError?.(error);
          throw error;
        }),
    [client, stableKey, queryFn, staleTime, select, onError]
  );

  const isLoading = state.status === 'pending' && !state.data;
  const isError = state.status === 'error';
  const isSuccess = state.status === 'success';
  const isFetching = state.fetchStatus === 'fetching';

  return {
    data: selectedData,
    error: state.error,
    status: state.status,
    updatedAt: state.updatedAt,
    fetchStatus: state.fetchStatus,
    refetch,
    isLoading,
    isFetching,
    isError,
    isSuccess
  } as UseQueryResult<TSelected>;
}
