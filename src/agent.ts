import { app, ipcMain, BrowserWindow } from "electron";
import { v4 as uuidv4 } from "uuid";
import { setMaxListeners } from "events";
import "dotenv/config";
import type { AgentHarness, ApprovalDecision, ApprovalResponse, ChatMessage, GlobalSettings, ModelConfig, Mode, Project, StreamEvent } from "./types";
import { loadSettings } from "./storage";
import { getCursorAuthStatus, runAcpStream, runCursorLogout, startCursorLogin } from "./acp-client";

const sessionControllers = new Map<string, AbortController>();
const sessionModes = new Map<string, Mode>();
const pendingApprovals = new Map<string, { resolve: (decision: ApprovalDecision) => void }>();

function extractAcpEnvOverrides(settings: GlobalSettings): Record<string, string> | undefined {
  const apiKeys = settings.apiKeys;
  if (!apiKeys) return undefined;

  const overrides: Record<string, string> = {};
  if (apiKeys.anthropic) overrides.ANTHROPIC_API_KEY = apiKeys.anthropic;
  if (apiKeys.openai) overrides.OPENAI_API_KEY = apiKeys.openai;
  if (apiKeys.baseten) overrides.BASETEN_API_KEY = apiKeys.baseten;
  if (apiKeys.tavily) overrides.TAVILY_API_KEY = apiKeys.tavily;

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function resolveAcpRuntimeConfig(): { harness: AgentHarness; envOverrides?: Record<string, string> } {
  const settings = loadSettings();
  return {
    harness: settings.harness === "deepagents" ? "deepagents" : "cursor",
    envOverrides: extractAcpEnvOverrides(settings),
  };
}

export interface AgentResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    output?: string;
    error?: string;
  }>;
}

const SUMMARIZATION_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Include full code snippets where applicable and include a summary of why each file read or edit is important.
4. Errors and fixes: List all errors encountered and how they were fixed. Pay special attention to specific user feedback.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
7. Pending Tasks: Outline any pending tasks that have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request. Include file names and code snippets where applicable.
9. Optional Next Step: List the next step related to the most recent work. Ensure this step is DIRECTLY in line with the user's most recent explicit requests.`;

function flattenMessageContent(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const chunks: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      chunks.push(block.text);
    } else if (block.type === "image_url") {
      chunks.push("[Image attachment]");
    }
  }
  return chunks.join("\n");
}

async function runCompactionViaAcp(
  harness: AgentHarness,
  messages: ChatMessage[],
  modelConfig: { name: string; provider: string; effort: string },
  envOverrides?: Record<string, string>,
): Promise<{ summary: string; keptMessages: ChatMessage[] } | null> {
  // Keep the last 10% of messages (minimum 2)
  const keepCount = Math.max(2, Math.floor(messages.length * 0.10));
  const messagesToSummarize = messages.slice(0, messages.length - keepCount);
  const keptMessages = messages.slice(messages.length - keepCount);
  if (messagesToSummarize.length === 0) return null;

  const conversationText = messagesToSummarize
    .map((message) => {
      const role = message.role === "user" ? "User" : "Assistant";
      return `${role}: ${flattenMessageContent(message.content)}`;
    })
    .join("\n\n");

  const compactionPrompt = `${SUMMARIZATION_PROMPT}

Important constraints:
- Do not call tools.
- Output only the final summary.

Here is the conversation to summarize:

${conversationText}`;

  let summary = "";
  const controller = new AbortController();

  try {
    await runAcpStream({
      harness,
      sessionId: `compact-${uuidv4()}`,
      messages: [{ role: "user", content: compactionPrompt }],
      mode: "agent",
      modelConfig,
      folder: null,
      controller,
      clientVersion: app.getVersion(),
      envOverrides,
      send: (event) => {
        if (event.type === "token" && typeof event.token === "string") {
          summary += event.token;
        }
      },
      requestApproval: async () => "reject",
    });
  } catch (error) {
    console.error("[compact] ACP compaction failed:", error);
    return null;
  }

  const trimmed = summary.trim();
  if (!trimmed) return null;
  return { summary: trimmed, keptMessages };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;
  const msg = error instanceof Error ? error.message : String(error);
  return msg.toLowerCase().includes('aborted') || msg.includes('AbortError');
}

function safeSend(webContents: Electron.WebContents, channel: string, ...args: unknown[]): void {
  try {
    if (!webContents.isDestroyed()) {
      webContents.send(channel, ...args);
    }
  } catch {
    // Window destroyed or IPC unavailable
  }
}

