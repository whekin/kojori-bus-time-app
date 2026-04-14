import { createContext, useContext } from 'react';

export type TabRoute = 'index' | 'explore' | 'timetable' | 'settings';

const TabNavContext = createContext<((route: TabRoute) => void) | null>(null);

export const TabNavProvider = TabNavContext.Provider;

export function useTabNav() {
  return useContext(TabNavContext);
}
