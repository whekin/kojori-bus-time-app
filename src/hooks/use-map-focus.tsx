import React, { createContext, useContext, useState } from 'react';

import type { StopDirection } from '@/constants/curated-stops';
import type { StopInfo } from '@/services/ttc';

export type FocusedMapStop = StopInfo & {
  direction: StopDirection;
  requestedAt: number;
};

type MapFocusContextValue = {
  focusedStop: FocusedMapStop | null;
  requestStopFocus: (stop: StopInfo, direction: StopDirection) => void;
};

const MapFocusContext = createContext<MapFocusContextValue>({
  focusedStop: null,
  requestStopFocus: () => {},
});

export function MapFocusProvider({ children }: { children: React.ReactNode }) {
  const [focusedStop, setFocusedStop] = useState<FocusedMapStop | null>(null);

  function requestStopFocus(stop: StopInfo, direction: StopDirection) {
    setFocusedStop({
      ...stop,
      direction,
      requestedAt: Date.now(),
    });
  }

  return React.createElement(
    MapFocusContext.Provider,
    { value: { focusedStop, requestStopFocus } },
    children,
  );
}

export function useMapFocus() {
  return useContext(MapFocusContext);
}
