import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

interface RecentChange {
  from: number;
  to: number;
  color: string;
  userName: string;
  timestamp: number;
}

const FADE_DURATION = 3000; // 3 seconds

export interface RecentChangesOptions {
  onRegisterView?: (view: EditorView) => void;
}

export const recentChangesPluginKey = new PluginKey("recentChanges");

// Store for managing changes externally
export const recentChangesStore = {
  changes: [] as RecentChange[],

  addChange(from: number, to: number, color: string, userName: string) {
    this.changes.push({
      from,
      to,
      color,
      userName,
      timestamp: Date.now(),
    });
  },

  cleanup() {
    const now = Date.now();
    this.changes = this.changes.filter(c => now - c.timestamp < FADE_DURATION);
  },

  clear() {
    this.changes = [];
  }
};

export const RecentChangesExtension = Extension.create<RecentChangesOptions>({
  name: "recentChanges",

  addOptions() {
    return {
      onRegisterView: undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        key: recentChangesPluginKey,

        view(editorView) {
          if (options.onRegisterView) {
            options.onRegisterView(editorView);
          }
          return {};
        },

        state: {
          init() {
            return { decorations: DecorationSet.empty };
          },

          apply(tr, _state, _oldState, newState) {
            // Cleanup old changes
            recentChangesStore.cleanup();

            // Map existing change positions
            recentChangesStore.changes = recentChangesStore.changes
              .map((c) => ({
                ...c,
                from: tr.mapping.map(c.from, 1),
                to: tr.mapping.map(c.to, -1),
              }))
              .filter((c) => c.from < c.to && c.to <= newState.doc.content.size);

            // Build decorations
            const decos: Decoration[] = [];

            for (const change of recentChangesStore.changes) {
              if (
                change.from >= 0 &&
                change.to <= newState.doc.content.size &&
                change.from < change.to
              ) {
                const age = Date.now() - change.timestamp;
                const opacity = Math.max(0.2, 1 - age / FADE_DURATION);

                decos.push(
                  Decoration.inline(change.from, change.to, {
                    style: `
                      border-bottom: 2px solid ${change.color};
                      background-color: ${change.color}${Math.round(opacity * 40).toString(16).padStart(2, '0')};
                      transition: background-color 0.3s;
                    `,
                    class: "recent-change",
                  })
                );
              }
            }

            return { decorations: DecorationSet.create(newState.doc, decos) };
          },
        },

        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
