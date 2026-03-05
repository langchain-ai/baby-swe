# Baby SWE

Terminal-style desktop AI coding assistant built with Electron + React + Zustand, now running as an ACP client with swappable harnesses.

## ACP-First Architecture

Baby SWE talks ACP and can switch harnesses at runtime from Settings (top-right cog).

- `cursor` harness (default): runs Cursor ACP via `agent acp`
- `deepagents` harness: runs Deepagents ACP via `deepagents-acp`

Harness selection is persisted in app settings.

## Auth and Keys

### Cursor Harness

- Uses your existing Cursor CLI auth session.
- Authenticate with `agent login` (or from Settings: **Authenticate with Cursor CLI**).
- Check status with `agent status`.
- No Baby SWE API keys required for this harness.

### Deepagents Harness

- Uses your own model provider keys.
- Configure via `.env` or in-app `/keys`.
- At least one LLM key is required:
  - Anthropic (`ANTHROPIC_API_KEY`)
  - OpenAI (`OPENAI_API_KEY`)
  - Baseten (`BASETEN_API_KEY`, for Kimi)
- Optional web-search key:
  - Tavily (`TAVILY_API_KEY`)

## Requirements

- [Bun](https://bun.sh)
- Cursor CLI (`agent`) for the Cursor harness

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
- Tile types: `agent`, `terminal`, `source-control`, `file-viewer`, `diff-viewer`
- ACP harness switching in Settings (`cursor` / `deepagents`)
- Cursor auth status + login from Settings
- Git branch + PR awareness, plus worktree support
- Tool-call streaming with inline outputs and approvals
- Modes: `agent`, `yolo`
- Session TODO tracking (`write_todos`)
- Thread persistence and `/resume`
- Manual context compaction (`/compact`)

## Project Layout

```text
src/
  main.ts            Electron main process + IPC + git/worktree + terminal PTY
  preload.ts         Secure renderer bridge APIs
  acp-client.ts      ACP JSON-RPC transport, harness command routing, auth helpers
  agent.ts           ACP session orchestration, streaming, approvals, compaction
  store.ts           Zustand app/session/workspace state
  commands/          Slash command registration and handlers
  memory/            AGENTS.md memory loading
  prompts/           Prompt templates + dynamic system prompt builder
  ui/                React app and components
```

## Slash Commands

`/help`, `/clear`, `/new`, `/tokens`, `/compact`, `/model`, `/keys`, `/resume`, `/remember`

## Optional ACP Command Overrides

For advanced setups you can override harness commands with env vars:

- Cursor ACP: `BABY_SWE_ACP_COMMAND`, `BABY_SWE_ACP_ARGS`
- Cursor CLI auth/status command: `BABY_SWE_CURSOR_CLI_COMMAND`
- Deepagents ACP: `BABY_SWE_DEEPAGENTS_ACP_COMMAND`, `BABY_SWE_DEEPAGENTS_ACP_ARGS`

## Notes

- Use **Bun only** (no npm/yarn/pnpm).
- App settings/projects/threads are stored under Electron `userData`.
- On macOS this app pins `userData` to `~/Library/Application Support/Baby SWE`.

## License

MIT
