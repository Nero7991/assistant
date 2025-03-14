import { create } from 'zustand';

type SidebarStore = {
  isCollapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
};

export const useSidebar = create<SidebarStore>((set) => ({
  isCollapsed: localStorage.getItem("sidebarCollapsed") === "true",
  setCollapsed: (collapsed) => {
    localStorage.setItem("sidebarCollapsed", String(collapsed));
    set({ isCollapsed: collapsed });
  },
  toggle: () => set((state) => {
    const newState = !state.isCollapsed;
    localStorage.setItem("sidebarCollapsed", String(newState));
    return { isCollapsed: newState };
  }),
}));
