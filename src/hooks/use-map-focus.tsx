import React, { createContext, useContext, useState } from 'react';

import type { TabRoute } from '@/hooks/use-tab-nav';
import type { StopInfo } from '@/services/ttc';

export type FocusedMapStop = StopInfo & {
  tripId: string;
  returnRoute?: TabRoute;
  requestedAt: number;
};

export type StopSheetReturnRequest = {
  route: TabRoute;
  stopId: string;
  tripId: string;
  requestedAt: number;
};

type MapFocusContextValue = {
  focusedStop: FocusedMapStop | null;
  stopSheetReturnRequest: StopSheetReturnRequest | null;
  clearStopFocus: () => void;
  requestStopFocus: (
    stop: StopInfo,
    tripId: string,
    options?: { returnRoute?: TabRoute },
  ) => void;
  requestStopSheetReturn: () => void;
};

const MapFocusContext = createContext<MapFocusContextValue>({
  focusedStop: null,
  stopSheetReturnRequest: null,
  clearStopFocus: () => {},
  requestStopFocus: () => {},
  requestStopSheetReturn: () => {},
});

export function MapFocusProvider({ children }: { children: React.ReactNode }) {
  const [focusedStop, setFocusedStop] = useState<FocusedMapStop | null>(null);
  const [stopSheetReturnRequest, setStopSheetReturnRequest] =
    useState<StopSheetReturnRequest | null>(null);

  function requestStopFocus(
    stop: StopInfo,
    tripId: string,
    options?: { returnRoute?: TabRoute },
  ) {
    setFocusedStop({
      ...stop,
      tripId,
      returnRoute: options?.returnRoute,
      requestedAt: Date.now(),
    });
  }

  function clearStopFocus() {
    setFocusedStop(null);
  }

  function requestStopSheetReturn() {
    if (!focusedStop?.returnRoute) return;

    setStopSheetReturnRequest({
      route: focusedStop.returnRoute,
      stopId: focusedStop.id,
      tripId: focusedStop.tripId,
      requestedAt: Date.now(),
    });
  }

  return React.createElement(
    MapFocusContext.Provider,
    {
      value: {
        focusedStop,
        stopSheetReturnRequest,
        clearStopFocus,
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
