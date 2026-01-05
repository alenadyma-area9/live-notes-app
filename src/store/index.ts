import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RecentNote } from "../types";
import { getColorForUser, getRandomName } from "../utils";

// Generate a unique user ID
const generateUserId = () => `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

type ViewType = "list" | "grid";

interface AppState {
  userId: string;
  userName: string;
  userColor: string;
  recentNotes: RecentNote[];
  viewType: ViewType;
}

interface AppActions {
  setUserName: (name: string) => void;
  setViewType: (viewType: ViewType) => void;
  addRecentNote: (id: string, title: string, isCreator?: boolean, preview?: string) => void;
  updateNoteOwner: (id: string, ownerId: string, ownerName: string) => void;
  updateNotePreview: (id: string, preview: string) => void;
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
      viewType: "list",

      setUserName: (name: string) => set({ userName: name }),
      setViewType: (viewType: ViewType) => set({ viewType }),

      addRecentNote: (id: string, title: string, isCreator?: boolean, preview?: string) => {
        const { recentNotes, userId, userName } = get();
        const existing = recentNotes.find((n) => n.id === id);
        const filtered = recentNotes.filter((n) => n.id !== id);

        // Keep existing owner info if note exists, otherwise set if creator
        const ownerId = existing?.ownerId || (isCreator ? userId : undefined);
        const ownerName = existing?.ownerName || (isCreator ? userName : undefined);
        // Preserve createdAt or set it for new notes
        const createdAt = existing?.createdAt || Date.now();
        // Use new preview or keep existing
        const notePreview = preview !== undefined ? preview : existing?.preview;

        const updated = [{ id, title, lastVisited: Date.now(), createdAt, ownerId, ownerName, preview: notePreview }, ...filtered].slice(0, 50);
        set({ recentNotes: updated });
      },

      updateNoteOwner: (id: string, ownerId: string, ownerName: string) => {
        const { recentNotes } = get();
        const updated = recentNotes.map((n) =>
          n.id === id ? { ...n, ownerId, ownerName } : n
        );
        set({ recentNotes: updated });
      },

      updateNotePreview: (id: string, preview: string) => {
        const { recentNotes } = get();
        const updated = recentNotes.map((n) =>
          n.id === id ? { ...n, preview } : n
        );
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
