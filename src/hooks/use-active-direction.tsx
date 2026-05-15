import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useSettings, type SharedDirection } from '@/hooks/use-settings';
import { scheduleIdleTask } from '@/utils/idle-task';

type PersistTiming = 'deferred' | 'immediate';

type SelectDirectionOptions = {
  manual?: boolean;
  persist?: PersistTiming;
};

type ActiveDirectionContextValue = {
  activeDirection: SharedDirection;
  selectDirection: (direction: SharedDirection, options?: SelectDirectionOptions) => void;
};

const ActiveDirectionContext = createContext<ActiveDirectionContextValue>({
  activeDirection: 'toKojori',
  selectDirection: () => {},
});

export function DirectionProvider({ children }: { children: React.ReactNode }) {
  const { settings, setSharedDirection } = useSettings();
  const [activeDirection, setActiveDirection] = useState<SharedDirection | null>(null);
  const deferredHandleRef = useRef<{ cancel: () => void } | null>(null);
  const mountedRef = useRef(false);
  const pendingPersistRef = useRef<{ direction: SharedDirection; manual: boolean } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      deferredHandleRef.current?.cancel();
    };
  }, []);

  const persistDeferred = useCallback(() => {
    deferredHandleRef.current?.cancel();
    deferredHandleRef.current = scheduleIdleTask(() => {
      const pending = pendingPersistRef.current;
      pendingPersistRef.current = null;
      deferredHandleRef.current = null;
      if (!pending) return;
      if (!mountedRef.current) return;
      setSharedDirection(pending.direction, pending.manual);
    });
  }, [setSharedDirection]);

  const selectDirection = useCallback((direction: SharedDirection, options?: SelectDirectionOptions) => {
    const manual = options?.manual ?? true;
    const persist = options?.persist ?? 'deferred';

    setActiveDirection(direction);

    if (persist === 'immediate') {
      deferredHandleRef.current?.cancel();
      deferredHandleRef.current = null;
      pendingPersistRef.current = null;
      setSharedDirection(direction, manual);
      return;
    }

    pendingPersistRef.current = { direction, manual };
    persistDeferred();
  }, [persistDeferred, setSharedDirection]);

  const resolvedActiveDirection = activeDirection ?? settings.sharedDirection;

  const value = useMemo(
    () => ({ activeDirection: resolvedActiveDirection, selectDirection }),
    [resolvedActiveDirection, selectDirection],
  );

  return React.createElement(
    ActiveDirectionContext.Provider,
    { value },
    children,
  );
}

export function useActiveDirection() {
  return useContext(ActiveDirectionContext);
}
