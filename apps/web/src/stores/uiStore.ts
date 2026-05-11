import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  paletteOpen: boolean;
  toggleSidebar: () => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  paletteOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
}));
