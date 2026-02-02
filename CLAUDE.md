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
├── agent.ts          # DeepAgents configuration + streaming
├── backends/
│   └── local-sandbox.ts  # Shell execution backend
├── commands/
│   ├── index.ts      # Command exports
│   ├── registry.ts   # Command registration and parsing
│   ├── clear.ts      # /clear command
│   ├── help.ts       # /help command
│   ├── new.ts        # /new command
│   └── tokens.ts     # /tokens command
└── ui/
    ├── App.tsx       # Main app component
    └── components/
        ├── ToolExecution.tsx     # Tool execution UI (shell-specific)
        ├── CommandAutocomplete.tsx
        ├── FileAutocomplete.tsx
        └── ...
```

## Key Components

- **App.tsx** - Handles user input, invokes agent, renders messages, processes stream events
- **agent.ts** - Creates DeepAgent with Anthropic model and tools, streams tool events to renderer
- **store.ts** - Manages messages, token usage, model config, tool execution state
- **LocalSandboxBackend** - Wraps FilesystemBackend with shell execution capability

## Tool Execution Streaming

Tool executions are streamed in real-time to the UI:
1. `on_tool_start` event → `addToolStart()` creates a tool-execution chunk
2. `on_tool_end` event → `updateToolEnd()` updates the chunk with output
3. `MessageView` renders tool chunks during streaming via `StreamingContent`
4. `finalizeStream()` preserves tool chunks when stream completes

## Running

```bash
bun install
bun run dev
```

## Environment

Requires `.env` with `ANTHROPIC_API_KEY`

## Development Guidelines

- Always run `bun run build` after making changes to verify TypeScript compiles without errors
- Watch for circular dependencies when creating new modules
- Tool events flow: main process → IPC → renderer → store → UI components
- When adding new tools that need visual feedback, handle both `on_tool_start` and `on_tool_end` events in agent.ts
