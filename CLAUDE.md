# Baby SWE

Quick reference for contributors and coding agents.

## Tooling

Use **Bun only**.

```bash
bun install
bun run dev
bun run watch
bun run build
```

## Core Files

- `src/main.ts`: Electron window + IPC + PTY terminal + git/worktree operations
- `src/preload.ts`: secure bridge APIs for renderer
- `src/agent.ts`: DeepAgents runtime, model routing, web tools, approvals, streaming, compaction
- `src/store.ts`: Zustand state for sessions/workspaces/tiles/messages/tools
- `src/ui/App.tsx`: workspace shell, keyboard shortcuts, stream event handling
- `src/prompts/index.ts`: dynamic system prompt (git status, directory structure, AGENTS memory)

## Product Shape (Current)

- 5 switchable workspaces
- Tile layout system with: `agent`, `terminal`, `source-control`, `file-viewer`
- Per-project thread history and resume support
- Tool approvals in `agent`/`plan` mode, no approvals in `yolo`
- Streamed tool lifecycle events + TODO updates
- Auto/manual compaction when context is large

## Models + Keys

- Anthropic (`claude-*`)
- OpenAI (`gpt-5.3-codex` with effort levels)
- Baseten (`kimi-k2.5`)
- Tavily for web search

Keys are managed via `/keys` and persisted in app settings.

## Commands

`/help`, `/clear`, `/new`, `/tokens`, `/compact`, `/model`, `/keys`, `/resume`, `/remember`

## Memory Files

- Project memory: `AGENTS.md` in repo root
- User memory: `~/.baby-swe/AGENTS.md`

## Development Guardrails

- Always run `bun run build` after edits.
- Keep `main.ts` ↔ `preload.ts` ↔ `types.ts` interfaces aligned.
- Prefer small, targeted changes over broad refactors.
