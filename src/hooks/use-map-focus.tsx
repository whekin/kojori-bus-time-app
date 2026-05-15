import React, { createContext, useContext, useState } from 'react';

import type { StopDirection } from '@/constants/curated-stops';
import type { TabRoute } from '@/hooks/use-tab-nav';
import type { StopInfo } from '@/services/ttc';

export type FocusedMapStop = StopInfo & {
  direction: StopDirection;
  returnRoute?: TabRoute;
  requestedAt: number;
};

export type StopSheetReturnRequest = {
  route: TabRoute;
  stopId: string;
  direction: StopDirection;
  requestedAt: number;
};

type MapFocusContextValue = {
  focusedStop: FocusedMapStop | null;
  stopSheetReturnRequest: StopSheetReturnRequest | null;
  requestStopFocus: (
    stop: StopInfo,
    direction: StopDirection,
    options?: { returnRoute?: TabRoute },
  ) => void;
  requestStopSheetReturn: () => void;
};

const MapFocusContext = createContext<MapFocusContextValue>({
  focusedStop: null,
  stopSheetReturnRequest: null,
  requestStopFocus: () => {},
  requestStopSheetReturn: () => {},
});

export function MapFocusProvider({ children }: { children: React.ReactNode }) {
  const [focusedStop, setFocusedStop] = useState<FocusedMapStop | null>(null);
  const [stopSheetReturnRequest, setStopSheetReturnRequest] =
    useState<StopSheetReturnRequest | null>(null);

  function requestStopFocus(
    stop: StopInfo,
    direction: StopDirection,
    options?: { returnRoute?: TabRoute },
  ) {
    setFocusedStop({
      ...stop,
      direction,
      returnRoute: options?.returnRoute,
      requestedAt: Date.now(),
    });
  }

  function requestStopSheetReturn() {
    if (!focusedStop?.returnRoute) return;

    setStopSheetReturnRequest({
      route: focusedStop.returnRoute,
      stopId: focusedStop.id,
      direction: focusedStop.direction,
      requestedAt: Date.now(),
    });
  }

  return React.createElement(
    MapFocusContext.Provider,
    {
      value: {
        focusedStop,
        stopSheetReturnRequest,
        requestStopFocus,
        requestStopSheetReturn,
      },
    },
    children,
  );
}

export function useMapFocus() {
  return useContext(MapFocusContext);
}
