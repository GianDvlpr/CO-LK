import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  menuCollapsed: boolean;
  themeMode: "light" | "dark";
  setMenuCollapsed: (collapsed: boolean) => void;
  toggleTheme: () => void;
};

export const useUiStore = create<UiState>()(persist((set) => ({
  menuCollapsed: false,
  themeMode: "light",
  setMenuCollapsed: (menuCollapsed) => set({ menuCollapsed }),
  toggleTheme: () => set((state) => ({ themeMode: state.themeMode === "light" ? "dark" : "light" })),
}), { name: "lk-innovacion-ui", partialize: (state) => ({ themeMode: state.themeMode }) }));
