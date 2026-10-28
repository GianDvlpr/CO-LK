import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StoredWorkspaceTab = { key: string; href: string };

type UiState = {
  menuCollapsed: boolean;
  themeMode: "light" | "dark";
  workspaceTabsByUser: Record<string, StoredWorkspaceTab[]>;
  setMenuCollapsed: (collapsed: boolean) => void;
  toggleTheme: () => void;
  setWorkspaceTabs: (userId: string, tabs: StoredWorkspaceTab[]) => void;
};

export const useUiStore = create<UiState>()(persist((set) => ({
  menuCollapsed: false,
  themeMode: "light",
  workspaceTabsByUser: {},
  setMenuCollapsed: (menuCollapsed) => set({ menuCollapsed }),
  toggleTheme: () => set((state) => ({ themeMode: state.themeMode === "light" ? "dark" : "light" })),
  setWorkspaceTabs: (userId, tabs) => set((state) => ({ workspaceTabsByUser: { ...state.workspaceTabsByUser, [userId]: tabs } })),
}), { name: "lk-innovacion-ui", partialize: (state) => ({ themeMode: state.themeMode, workspaceTabsByUser: state.workspaceTabsByUser }) }));
