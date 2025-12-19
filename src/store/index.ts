import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RecentNote } from "../types";
import { getColorForUser, getRandomName } from "../utils";

// Generate a unique user ID
const generateUserId = () => `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

interface AppState {
  userId: string;
  userName: string;
  userColor: string;
  recentNotes: RecentNote[];
}

interface AppActions {
  setUserName: (name: string) => void;
  addRecentNote: (id: string, title: string, isCreator?: boolean) => void;
  removeRecentNote: (id: string) => void;
  isNoteOwner: (id: string) => boolean;
}

// Create initial userId first, then derive color from it
const initialUserId = generateUserId();

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      userId: initialUserId,
      userName: getRandomName(),
      userColor: getColorForUser(initialUserId),
      recentNotes: [],

      setUserName: (name: string) => set({ userName: name }),

      addRecentNote: (id: string, title: string, isCreator?: boolean) => {
        const { recentNotes, userId, userName } = get();
        const existing = recentNotes.find((n) => n.id === id);
        const filtered = recentNotes.filter((n) => n.id !== id);

        // Keep existing owner info if note exists, otherwise set if creator
        const ownerId = existing?.ownerId || (isCreator ? userId : undefined);
        const ownerName = existing?.ownerName || (isCreator ? userName : undefined);

        const updated = [{ id, title, lastVisited: Date.now(), ownerId, ownerName }, ...filtered].slice(0, 10);
        set({ recentNotes: updated });
      },

      removeRecentNote: (id: string) => {
        const { recentNotes } = get();
        set({ recentNotes: recentNotes.filter((n) => n.id !== id) });
      },

      isNoteOwner: (id: string) => {
        const { recentNotes, userId } = get();
        const note = recentNotes.find((n) => n.id === id);
        return note?.ownerId === userId;
      },
    }),
    {
      name: "live-notes-storage",
      // Recompute color from userId on rehydration to ensure consistency
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.userColor = getColorForUser(state.userId);
        }
      },
    }
  )
);
