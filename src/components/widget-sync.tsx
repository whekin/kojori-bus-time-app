import { useEffect, useEffectEvent, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";

import { getAppColors } from "@/constants/theme";
import { useI18n } from "@/hooks/use-i18n";
import { useSettings } from "@/hooks/use-settings";
import type { SchedulePeriod } from "@/services/ttc";
import { scheduleQuery } from "@/transit/data";
import { useFavorites } from "@/transit/favorites";
import { activeBoardings, patternKey } from "@/transit/model";
import { buildFavoritesWidget } from "@/transit/widget";
import KojoriWidget from "../../modules/kojori-widget";

/** Both native platforms render the same offline favorite snapshots. */
export function WidgetSync() {
  const { settings } = useSettings();
  const { state, isLoaded } = useFavorites();
  const { resolvedLanguage } = useI18n();
  const client = useQueryClient();
  const queue = useRef(Promise.resolve());
  const publish = useEffectEvent(async () => {
    if (!KojoriWidget) return;
    const schedules = new Map<string, SchedulePeriod[]>();
    for (const boarding of state.favorites.flatMap((f) => f.boardings)) {
      const options = scheduleQuery(boarding);
      const seed =
        typeof options.initialData === "function"
          ? options.initialData()
          : options.initialData;
      schedules.set(
        patternKey(boarding),
        client.getQueryData<SchedulePeriod[]>(options.queryKey) ?? seed ?? [],
      );
    }
    const colors = (mode: "dark" | "light") => {
      const c = getAppColors(settings.paletteId, mode);
      return [c.route380, c.route316, c.map, c.primary];
    };
    // Widgets follow the stop the rider currently boards at for each trip.
    const snapshot = buildFavoritesWidget(
      state.favorites.map((f) => ({ ...f, boardings: activeBoardings(f) })),
      schedules,
      resolvedLanguage,
      { dark: colors("dark"), light: colors("light") },
    );
    await KojoriWidget.syncWidgetState(
      JSON.stringify({
        ...snapshot,
        legacySelections: {
          kojori: "legacy:toKojori",
          tbilisi: "legacy:toTbilisi",
        },
      }),
    );
  });
  useEffect(() => {
    if (!isLoaded || Platform.OS === "web" || !KojoriWidget) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        queue.current = queue.current
          .catch(() => {})
          .then(async () => {
            if (!disposed) await publish();
          })
          .catch(() => {});
      }, 200);
    };
    sync();
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "success" &&
        event.query.queryKey[0] === "transit" &&
        event.query.queryKey[1] === "schedule"
      )
        sync();
      if (
        event.type === "removed" &&
        event.query.queryKey[0] === "transit" &&
        event.query.queryKey[1] === "schedule"
      )
        sync();
    });
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") sync();
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribe();
      subscription.remove();
    };
  }, [client, isLoaded, state.favorites, resolvedLanguage, settings.paletteId]);
  return null;
}
