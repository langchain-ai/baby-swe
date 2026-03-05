import { spawn } from "child_process";
import * as path from "path";
import * as readline from "readline";
import { v4 as uuidv4 } from "uuid";
import { loadAgentMemory } from "./memory/agents";
import type {
  AgentHarness,
  ApprovalDecision,
  ChatMessage,
  CursorAuthStatus,
  CursorLoginResult,
  CursorLogoutResult,
  DiffData,
  Mode,
  ModelConfig,
} from "./types";

const ACP_PROMPT_CHAR_LIMIT = 120_000;
const CURSOR_ACP_DEFAULT_COMMAND = "agent";
const CURSOR_ACP_DEFAULT_ARGS = ["acp"];
const CURSOR_CLI_STATUS_ARGS = ["status"];
const CURSOR_CLI_LOGIN_ARGS = ["login"];
const CURSOR_CLI_LOGOUT_ARGS = ["logout"];
const DEEPAGENTS_ACP_PACKAGE = "deepagents-acp";
const ACP_DEFAULT_AUTH_METHOD = "cursor_login";
const ACP_DEFAULT_CLIENT_NAME = "baby-swe";
const ACP_PROTOCOL_VERSION = 1;
const CURSOR_CLI_STATUS_TIMEOUT_MS = 10_000;
const CURSOR_CLI_LOGOUT_TIMEOUT_MS = 10_000;

type AcpProcessTarget = {
  command: string;
  args: string[];
};

type JsonRpcId = number | string;

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type RpcRequestHandler = (id: JsonRpcId, method: string, params: unknown) => Promise<unknown> | unknown;
type RpcNotificationHandler = (method: string, params: unknown) => void;

type ToolState = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  started: boolean;
  ended: boolean;
};

export type ApprovalRequestInput = {
  approvalRequestId: string;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
};

export type RunAcpStreamOptions = {
  harness: AgentHarness;
  sessionId: string;
  messages: ChatMessage[];
  mode: Mode;
  modelConfig: ModelConfig;
  folder: string | null;
  controller: AbortController;
  clientVersion: string;
  send: (event: Record<string, unknown>) => void;
  requestApproval: (request: ApprovalRequestInput) => Promise<ApprovalDecision>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAcpArgs(rawArgs: string | undefined, fallbackArgs: string[]): string[] {
  if (!rawArgs) return [...fallbackArgs];
  const trimmed = rawArgs.trim();
  if (!trimmed) return [...fallbackArgs];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const args = parsed.filter((v) => typeof v === "string") as string[];
        if (args.length > 0) return args;
      }
    } catch {
      // Fall through and split by whitespace.
    }
  }

  const args = trimmed.split(/\s+/).filter(Boolean);
  return args.length > 0 ? args : [...fallbackArgs];
}

function parseAcpCommand(rawCommand: string | undefined, fallbackCommand: string): string {
  const trimmed = (rawCommand || "").trim();
  return trimmed || fallbackCommand;
}

function resolveCursorCliCommand(): string {
  return parseAcpCommand(
    process.env.BABY_SWE_CURSOR_CLI_COMMAND || process.env.BABY_SWE_ACP_COMMAND,
    CURSOR_ACP_DEFAULT_COMMAND,
  );
}

function resolveCursorAcpTarget(): AcpProcessTarget {
  return {
    command: parseAcpCommand(process.env.BABY_SWE_ACP_COMMAND, CURSOR_ACP_DEFAULT_COMMAND),
    args: parseAcpArgs(process.env.BABY_SWE_ACP_ARGS, CURSOR_ACP_DEFAULT_ARGS),
  };
}

