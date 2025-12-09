# Live Notes

Real-time collaborative note-taking app. Create, edit, and share notes instantly with anyone.

**Live Demo:** https://live-notes-qjvxfw7el-alenas-projects-7c7d7ea6.vercel.app

## Features

- ✅ **Real-time collaboration** - Multiple users edit simultaneously
- ✅ **No sign-up required** - Share a link, start collaborating
- ✅ **Rich text editing** - Bold, italic, headings, lists
- ✅ **Live cursors** - See where others are typing
- ✅ **Online presence** - See who's currently editing
- ✅ **Note titles** - Name your notes, synced across collaborators
- ✅ **Recent notes** - Quick access to your recently visited notes

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Chakra UI v3
- **Editor:** Tiptap v2 with Yjs CRDT
- **Real-time:** PartyKit + y-partykit
- **State:** Zustand with localStorage persistence
- **Hosting:** Vercel (frontend) + PartyKit Cloud (WebSocket)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Development

Run both servers in separate terminals:

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - PartyKit:**
```bash
npm run dev:party
```

Open http://localhost:5173

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run dev:party` | Start PartyKit dev server |
| `npm run build` | Build for production |
| `npm run check` | TypeScript type checking |
| `npm run lint` | Run ESLint |

## Deployment

### Automatic (Recommended)

GitHub is connected to Vercel - every `git push` auto-deploys the frontend.

### Manual

**PartyKit (WebSocket Server):**
```bash
npx partykit login
npx partykit deploy
```

**Frontend (Vercel):**
```bash
vercel --prod
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_PARTYKIT_HOST` | PartyKit server URL | `localhost:1999` |

Production value: `live-notes-app.alenadyma-area9.partykit.dev`

## Project Structure

```
src/
├── components/     # React components
│   ├── Editor.tsx          # Collaborative Tiptap editor
│   ├── Toolbar.tsx         # Formatting toolbar
│   └── CollaboratorsList.tsx
├── pages/          # Route pages
│   ├── Home.tsx
│   └── NotePage.tsx
├── store/          # Zustand store
├── types/          # TypeScript types
└── utils/          # Helper functions

party/              # PartyKit server
├── index.ts        # Yjs collaboration server
└── main.ts         # Main entry point
```

## Future Improvements

- [ ] Connection status indicator (online/offline)
- [ ] Toolbar tooltips
- [ ] Empty state placeholder
- [ ] Mobile responsive polish

## License

MIT
