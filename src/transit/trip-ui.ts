import { createContext, useContext } from "react";

export type TripEditorOptions = {
  /** Edit this saved trip instead of creating a new one. */
  id?: string;
  /** Start a new trip running this saved trip's routes the other way. */
  reverseOf?: string;
};

type TripUi = {
  /** Full-screen trip chooser — the start screen. */
  openPicker: () => void;
  /** Full-screen flow to add or edit a trip. */
  openEditor: (options?: TripEditorOptions) => void;
};

export const TripUiContext = createContext<TripUi>({
  openPicker: () => {},
  openEditor: () => {},
});

export function useTripUi() {
  return useContext(TripUiContext);
}
