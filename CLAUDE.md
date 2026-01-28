# Baby-SWE

A terminal-style AI coding assistant built with Electron and React.

## Architecture

- **Electron** - Desktop app shell (main process in `src/main.ts`)
- **React** - UI framework (renderer in `src/renderer.tsx`)
- **Zustand** - State management (`src/store.ts`)
- **DeepAgents** - LangChain agent framework (`src/agent.ts`)
- **Anthropic Claude** - LLM provider

## Project Structure

```
src/
├── main.ts           # Electron main process
├── preload.ts        # Electron context bridge
├── renderer.tsx      # React entry point
├── store.ts          # Zustand global state
├── types.ts          # TypeScript types
├── agent.ts          # DeepAgents configuration
└── tui/
    ├── App.tsx       # Main app component
    └── components/   # UI components
```

## Key Components

- **App.tsx** - Handles user input, invokes agent, renders messages
- **agent.ts** - Creates DeepAgent with Anthropic model and tools
- **store.ts** - Manages messages, token usage, model config

## Running

```bash
bun install
bun run dev
```

## Environment

Requires `.env` with `ANTHROPIC_API_KEY`
