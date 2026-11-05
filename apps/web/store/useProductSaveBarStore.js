import { create } from "zustand";

export const useProductSaveBarStore = create((set, get) => ({
  active: false,
  /** Bumped each time a navigation is refused, so the bar can shake. */
  nudge: 0,
  saving: false,
  onSave: null,
  onDiscard: null,
  show: ({ onSave, onDiscard, saving = false }) =>
    set({
      active: true,
      saving: !!saving,
      onSave: typeof onSave === "function" ? onSave : null,
      onDiscard: typeof onDiscard === "function" ? onDiscard : null,
    }),
  setSaving: (saving) => set({ saving: !!saving }),
  /**
   * Call before navigating away in code. Returns true (and shakes the bar)
   * when there are unsaved changes, so the caller should stay put.
   */
  blockNavigation: () => {
    if (!get().active) return false;
    set((s) => ({ nudge: s.nudge + 1 }));
    return true;
  },
  hide: () =>
    set({
      active: false,
      saving: false,
      onSave: null,
      onDiscard: null,
    }),
}));