function resolveDeepagentsAcpTarget(): AcpProcessTarget {
  const overrideCommand = parseAcpCommand(process.env.BABY_SWE_DEEPAGENTS_ACP_COMMAND, "");
  if (overrideCommand) {
    return {
      command: overrideCommand,
      args: parseAcpArgs(process.env.BABY_SWE_DEEPAGENTS_ACP_ARGS, []),
    };
  }

  try {
    const packageJsonPath = require.resolve(`${DEEPAGENTS_ACP_PACKAGE}/package.json`);
    const cliPath = path.join(path.dirname(packageJsonPath), "dist", "cli.js");
    return {
      command: process.execPath,
      args: parseAcpArgs(process.env.BABY_SWE_DEEPAGENTS_ACP_ARGS, [cliPath]),
    };
  } catch {
    throw new Error(
      `[acp] ${DEEPAGENTS_ACP_PACKAGE} is not installed. Run "bun add ${DEEPAGENTS_ACP_PACKAGE}" or configure BABY_SWE_DEEPAGENTS_ACP_COMMAND.`,
    );
  }
}

function resolveAcpTarget(harness: AgentHarness): AcpProcessTarget {
  if (harness === "deepagents") {
    return resolveDeepagentsAcpTarget();
  }
  return resolveCursorAcpTarget();
}

function stripAnsi(input: string): string {
  return input
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "")
    .replace(/\u0007/g, "");
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs?: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timeoutHandle: NodeJS.Timeout | null = null;

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("error", (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    });

    proc.on("exit", (code, signal) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({ code, signal, stdout, stderr });
    });

    if (timeoutMs && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        proc.kill("SIGTERM");
      }, timeoutMs);
    }
  });
}

