import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  // Add your state properties here
}

interface AppActions {
  // Add your actions here
}

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (_set, _get) => ({
      // Initial state and actions
    }),
    {
      name: 'live-notes-storage',
    }
  )
)
