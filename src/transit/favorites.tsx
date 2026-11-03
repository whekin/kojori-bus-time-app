import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React, {
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { useSettings } from "@/hooks/use-settings";
import { prefillStopNames } from "@/hooks/use-stop-names";
import { hydrateTtcOfflineData, loadBakedData } from "@/services/ttc-offline";
import { hydrateTtcQueryLog } from "@/services/ttc-query-log";
import { hydrateTransitCache } from "./data";
import { migrateLegacyFavorites } from "./legacy";
import { FavoritesContextValue as Context } from "./favorites-context";
import {
  readFavoritesState,
  type Favorite,
  type FavoritesState,
} from "./model";

export const FAVORITES_STORAGE_KEY = "@kojori_favorites_v1";
const EMPTY: FavoritesState = { version: 2, favorites: [], selectedId: null };

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoaded: settingsLoaded } = useSettings();
  const client = useQueryClient();
  const [state, setState] = useState(EMPTY);
  const [isLoaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const restoreLegacy = useEffectEvent(() => migrateLegacyFavorites(settings));
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    if (!settingsLoaded) return;
    let disposed = false;
    void (async () => {
      loadBakedData(client);
      await Promise.all([
        hydrateTtcOfflineData(client),
        prefillStopNames(client),
        hydrateTtcQueryLog(),
      ]);
      await hydrateTransitCache(client);
      const raw = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
      let saved: FavoritesState | null = null;
      try {
        saved = raw ? readFavoritesState(JSON.parse(raw)) : null;
      } catch {
        /* Recover from the legacy settings. */
      }
      if (disposed) return;
      setState(saved ?? restoreLegacy());
      setLoaded(true);
    })().catch(() => {
      if (disposed) return;
      setState(restoreLegacy());
      setSaveError(true);
      setLoaded(true);
    });
    return () => {
      disposed = true;
    };
  }, [client, settingsLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    writes.current = writes.current
      .catch(() => {})
      .then(async () => {
        try {
          await AsyncStorage.setItem(
            FAVORITES_STORAGE_KEY,
            JSON.stringify(state),
          );
          setSaveError(false);
        } catch {
          setSaveError(true);
        }
      });
  }, [isLoaded, state]);

  function select(id: string | null) {
    setState((prev) =>
      prev.selectedId === id ||
      (id !== null && !prev.favorites.some((f) => f.id === id))
        ? prev
        : { ...prev, selectedId: id },
    );
  }
  function save(favorite: Favorite) {
    const normalized = readFavoritesState({ version: 2, favorites: [favorite] })
      ?.favorites[0];
    if (!normalized) return;
    setState((prev) => ({
      ...prev,
      selectedId: favorite.id,
      favorites: prev.favorites.some((f) => f.id === favorite.id)
        ? prev.favorites.map((f) => (f.id === favorite.id ? normalized : f))
        : [...prev.favorites, normalized],
    }));
  }
  function setStop(id: string, stopId: string) {
    setState((prev) => ({
      ...prev,
      favorites: prev.favorites.map((f) =>
        f.id === id && f.boardings.some((b) => b.stop.id === stopId)
          ? { ...f, stopId }
          : f,
      ),
    }));
  }
  function remove(id: string) {
    setState((prev) => {
      const favorites = prev.favorites.filter((f) => f.id !== id);
      return {
        ...prev,
        favorites,
        selectedId:
          prev.selectedId === id ? (favorites[0]?.id ?? null) : prev.selectedId,
      };
    });
  }
  function restore(favorite: Favorite, index: number) {
    setState((prev) => {
      if (prev.favorites.some((f) => f.id === favorite.id)) return prev;
      const favorites = [...prev.favorites];
      favorites.splice(index, 0, favorite);
      return { ...prev, favorites, selectedId: prev.selectedId ?? favorite.id };
    });
  }
  function move(id: string, offset: number) {
    setState((prev) => {
      const index = prev.favorites.findIndex((f) => f.id === id),
        target = index + offset;
      if (index < 0 || target < 0 || target >= prev.favorites.length)
        return prev;
      const favorites = [...prev.favorites];
      [favorites[index], favorites[target]] = [
        favorites[target],
        favorites[index],
      ];
      return { ...prev, favorites };
    });
  }
  return (
    <Context.Provider
      value={{
        state,
        selected: state.favorites.find((f) => f.id === state.selectedId),
        isLoaded,
        saveError,
        select,
        setStop,
        save,
        remove,
        restore,
        move,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useFavorites() {
  const value = useContext(Context);
  if (!value) throw new Error("FavoritesProvider is missing");
  return value;
}
