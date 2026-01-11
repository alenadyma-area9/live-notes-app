# Live Notes

A real-time collaborative note-taking app. Create, edit, and share notes instantly with anyone — no sign-up required.

**Live Demo:** https://live-notes-app-sage.vercel.app/

## Features

### Collaboration
- ✅ **Real-time editing** — Multiple users edit simultaneously with conflict-free sync
- ✅ **Live cursors** — See where collaborators are typing in real-time
- ✅ **Online presence** — View who's currently in the document
- ✅ **No sign-up required** — Share a link and start collaborating instantly

### Rich Text Editing
- ✅ **Text formatting** — Bold, italic, strikethrough
- ✅ **Headings** — H1 and H2 support
- ✅ **Lists** — Bullet lists, numbered lists, and checkbox/task lists
- ✅ **Colors** — Text color and highlight colors
- ✅ **Links** — Clickable URLs with edit bubble menu
- ✅ **Images** — Embed images (base64, up to 5MB)

### Note Management
- ✅ **Auto-save** — Changes saved automatically
- ✅ **Version history** — View, compare (diff), and restore previous versions
- ✅ **Duplicate notes** — Create copies from editor or home page
- ✅ **Lock notes** — Restrict access to owner only
- ✅ **Delete notes** — Permanent deletion with confirmation
- ✅ **Recent notes** — Quick access with search, filter, and sort

### User Experience
- ✅ **Mobile responsive** — Optimized UI for all screen sizes
- ✅ **Sync indicator** — Shows connection status with tooltips
- ✅ **List/Grid view** — Toggle between view modes on home page
- ✅ **Keyboard shortcuts** — Standard formatting shortcuts (Ctrl+B, etc.)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite |
| UI | Chakra UI v3, react-icons |
| Editor | TipTap v2 (ProseMirror) |
| Real-time | Yjs CRDT + y-partykit |
| Backend | PartyKit (WebSocket server) |
| State | Zustand with localStorage |
| Hosting | Vercel (frontend) + PartyKit Cloud (WebSocket) |

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/user/live-notes-app.git
cd live-notes-app

# Install dependencies
npm install
```

### Development

Run both servers concurrently:

```bash
npm run dev:all
```

Or run them separately in two terminals:

```bash
# Terminal 1 - Frontend (Vite)
npm run dev

# Terminal 2 - Backend (PartyKit)
npm run dev:party
```

Open http://localhost:5173 in your browser.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run dev:party` | Start PartyKit dev server (port 1999) |
| `npm run dev:all` | Start both servers concurrently |
| `npm run build` | Build frontend for production |
| `npm run check` | TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build |

## Deployment

This app has **two separate deployments** that must be managed independently:

| Component | Platform | Auto-deploy? | When to deploy |
|-----------|----------|--------------|----------------|
| Frontend | Vercel | ✅ Yes (on git push) | Changes to `src/` |
| Backend | PartyKit Cloud | ❌ No (manual) | Changes to `party/` |

### Frontend (Vercel)

Vercel automatically deploys when you push to `main`. No action needed.

For manual deployment:
```bash
vercel --prod
```

### PartyKit (WebSocket Server)

**Important:** PartyKit does NOT auto-deploy. You must manually deploy after any changes to files in the `party/` directory.

```bash
# First time only - login to PartyKit
npx partykit login

# Deploy backend (run after any party/ changes)
npx partykit deploy
```

**Common mistake:** Pushing changes to `party/index.ts` and assuming they're live. The frontend will deploy automatically, but the backend won't — causing 404 errors or missing functionality until you run `npx partykit deploy`.

## Environment Variables

Create `.env` for local development:

```env
VITE_PARTYKIT_HOST=localhost:1999
```

For production (`.env.production`):

```env
VITE_PARTYKIT_HOST=your-app.username.partykit.dev
```

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── Editor.tsx           # Main collaborative editor
│   │   ├── Toolbar.tsx          # Formatting toolbar
│   │   ├── HistoryPanel.tsx     # Version history sidebar
│   │   ├── InlineDiffView.tsx   # Version comparison diff
│   │   ├── CollaboratorsList.tsx # Online users display
│   │   └── ConfirmDialog.tsx    # Reusable dialog component
│   ├── pages/
│   │   ├── Home.tsx             # Home page with note list
│   │   └── NotePage.tsx         # Note editor page
│   ├── store/
│   │   └── index.ts             # Zustand store
│   └── main.tsx                 # App entry point
├── party/
│   └── index.ts                 # PartyKit server (Yjs sync + REST API)
├── public/
│   └── favicon.svg              # App favicon
└── package.json
```

## API Endpoints (PartyKit)

The PartyKit server exposes REST endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/parties/notes/:id` | WebSocket | Real-time Yjs sync |
| `/parties/notes/:id/versions` | GET | List version history |
| `/parties/notes/:id/version/:vid` | GET | Get specific version |
| `/parties/notes/:id/restore/:vid` | POST | Restore version |
| `/parties/notes/:id/state` | GET | Get current document state |
| `/parties/notes/:id/init` | POST | Initialize note with state |
| `/parties/notes/:id/lock` | POST | Toggle lock status |
| `/parties/notes/:id/delete` | POST | Delete note |

## License

MIT