export async function getCursorAuthStatus(): Promise<CursorAuthStatus> {
  const command = resolveCursorCliCommand();

  try {
    const result = await runCommand(command, CURSOR_CLI_STATUS_ARGS, CURSOR_CLI_STATUS_TIMEOUT_MS);
    const combinedOutput = stripAnsi(`${result.stdout}\n${result.stderr}`).trim();
    const accountMatch = combinedOutput.match(/logged in as\s+([^\s]+)/i);
    const authenticated = Boolean(accountMatch);

    return {
      cliAvailable: true,
      authenticated,
      account: accountMatch?.[1] || null,
      detail: combinedOutput || null,
      ...(result.code !== 0 && !authenticated
        ? { error: `Cursor CLI exited with code ${result.code ?? "unknown"}` }
        : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      cliAvailable: false,
      authenticated: false,
      account: null,
      detail: null,
      error: `Cursor CLI unavailable: ${message}`,
    };
  }
}

export async function startCursorLogin(): Promise<CursorLoginResult> {
  const command = resolveCursorCliCommand();
  return new Promise<CursorLoginResult>((resolve) => {
    const proc = spawn(command, CURSOR_CLI_LOGIN_ARGS, {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: process.env,
    });

    let settled = false;
    const settle = (result: CursorLoginResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    proc.once("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      settle({ started: false, error: `Failed to start Cursor login: ${message}` });
    });

    proc.once("spawn", () => {
      proc.unref();
      settle({ started: true });
    });
  });
}

export async function runCursorLogout(): Promise<CursorLogoutResult> {
  const command = resolveCursorCliCommand();
  try {
    const result = await runCommand(command, CURSOR_CLI_LOGOUT_ARGS, CURSOR_CLI_LOGOUT_TIMEOUT_MS);
    const combinedOutput = stripAnsi(`${result.stdout}\n${result.stderr}`).trim();
    if (result.code === 0) {
      return {
        success: true,
        detail: combinedOutput || null,
      };
    }

    return {
      success: false,
      detail: combinedOutput || null,
      error: `Cursor logout failed with code ${result.code ?? "unknown"}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      detail: null,
      error: `Failed to run Cursor logout: ${message}`,
    };
  }
}

class NdJsonRpcProcessClient {
  private readonly proc;
  private readonly lineReader;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private nextId = 1;
  private closed = false;
  private requestHandler: RpcRequestHandler | null = null;
  private notificationHandler: RpcNotificationHandler | null = null;

  constructor(command: string, args: string[], cwd: string) {
    this.proc = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.proc.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8").trim();
      if (message) {
        console.warn(`[acp] ${message}`);
      }
    });

    this.lineReader = readline.createInterface({ input: this.proc.stdout });
    this.lineReader.on("line", (line: string) => this.handleLine(line));

    this.proc.on("error", (error: Error) => {
      this.failPending(new Error(`[acp] Failed to start process: ${error.message}`));
    });

    this.proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.closed) return;
      const reason = signal
        ? `signal ${signal}`
        : `exit code ${code === null ? "unknown" : code}`;
      this.failPending(new Error(`[acp] Process terminated with ${reason}`));
    });
  }

  setRequestHandler(handler: RpcRequestHandler): void {
    this.requestHandler = handler;
  }

  setNotificationHandler(handler: RpcNotificationHandler): void {
    this.notificationHandler = handler;
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("[acp] RPC client is closed"));
    }

    const id = this.nextId++;
    this.write({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    if (this.closed) return;
    this.write({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    try {
      this.lineReader.close();
    } catch {
      // Ignore cleanup errors.
    }

    try {
      this.proc.stdin.end();
    } catch {
      // Ignore cleanup errors.
    }

    if (!this.proc.killed) {
      try {
        this.proc.kill();
      } catch {
        // Ignore cleanup errors.
      }
    }

    this.failPending(new Error("[acp] RPC client closed"));
  }

  private write(payload: Record<string, unknown>): void {
    if (this.closed || this.proc.stdin.destroyed) return;
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private respond(id: JsonRpcId, result: Record<string, unknown>): void {
    this.write({
      jsonrpc: "2.0",
      id,
      result,
    });
  }

  private respondError(id: JsonRpcId, message: string): void {
    this.write({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message,
      },
    });
  }

  private failPending(error: Error): void {
    if (this.pending.size === 0) return;
    const pendings = Array.from(this.pending.values());
    this.pending.clear();
    for (const pending of pendings) {
      pending.reject(error);
    }
  }

  private handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (!isRecord(message)) return;

    const hasResponseId = typeof message.id === "number" || typeof message.id === "string";
    const hasResult = Object.prototype.hasOwnProperty.call(message, "result");
    const hasError = Object.prototype.hasOwnProperty.call(message, "error");

    if (hasResponseId && (hasResult || hasError)) {
      const id = message.id as JsonRpcId;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);

      if (hasError) {
        const err = formatRpcError(pending.method, message.error);
        pending.reject(new Error(err));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    const method = typeof message.method === "string" ? message.method : null;
    if (!method) return;

    const params = Object.prototype.hasOwnProperty.call(message, "params")
      ? message.params
      : {};

    if (hasResponseId) {
      if (!this.requestHandler) {
        this.respondError(message.id as JsonRpcId, `Unhandled method: ${method}`);
        return;
      }

      Promise.resolve(this.requestHandler(message.id as JsonRpcId, method, params))
        .then((result) => {
          if (this.closed) return;
          if (isRecord(result)) {
            this.respond(message.id as JsonRpcId, result);
          } else {
            this.respond(message.id as JsonRpcId, {});
          }
        })
        .catch((error: unknown) => {
          const messageText = error instanceof Error ? error.message : String(error);
          this.respondError(message.id as JsonRpcId, messageText);
        });
      return;
    }

    if (this.notificationHandler) {
      this.notificationHandler(method, params);
    }
  }
}

function formatRpcError(method: string, errorValue: unknown): string {
  if (isRecord(errorValue) && typeof errorValue.message === "string") {
    return `[acp:${method}] ${errorValue.message}`;
  }
  if (typeof errorValue === "string") {
    return `[acp:${method}] ${errorValue}`;
  }
  return `[acp:${method}] Request failed`;
}

function flattenMessageContent(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      parts.push(block.text);
      continue;
    }
    if (block.type === "image_url") {
      parts.push("[Image attachment]");
      continue;
    }
  }

  return parts.join("\n");
}

function buildAcpPromptText(messages: ChatMessage[], agentMemory: string | null): string {
  const transcriptLines = messages.map((message) => {
    const role = message.role === "assistant" ? "Assistant" : "User";
    const content = flattenMessageContent(message.content).trim();
    return `${role}: ${content || "[empty]"}`;
  });

  const sections: string[] = [];
  if (agentMemory && agentMemory.trim()) {
    sections.push(
      "Follow these project/user instructions while responding:",
      agentMemory.trim(),
    );
  }
  sections.push(
    "Conversation transcript:",
    transcriptLines.join("\n\n"),
    "Respond to the latest user message.",
  );

  let prompt = sections.join("\n\n");
  if (prompt.length > ACP_PROMPT_CHAR_LIMIT) {
    prompt = `[Earlier transcript truncated]\n${prompt.slice(-ACP_PROMPT_CHAR_LIMIT)}`;
  }
  return prompt;
}

function parseToolArgs(rawInput: unknown): Record<string, unknown> {
  if (isRecord(rawInput)) return rawInput;
  if (Array.isArray(rawInput)) return { items: rawInput };
  if (typeof rawInput === "string") {
    try {
      const parsed = JSON.parse(rawInput);
      if (isRecord(parsed)) return parsed;
      if (Array.isArray(parsed)) return { items: parsed };
      return { input: rawInput };
    } catch {
      return { input: rawInput };
    }
  }
  return {};
}

function contentBlockToText(contentBlock: unknown): string {
  if (!isRecord(contentBlock)) return "";
  const type = typeof contentBlock.type === "string" ? contentBlock.type : "";

  if (type === "text" && typeof contentBlock.text === "string") {
    return contentBlock.text;
  }
  if (type === "image") {
    return "[Image output]";
  }
  if (type === "resource_link") {
    const name = typeof contentBlock.name === "string" ? contentBlock.name : "resource";
    return `[Resource link: ${name}]`;
  }
  if (type === "resource") {
    return "[Embedded resource output]";
  }

  return "";
}

function parseToolContent(content: unknown): { output: string; diffData?: DiffData } {
  if (!Array.isArray(content)) {
    return { output: "" };
  }

  const outputParts: string[] = [];
  let diffData: DiffData | undefined;

  for (const item of content) {
    if (!isRecord(item)) continue;
    const type = typeof item.type === "string" ? item.type : "";

    if (type === "content") {
      const text = contentBlockToText(item.content);
      if (text) outputParts.push(text);
      continue;
    }

    if (type === "diff") {
      const filePath = typeof item.path === "string" ? item.path : "file";
      const newText = typeof item.newText === "string" ? item.newText : "";
      const oldText = typeof item.oldText === "string" ? item.oldText : null;

      if (!diffData && newText) {
        diffData = {
          originalContent: oldText,
          newContent: newText,
          filePath,
          isNewFile: oldText === null,
          isBinary: false,
          isTruncated: false,
          totalLines: newText.split("\n").length,
        };
      }

      outputParts.push(`Diff updated: ${filePath}`);
      continue;
    }

    if (type === "terminal") {
      const terminalId = typeof item.terminalId === "string" ? item.terminalId : "terminal";
      outputParts.push(`Terminal output: ${terminalId}`);
      continue;
    }
  }

  return {
    output: outputParts.join("\n").trim(),
    diffData,
  };
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function deriveToolName(update: Record<string, unknown>, currentName?: string): string {
  const title = typeof update.title === "string" ? update.title.trim() : "";
  if (title) return title;

  const kind = typeof update.kind === "string" ? update.kind.trim() : "";
  if (kind) return `tool:${kind}`;

  return currentName || "tool_call";
}

function normalizeTokenCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function pickPermissionOption(options: Record<string, unknown>[], allow: boolean): string | null {
  const preferredKinds = allow
    ? ["allow_once", "allow_always"]
    : ["reject_once", "reject_always"];

  for (const kind of preferredKinds) {
    const match = options.find((option) => option.kind === kind && typeof option.optionId === "string");
    if (match && typeof match.optionId === "string") {
      return match.optionId;
    }
  }

  const fallback = options.find((option) => typeof option.optionId === "string");
  return fallback && typeof fallback.optionId === "string" ? fallback.optionId : null;
}

function extractModeIds(modesState: unknown): { current: string | null; available: string[] } {
  if (!isRecord(modesState)) {
    return { current: null, available: [] };
  }

  const current = typeof modesState.currentModeId === "string" ? modesState.currentModeId : null;
  const available = Array.isArray(modesState.availableModes)
    ? modesState.availableModes
        .map((modeEntry) => (isRecord(modeEntry) && typeof modeEntry.modeId === "string" ? modeEntry.modeId : null))
        .filter((modeId): modeId is string => Boolean(modeId))
    : [];

  return { current, available };
}

function pickModeId(modesState: unknown, mode: Mode): string | null {
  const { current, available } = extractModeIds(modesState);
  if (available.length === 0) return null;

  const configuredMode = mode === "yolo"
    ? process.env.BABY_SWE_ACP_MODE_YOLO
    : process.env.BABY_SWE_ACP_MODE_AGENT;

  const candidates = [
    configuredMode,
    mode === "yolo" ? "agent" : "agent",
    mode === "yolo" ? "code" : "ask",
    "chat",
  ]
    .filter((candidate): candidate is string => Boolean(candidate && candidate.trim()))
    .map((candidate) => candidate.trim().toLowerCase());

  for (const candidate of candidates) {
    const found = available.find((availableModeId) => availableModeId.toLowerCase() === candidate);
    if (found) return found;
  }

  if (current) return current;
  return available[0];
}

function pickModelId(modelsState: unknown, modelConfig: ModelConfig): string | null {
  if (!isRecord(modelsState)) return null;
  const availableModels = Array.isArray(modelsState.availableModels)
    ? modelsState.availableModels.filter(isRecord)
    : [];
  if (availableModels.length === 0) return null;

  const target = modelConfig.name.toLowerCase();
  const byId = availableModels.find((modelEntry) => {
    return typeof modelEntry.modelId === "string" && modelEntry.modelId.toLowerCase() === target;
  });
  if (byId && typeof byId.modelId === "string") return byId.modelId;

  const byName = availableModels.find((modelEntry) => {
    return typeof modelEntry.name === "string" && modelEntry.name.toLowerCase().includes(target);
  });
  if (byName && typeof byName.modelId === "string") return byName.modelId;

  return null;
}

function extractAuthMethods(initResult: unknown): string[] {
  if (!isRecord(initResult)) return [];
  if (!Array.isArray(initResult.authMethods)) return [];
  return initResult.authMethods
    .filter(isRecord)
    .map((method) => (typeof method.id === "string" ? method.id : null))
    .filter((id): id is string => Boolean(id));
}

function pickAuthMethod(initResult: unknown): string | null {
  const authMethods = extractAuthMethods(initResult);
  const configured = (process.env.BABY_SWE_ACP_AUTH_METHOD || ACP_DEFAULT_AUTH_METHOD).trim();
  if (!configured) return null;

  if (authMethods.length === 0) {
    return configured;
  }

  const configuredMatch = authMethods.find((methodId) => methodId === configured);
  if (configuredMatch) return configuredMatch;

  const cursorLogin = authMethods.find((methodId) => methodId === ACP_DEFAULT_AUTH_METHOD);
  if (cursorLogin) return cursorLogin;

  return authMethods[0];
}

export async function runAcpStream(options: RunAcpStreamOptions): Promise<void> {
  const cwd = options.folder || process.cwd();
  const { command, args } = resolveAcpTarget(options.harness);

  const rpc = new NdJsonRpcProcessClient(command, args, cwd);
  const toolStates = new Map<string, ToolState>();
  const toolTimers = new Map<string, number>();
  let acpSessionId: string | null = null;

  const emitToolStart = (toolState: ToolState, approvalRequestId?: string, diffData?: DiffData) => {
    if (toolState.started) return;
    toolState.started = true;
    toolTimers.set(toolState.id, Date.now());

    options.send({
      type: "tool-start",
      sessionId: options.sessionId,
      toolCallId: toolState.id,
      toolName: toolState.name,
      toolArgs: toolState.args,
      approvalRequestId,
      diffData,
    });
  };

  const emitToolEnd = (toolCallId: string, output: string, error?: string) => {
    const toolState = toolStates.get(toolCallId);
    if (!toolState || toolState.ended) return;
    toolState.ended = true;

    const startAt = toolTimers.get(toolCallId) || Date.now();
    toolTimers.delete(toolCallId);
    const elapsedMs = Math.max(0, Date.now() - startAt);

    options.send({
      type: "tool-end",
      sessionId: options.sessionId,
      toolCallId,
      output,
      error,
      elapsedMs,
    });
  };

  const getOrCreateToolState = (update: Record<string, unknown>): ToolState | null => {
    const toolCallId = typeof update.toolCallId === "string" ? update.toolCallId : null;
    if (!toolCallId) return null;

    let toolState = toolStates.get(toolCallId);
    if (!toolState) {
      toolState = {
        id: toolCallId,
        name: deriveToolName(update),
        args: parseToolArgs(update.rawInput),
        started: false,
        ended: false,
      };
      toolStates.set(toolCallId, toolState);
      return toolState;
    }

    toolState.name = deriveToolName(update, toolState.name);
    const parsedArgs = parseToolArgs(update.rawInput);
    if (Object.keys(parsedArgs).length > 0) {
      toolState.args = parsedArgs;
    }
    return toolState;
  };

  const applyToolUpdate = (update: Record<string, unknown>) => {
    const toolState = getOrCreateToolState(update);
    if (!toolState) return;

    const status = typeof update.status === "string" ? update.status : null;
    const { output: contentOutput, diffData } = parseToolContent(update.content);
    const rawOutput = stringifyUnknown(update.rawOutput);
    const outputText = contentOutput || rawOutput || "";

    if (!toolState.started && status && status !== "pending") {
      emitToolStart(toolState, undefined, diffData);
    }

    if (status === "in_progress" && toolState.started && !toolState.ended) {
      options.send({
        type: "tool-status-update",
        sessionId: options.sessionId,
        toolCallId: toolState.id,
        status: "running",
      });
      return;
    }

    if (status === "completed" || status === "failed") {
      if (!toolState.started) {
        emitToolStart(toolState, undefined, diffData);
      }
      emitToolEnd(
        toolState.id,
        outputText,
        status === "failed" ? (outputText || "Tool call failed") : undefined,
      );
    }
  };

  rpc.setNotificationHandler((method, params) => {
    if (method !== "session/update") return;
    if (!isRecord(params)) return;
    if (typeof params.sessionId === "string" && params.sessionId !== acpSessionId && acpSessionId) {
      return;
    }

    const update = isRecord(params.update) ? params.update : null;
    if (!update) return;
    const updateType = typeof update.sessionUpdate === "string" ? update.sessionUpdate : "";

    if (updateType === "agent_message_chunk") {
      const content = isRecord(update.content) ? update.content : null;
      if (content && content.type === "text" && typeof content.text === "string" && content.text.length > 0) {
        options.send({
          type: "token",
          sessionId: options.sessionId,
          token: content.text,
        });
      }
      return;
    }

    if (updateType === "tool_call" || updateType === "tool_call_update") {
      applyToolUpdate(update);
    }
  });

  rpc.setRequestHandler(async (_id, method, params) => {
    if (method !== "session/request_permission") {
      return {};
    }

    if (!isRecord(params)) {
      return { outcome: { outcome: "cancelled" } };
    }

    const toolCall = isRecord(params.toolCall) ? params.toolCall : null;
    if (!toolCall) {
      return { outcome: { outcome: "cancelled" } };
    }

    const toolState = getOrCreateToolState(toolCall);
    if (!toolState) {
      return { outcome: { outcome: "cancelled" } };
    }

    const { diffData } = parseToolContent(toolCall.content);
    const approvalRequestId = uuidv4();

    if (!toolState.started) {
      emitToolStart(toolState, approvalRequestId, diffData);
    } else {
      options.send({
        type: "tool-status-update",
        sessionId: options.sessionId,
        toolCallId: toolState.id,
        status: "pending-approval",
      });
    }

    const permissionOptions = Array.isArray(params.options)
      ? params.options.filter(isRecord)
      : [];

    const decision = options.mode === "yolo"
      ? "auto-approve"
      : await options.requestApproval({
          approvalRequestId,
          toolCallId: toolState.id,
          toolName: toolState.name,
          toolArgs: toolState.args,
        });

    if (options.controller.signal.aborted) {
      return { outcome: { outcome: "cancelled" } };
    }

    if (decision === "approve" || decision === "auto-approve") {
      const allowOptionId = pickPermissionOption(permissionOptions, true);
      if (allowOptionId) {
        options.send({
          type: "tool-status-update",
          sessionId: options.sessionId,
          toolCallId: toolState.id,
          status: "running",
        });
        return {
          outcome: {
            outcome: "selected",
            optionId: allowOptionId,
          },
        };
      }

      return { outcome: { outcome: "cancelled" } };
    }

    const rejectOptionId = pickPermissionOption(permissionOptions, false);
    emitToolEnd(toolState.id, "Tool execution skipped by user", "skipped");
    if (rejectOptionId) {
      return {
        outcome: {
          outcome: "selected",
          optionId: rejectOptionId,
        },
      };
    }
    return { outcome: { outcome: "cancelled" } };
  });

  const onAbort = () => {
    if (!acpSessionId) return;
    rpc.notify("session/cancel", { sessionId: acpSessionId });
  };
  options.controller.signal.addEventListener("abort", onAbort, { once: true });

  try {
    const initResult = await rpc.request("initialize", {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: {
        name: ACP_DEFAULT_CLIENT_NAME,
        version: options.clientVersion,
      },
    });

    if (options.harness === "cursor") {
      const authMethodId = pickAuthMethod(initResult);
      if (authMethodId) {
        const authMethods = extractAuthMethods(initResult);
        try {
          await rpc.request("authenticate", { methodId: authMethodId });
        } catch (error) {
          if (authMethods.length > 0) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`Cursor authentication failed for method "${authMethodId}". Run "agent login" and retry. ${reason}`);
          }
        }
      }
    }

    const newSessionResult = await rpc.request("session/new", {
      cwd,
      mcpServers: [],
    });

    if (!isRecord(newSessionResult) || typeof newSessionResult.sessionId !== "string") {
      throw new Error("[acp] session/new did not return a valid sessionId");
    }

    acpSessionId = newSessionResult.sessionId;

    const modeId = pickModeId(newSessionResult.modes, options.mode);
    if (modeId) {
      try {
        await rpc.request("session/set_mode", {
          sessionId: acpSessionId,
          modeId,
        });
      } catch {
        // Some agents do not support session/set_mode.
      }
    }

    const modelId = pickModelId(newSessionResult.models, options.modelConfig);
    if (modelId) {
      try {
        await rpc.request("session/set_model", {
          sessionId: acpSessionId,
          modelId,
        });
      } catch {
        // Some agents do not support session/set_model.
      }
    }

    const agentMemory = options.folder ? loadAgentMemory(options.folder) : null;
    const promptText = buildAcpPromptText(options.messages, agentMemory);

    const promptResult = await rpc.request("session/prompt", {
      sessionId: acpSessionId,
      prompt: [{ type: "text", text: promptText }],
    });

    if (isRecord(promptResult) && isRecord(promptResult.usage)) {
      const inputTokens = normalizeTokenCount(promptResult.usage.inputTokens);
      const outputTokens = normalizeTokenCount(promptResult.usage.outputTokens);
      if (inputTokens > 0 || outputTokens > 0) {
        options.send({
          type: "token-usage",
          sessionId: options.sessionId,
          inputTokens,
          outputTokens,
        });
      }
    }
  } finally {
    options.controller.signal.removeEventListener("abort", onAbort);
    rpc.close();
  }
}
