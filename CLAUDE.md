# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Emu is a dual-view Electron app wrapping Claude CLI with Terminal and RPG views sharing a single PTY session. It combines a full terminal experience with an interactive RPG game view where Claude's tool usage drives character movement.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SINGLE claude PTY                           │
│   ┌─────────────┐         ┌──────────────────┐                 │
│   │  Terminal   │──write─▶│   node-pty       │◀──write────────│
│   │  (xterm.js) │◀─data───│   (claude CLI)   │                 │
│   └─────────────┘         └────────┬─────────┘                 │
│                                    │ writes .jsonl             │
│                         ┌──────────▼─────────┐                 │
│                         │ Transcript Watcher │                 │
│                         │ (chokidar)         │                 │
│                         └────────┬───────────┘                 │
│                       CHAT_MESSAGE events                       │
│   ┌─────────────┐              │                               │
│   │  ChatPanel  │◀─────────────┘                               │
│   │  (React)    │──ptyWrite()─▶ same PTY                       │
│   └─────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Development Commands

```bash
npm install        # Install dependencies (auto-rebuilds node-pty)
npm run dev        # Start Vite dev server + watch main process
npm run build      # Build for production
npm start          # Build and run the app
npm run rebuild    # Rebuild node-pty for Electron
npm run dist       # Package for distribution
```

### Development Mode

Run `npm run dev` then in another terminal run `electron . --dev` to start with hot reload.

## Project Structure

```
src/
├── main/                    # Main process (Node.js)
│   ├── main.ts             # Entry point, window creation
│   ├── pty/PtyManager.ts   # Legacy PTY manager
│   ├── claude-code/
│   │   ├── process-manager.ts    # Spawns claude CLI
│   │   └── transcript-watcher.ts # Watches ~/.claude/projects/**/*.jsonl
│   └── ipc/handlers.ts     # IPC channel handlers
├── preload/
│   └── preload.ts          # Context bridge (electronAPI)
├── renderer/               # Renderer process (React)
│   ├── main.tsx           # React entry point
│   ├── App.tsx            # Tab container (Terminal/RPG)
│   ├── components/
│   │   ├── Terminal/      # xterm.js wrapper
│   │   ├── RPG/           # Game + ChatPanel container
│   │   ├── GodotGame/     # iframe for Godot game
│   │   └── ChatPanel/     # Chat UI with messages
│   ├── hooks/
│   │   └── useTranscript.ts # Subscribe to transcript events
│   └── styles/            # CSS files
├── shared/
│   ├── ipc-channels.ts    # IPC channel constants
│   └── types.ts           # Shared TypeScript types
public/
└── godot/                 # Godot game files
    ├── index.html         # Godot HTML (listens for MOVE_CHARACTER)
    ├── index.js
    ├── index.wasm
    └── index.pck
```

## Key IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `claude:start` | renderer→main | Start Claude CLI session |
| `claude:write` | renderer→main | Write to Claude PTY |
| `claude:data` | main→renderer | PTY output data |
| `chat:message` | main→renderer | Chat message from transcript |
| `chat:tool-start` | main→renderer | Tool started |
| `chat:status` | main→renderer | Status updates (thinking, tool use) |
| `game:move` | main→renderer | Move game character |

## Important Constraints

1. **DO NOT use @anthropic-ai/claude-agent-sdk** - it spawns separate processes
2. **ChatPanel MUST use ptyWrite()** - types into same PTY as Terminal
3. **GodotGameView iframe uses tabIndex={-1}** - prevents focus stealing
4. **Transcript watcher locks to first NEW .jsonl file** - ignores existing sessions

## Build System

- **Main process**: TypeScript compiled with `tsconfig.main.json` to CommonJS
- **Renderer**: React + Vite with `tsconfig.json` (ESNext modules)
- **Assets**: `public/` folder copied to `dist/renderer/` during build

## Terminal Stack

- **xterm.js** (`@xterm/xterm`) for terminal emulation
- **node-pty** for pseudo-terminal backend
- Addons: `addon-fit` (auto-resize), `addon-search`, `addon-web-links`, `addon-webgl` (GPU rendering)

## Transcript Watcher Details

The transcript watcher (`transcript-watcher.ts`) monitors Claude's JSONL transcript files:
- Watches `~/.claude/projects/{sanitized-cwd}/*.jsonl`
- Uses byte-position streaming to read new content efficiently
- Locks to the first NEW file created after Emu starts (ignores existing sessions)
- Parses entry types: `user`, `assistant`, `progress`, `system`
- Extracts `thinking`, `text`, and `tool_use` content from assistant messages

## Chat Panel

- Uses `react-markdown` with `remark-gfm` for GitHub Flavored Markdown (tables, strikethrough)
- Status indicators show "Thinking...", "Reading file...", etc.
- Messages sent via `ptyWrite()` go to the same PTY as Terminal

## Platform Notes

- macOS: Frameless window with traffic light controls
- Windows: Uses PowerShell as default shell
- Linux/macOS: Uses bash as default shell
