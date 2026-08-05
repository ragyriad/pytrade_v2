"use client";

import { useAuth } from "@clerk/nextjs";
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
  type DehydratedState,
} from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  SessionStateScopeProvider,
  activeSessionStorageKey,
  clearPersistedSession,
  queryStorageKey,
} from "./sessionState";

const QUERY_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const QUERY_CACHE_SAVE_DELAY_MS = 150;

type PersistedQueryCache = {
  savedAt: number;
  state: DehydratedState;
  version: 1;
};

declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__?: QueryClient;
  }
}

function createSessionQueryClient(sessionId: string | null): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: QUERY_CACHE_MAX_AGE_MS,
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
    },
  });

  if (!sessionId || typeof window === "undefined") return queryClient;

  const storageKey = queryStorageKey(sessionId);
  try {
    const serialized = window.sessionStorage.getItem(storageKey);
    if (!serialized) return queryClient;

    const persisted = JSON.parse(serialized) as PersistedQueryCache;
    const isCurrent =
      persisted.version === 1 &&
      Date.now() - persisted.savedAt <= QUERY_CACHE_MAX_AGE_MS;

    if (isCurrent) hydrate(queryClient, persisted.state);
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    window.sessionStorage.removeItem(storageKey);
  }

  return queryClient;
}

function ScopedAppState({
  children,
  isReady,
  sessionId,
}: {
  children: ReactNode;
  isReady: boolean;
  sessionId: string | null;
}) {
  const [queryClient] = useState(() => createSessionQueryClient(sessionId));

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    window.__TANSTACK_QUERY_CLIENT__ = queryClient;

    return () => {
      if (window.__TANSTACK_QUERY_CLIENT__ === queryClient) {
        delete window.__TANSTACK_QUERY_CLIENT__;
      }
    };
  }, [queryClient]);

  useEffect(() => {
    if (!sessionId) return;

    let saveTimer: number | null = null;
    const storageKey = queryStorageKey(sessionId);
    const save = () => {
      saveTimer = null;
      try {
        const persisted: PersistedQueryCache = {
          savedAt: Date.now(),
          state: dehydrate(queryClient, {
            shouldDehydrateQuery: (query: {
              meta?: Record<string, unknown>;
              state: { status: string };
            }) =>
              query.state.status === "success" && query.meta?.persist !== false,
          }),
          version: 1,
        };
        window.sessionStorage.setItem(storageKey, JSON.stringify(persisted));
      } catch {
        // Query caching still works in memory if sessionStorage is unavailable.
      }
    };

    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (saveTimer != null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, QUERY_CACHE_SAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      if (saveTimer != null) window.clearTimeout(saveTimer);
    };
  }, [queryClient, sessionId]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionStateScopeProvider isReady={isReady} sessionId={sessionId}>
        {children}
      </SessionStateScopeProvider>
    </QueryClientProvider>
  );
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const activeSessionId = isLoaded && isSignedIn ? sessionId : null;
  const scopeKey = isLoaded ? activeSessionId ?? "signed-out" : "loading";

  useEffect(() => {
    if (!isLoaded) return;

    const previousSessionId = window.sessionStorage.getItem(
      activeSessionStorageKey
    );

    if (previousSessionId && previousSessionId !== activeSessionId) {
      clearPersistedSession(previousSessionId);
    }

    if (activeSessionId) {
      window.sessionStorage.setItem(activeSessionStorageKey, activeSessionId);
    } else {
      window.sessionStorage.removeItem(activeSessionStorageKey);
    }
  }, [activeSessionId, isLoaded]);

  return (
    <ScopedAppState
      key={scopeKey}
      isReady={isLoaded}
      sessionId={activeSessionId}
    >
      {children}
    </ScopedAppState>
  );
}
