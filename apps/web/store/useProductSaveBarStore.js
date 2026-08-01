import { create } from "zustand";

export const useProductSaveBarStore = create((set) => ({
  active: false,
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
  hide: () =>
    set({
      active: false,
      saving: false,
      onSave: null,
      onDiscard: null,
    }),
}));
