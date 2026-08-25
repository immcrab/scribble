import { create } from "zustand";

/** Ephemeral (not persisted) trigger for the in-site location consent popup —
 * see components/LocationConsentPrompt.tsx and lib/clientContext.ts, which
 * calls `request()` instead of ever touching navigator.geolocation directly. */
interface LocationPromptState {
  visible: boolean;
  request: () => void;
  dismiss: () => void;
}

export const useLocationPrompt = create<LocationPromptState>((set) => ({
  visible: false,
  request: () => set({ visible: true }),
  dismiss: () => set({ visible: false }),
}));
