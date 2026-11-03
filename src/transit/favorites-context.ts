import { createContext } from "react";
import type { Favorite, FavoritesState } from "./model";

export type FavoritesContext = {
  state: FavoritesState;
  selected: Favorite | undefined;
  isLoaded: boolean;
  saveError: boolean;
  select: (id: string | null) => void;
  setStop: (id: string, stopId: string) => void;
  save: (favorite: Favorite) => void;
  remove: (id: string) => void;
  restore: (favorite: Favorite, index: number) => void;
  move: (id: string, offset: number) => void;
};
export const FavoritesContextValue = createContext<FavoritesContext | null>(
  null,
);