export function setupAgentIPC(_mainWindow: BrowserWindow, getTileProject: (tileId: string) => string | null, _getTileProjectData?: (tileId: string) => Project | null) {
  ipcMain.handle("agent:cursorAuthStatus", async () => {
    return getCursorAuthStatus();
  });

  ipcMain.handle("agent:cursorLogin", async () => {
    return startCursorLogin();
  });

  ipcMain.handle("agent:cursorLogout", async () => {
    return runCursorLogout();
  });

  ipcMain.handle("agent:invoke", async (_event, userMessage: string): Promise<AgentResponse> => {
    const controller = new AbortController();
    const invokeSessionId = `invoke-${uuidv4()}`;
    const settings = loadSettings();
    const harness = settings.harness === "deepagents" ? "deepagents" : "cursor";
    const envOverrides = extractAcpEnvOverrides(settings);
    const modelConfig = settings.modelConfig || { name: "acp-default", provider: "acp-cursor", effort: "default" };
    let content = "";

    try {
      await runAcpStream({
        harness,
        sessionId: invokeSessionId,
        messages: [{ role: "user", content: userMessage }],
        mode: "yolo",
        modelConfig,
        folder: process.cwd(),
        controller,
        clientVersion: app.getVersion(),
        envOverrides,
        send: (streamEvent) => {
          if (streamEvent.type === "token" && typeof streamEvent.token === "string") {
            content += streamEvent.token;
          }
        },
        requestApproval: async () => "auto-approve",
      });

      return { content };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Agent error: ${errorMessage}`);
    }
  });

  ipcMain.on("agent:set-mode", (_event, sessionId: string, mode: Mode) => {
    sessionModes.set(sessionId, mode);
  });

  ipcMain.on("agent:stream", async (event, sessionId: string, tileId: string, messages: ChatMessage[], modelConfig: ModelConfig, mode: Mode) => {
    const existing = sessionControllers.get(sessionId);
    if (existing) {
      existing.abort();
    }

    const controller = new AbortController();
    setMaxListeners(50, controller.signal);
    sessionControllers.set(sessionId, controller);
    sessionModes.set(sessionId, mode);

    let sentFinalEvent = false;

    const send = (data: Record<string, unknown>) => {
      safeSend(event.sender, 'agent:stream-event', data);
    };

    const sendFinal = (data: Record<string, unknown>) => {
      if (sentFinalEvent) return;
      sentFinalEvent = true;
      send(data);
    };

    try {
      const folder = getTileProject(tileId);
      const runtimeConfig = resolveAcpRuntimeConfig();
      await runAcpStream({
        harness: runtimeConfig.harness,
        sessionId,
        messages,
        mode: sessionModes.get(sessionId) || mode,
        modelConfig,
        folder,
        controller,
        clientVersion: app.getVersion(),
        envOverrides: runtimeConfig.envOverrides,
        send,
        requestApproval: ({ approvalRequestId }) => new Promise<ApprovalDecision>((resolve) => {
          pendingApprovals.set(approvalRequestId, { resolve });
          const onAbort = () => {
            resolve('reject');
            pendingApprovals.delete(approvalRequestId);
          };
          if (controller.signal.aborted) {
            onAbort();
          } else {
            controller.signal.addEventListener('abort', onAbort, { once: true });
          }
        }),
      });

      if (!controller.signal.aborted) {
        console.log(`[agent:stream] ACP stream completed for session ${sessionId}`);
        sendFinal({ type: 'done', sessionId });
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        sendFinal({ type: 'done', sessionId });
      } else {
        console.error(`[agent:stream] Error for session ${sessionId}:`, error);
        sendFinal({ type: 'error', sessionId, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    } finally {
      sendFinal({ type: 'done', sessionId });
      if (sessionControllers.get(sessionId) === controller) {
        sessionControllers.delete(sessionId);
      }
      sessionModes.delete(sessionId);
    }
  });

  ipcMain.on("agent:cancel", (_event, sessionId: string) => {
    const controller = sessionControllers.get(sessionId);
    if (controller) {
      controller.abort();
      sessionControllers.delete(sessionId);
    }
  });

  ipcMain.on("agent:approval-response", (_event, response: ApprovalResponse) => {
    const pending = pendingApprovals.get(response.requestId);
    if (pending) {
      pending.resolve(response.decision);
      pendingApprovals.delete(response.requestId);
    }
  });

  ipcMain.on("agent:compact", async (event, sessionId: string, messages: ChatMessage[], modelConfig: ModelConfig) => {
    const webContents = event.sender;
    const send = (streamEvent: StreamEvent) => safeSend(webContents, 'agent:stream-event', streamEvent);

    if (messages.length <= 4) {
      send({ type: 'compact-end', sessionId });
      return;
    }

    send({ type: 'compact-start', sessionId });

    const runtimeConfig = resolveAcpRuntimeConfig();
    const result = await runCompactionViaAcp(runtimeConfig.harness, messages, modelConfig, runtimeConfig.envOverrides);
    if (result) {
      console.log(`[agent:compact] Manual compact for session ${sessionId}, summarized ${messages.length - result.keptMessages.length} messages`);
      send({
        type: 'compact',
        sessionId,
        summary: result.summary,
        keptMessages: result.keptMessages,
      });
    } else {
      console.log(`[agent:compact] Manual compact failed or skipped for session ${sessionId}`);
      send({ type: 'compact-end', sessionId });
    }
  });
}
