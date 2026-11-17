import { useCallback, useRef, useState } from 'react';

const MAX_HISTORY = 45;
const COALESCE_WINDOW_MS = 500;

export function useProjectHistory<T>(initialValue: T | (() => T)) {
  const [present, setPresent] = useState<T>(initialValue);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const lastCoalesceKeyRef = useRef<string | null>(null);
  const lastCoalesceTsRef = useRef<number>(0);
  const [, setVersion] = useState(0);

  const updatePresent = useCallback(
    (updater: T | ((prev: T) => T), options?: { coalesceKey?: string; record?: boolean }) => {
      const record = options?.record ?? true;
      const coalesceKey = options?.coalesceKey ?? null;

      setPresent((prev) => {
        const next =
          typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
        if (next === prev) return prev;

        if (record) {
          const now = Date.now();
          const canCoalesce =
            coalesceKey !== null &&
            coalesceKey === lastCoalesceKeyRef.current &&
            now - lastCoalesceTsRef.current < COALESCE_WINDOW_MS &&
            pastRef.current.length > 0;

          if (!canCoalesce) {
            pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), prev];
          }
          lastCoalesceKeyRef.current = coalesceKey;
          lastCoalesceTsRef.current = now;
          futureRef.current = [];
          setVersion((v) => v + 1);
        } else {
          lastCoalesceKeyRef.current = null;
        }
        return next;
      });
    },
    []
  );

  const resetHistory = useCallback((nextInitial: T) => {
    pastRef.current = [];
    futureRef.current = [];
    lastCoalesceKeyRef.current = null;
    setPresent(nextInitial);
    setVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    lastCoalesceKeyRef.current = null;
    setPresent((curr) => {
      const prev = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [curr, ...futureRef.current.slice(0, MAX_HISTORY - 1)];
      return prev;
    });
    setVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    lastCoalesceKeyRef.current = null;
    setPresent((curr) => {
      const next = futureRef.current[0];
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), curr];
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  return {
    state: present,
    setState: updatePresent,
    resetHistory,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
