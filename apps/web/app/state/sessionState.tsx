"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

const STORAGE_PREFIX = "pytrade:v1";

type SessionStateScope = {
  isReady: boolean;
  sessionId: string | null;
};

const SessionStateScopeContext = createContext<SessionStateScope>({
  isReady: false,
  sessionId: null,
});

export const activeSessionStorageKey = `${STORAGE_PREFIX}:active-session`;

export function queryStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:session:${sessionId}:queries`;
}

function uiStorageKey(sessionId: string, key: string): string {
  return `${STORAGE_PREFIX}:session:${sessionId}:ui:${key}`;
}

export function clearPersistedSession(sessionId: string): void {
  if (typeof window === "undefined") return;

  const sessionPrefix = `${STORAGE_PREFIX}:session:${sessionId}:`;
  const keysToRemove: string[] = [];

  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(sessionPrefix)) keysToRemove.push(key);
  }

  for (const key of keysToRemove) window.sessionStorage.removeItem(key);
}

export function SessionStateScopeProvider({
  children,
  isReady,
  sessionId,
}: SessionStateScope & { children: ReactNode }) {
  const value = useMemo(
    () => ({ isReady, sessionId }),
    [isReady, sessionId]
  );

  return (
    <SessionStateScopeContext.Provider value={value}>
      {children}
    </SessionStateScopeContext.Provider>
  );
}

function resolveInitialValue<T>(initialValue: T | (() => T)): T {
  return typeof initialValue === "function"
    ? (initialValue as () => T)()
    : initialValue;
}

/**
 * Persists safe UI-only state for the active Clerk session and browser tab.
 * Outside AppStateProvider (for example, isolated component tests), it behaves
 * exactly like useState and does not touch browser storage.
 */
export function useSessionState<T>(
  key: string | null,
  initialValue: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const { isReady, sessionId } = useContext(SessionStateScopeContext);
  // Keep the initial fallback for this hook instance without reading a ref
  // during render. React's compiler treats ref reads during render as unsafe.
  const [initialValueSnapshot] = useState<T | (() => T)>(() => initialValue);
  const storageKey = isReady && sessionId && key
    ? uiStorageKey(sessionId, key)
    : null;

  const readValue = useCallback(() => {
    const fallback = resolveInitialValue(initialValueSnapshot);
    if (!storageKey || typeof window === "undefined") return fallback;

    try {
      const stored = window.sessionStorage.getItem(storageKey);
      return stored == null ? fallback : JSON.parse(stored) as T;
    } catch {
      window.sessionStorage.removeItem(storageKey);
      return fallback;
    }
  }, [initialValueSnapshot, storageKey]);

  const [value, setValue] = useState<T>(readValue);
  const previousStorageKeyRef = useRef(storageKey);

  useEffect(() => {
    if (previousStorageKeyRef.current === storageKey) return;
    previousStorageKeyRef.current = storageKey;
    setValue(readValue());
  }, [readValue, storageKey]);

  const setPersistedValue = useCallback<Dispatch<SetStateAction<T>>>(
    (nextValue) => {
      setValue((currentValue) => {
        const resolvedValue = typeof nextValue === "function"
          ? (nextValue as (current: T) => T)(currentValue)
          : nextValue;

        if (storageKey && typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(
              storageKey,
              JSON.stringify(resolvedValue)
            );
          } catch {
            // Storage can be unavailable or full. UI state still works in memory.
          }
        }

        return resolvedValue;
      });
    },
    [storageKey]
  );

  return [value, setPersistedValue];
}
