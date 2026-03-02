# Baby SWE

Terminal-style desktop AI coding assistant built with Electron, React, Zustand, and DeepAgents.

## Requirements

- [Bun](https://bun.sh)
- At least one LLM API key:
  - Anthropic (`ANTHROPIC_API_KEY`) or
  - OpenAI (`OPENAI_API_KEY`) or
  - Baseten (`BASETEN_API_KEY`, for Kimi)
- Optional: Tavily (`TAVILY_API_KEY`) for web search

You can set keys via `.env` or in-app with `/keys`.

## Development

```bash
bun install
bun run dev    # build + launch
bun run watch  # watch mode (main/renderer/css/electron)
bun run build  # production build to ./dist
```

## Packaging

```bash
bun run pack       # unpacked app
bun run dist       # current platform
bun run dist:mac   # macOS (zip target)
bun run dist:win   # Windows (nsis + portable)
bun run dist:linux # Linux (AppImage + deb)
```

Artifacts are written to `release/`.

## Features

- 5 workspaces with tiling layout
- Tile types: `agent`, `terminal`, `source-control`, `file-viewer`
- Git branch + PR awareness, plus worktree support
- Tool-call streaming with inline outputs and approvals
- Modes: `agent`, `plan`, `yolo`
- Session TODO tracking (`write_todos`)
- Thread persistence and `/resume`
- Context compaction (`/compact` + automatic fallback)

## Project Layout

```text
src/
  main.ts            Electron main process + IPC + git/worktree + terminal PTY
  preload.ts         Secure renderer bridge APIs
  agent.ts           DeepAgent setup, models, tools, streaming/approval logic
  store.ts           Zustand app/session/workspace state
  commands/          Slash command registration and handlers
  memory/            AGENTS.md memory loading
  prompts/           Prompt templates + dynamic system prompt builder
  ui/                React app and components
```

## Slash Commands

`/help`, `/clear`, `/new`, `/tokens`, `/compact`, `/model`, `/keys`, `/resume`, `/remember`

## Notes

- Use **Bun only** (no npm/yarn/pnpm).
- App settings/projects/threads are stored under Electron `userData`.
- On macOS this app pins `userData` to `~/Library/Application Support/Baby SWE`.

## License

MIT
