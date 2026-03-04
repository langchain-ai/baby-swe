# Baby SWE

Terminal-first AI coding app built with Electron + React + Zustand + DeepAgents.

## Package Manager

Use **Bun only**.

```bash
bun install
bun run dev
bun run watch
bun run build
```

## Current Architecture

- `src/main.ts`: Electron main process, terminal PTY, git/worktree IPC, project/file IPC
- `src/preload.ts`: context bridge for `agent`, `storage`, `tile`, `fs`, `terminal`, `git`
- `src/agent.ts`: DeepAgent setup, model selection, web tools, approval interrupts, stream + compaction
- `src/store.ts`: global app/session/workspace/tile state and stream event reducers
- `src/ui/App.tsx`: app shell, keyboard shortcuts, stream event wiring
- `src/ui/components/*`: prompt bar, message/tool rendering, source control, terminal, worktree UI
- `src/prompts/index.ts`: builds dynamic system prompt from env + git status + AGENTS.md

## User-Facing Features

- Multi-workspace tiling (5 workspaces)
- Tile types: `agent`, `terminal`, `source-control`, `file-viewer`
- Project and git-aware sessions with thread persistence
- Tool approval flow (`agent`/`plan`) and no-approval flow (`yolo`)
- Session TODO tracking via `write_todos`
- Manual + automatic context compaction
- Model options: Claude, GPT-5.3 Codex (effort levels), Kimi K2.5

## Commands

Registered commands live in `src/commands`:

- `/help`, `/clear`, `/new`, `/tokens`, `/compact`
- `/keys` (API key management UI)
- `/remember` (update AGENTS memory)
- `/resume` (resume prior thread for open project)
- `/model` (selection entrypoint + autocomplete in prompt UI)

## Memory + Storage

- Project memory: `<repo>/AGENTS.md` plus nested `<repo>/**/AGENTS.md` (path-scoped)
- User memory: `~/.baby-swe/AGENTS.md`
- App data stored under Electron `userData` (set to `~/Library/Application Support/Baby SWE` on macOS)

## Dev Notes

- Always run `bun run build` after edits.
- Keep IPC contracts synchronized across `main.ts`, `preload.ts`, `types.ts`, and store/UI handlers.
- Prefer updating existing files over adding new ones unless necessary.
