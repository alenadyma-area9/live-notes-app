import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RecentNote } from "../types";
import { getRandomColor, getRandomName } from "../utils";

interface AppState {
  userName: string;
  userColor: string;
  recentNotes: RecentNote[];
}

interface AppActions {
  setUserName: (name: string) => void;
  addRecentNote: (id: string, title: string) => void;
  removeRecentNote: (id: string) => void;
}

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      userName: getRandomName(),
      userColor: getRandomColor(),
      recentNotes: [],

      setUserName: (name: string) => set({ userName: name }),

      addRecentNote: (id: string, title: string) => {
        const { recentNotes } = get();
        const filtered = recentNotes.filter((n) => n.id !== id);
        const updated = [{ id, title, lastVisited: Date.now() }, ...filtered].slice(0, 10);
        set({ recentNotes: updated });
      },

      removeRecentNote: (id: string) => {
        const { recentNotes } = get();
        set({ recentNotes: recentNotes.filter((n) => n.id !== id) });
      },
    }),
    {
      name: "live-notes-storage",
    }
  )
);
