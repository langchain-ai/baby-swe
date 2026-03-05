import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { app, ipcMain, BrowserWindow } from "electron";
import { v4 as uuidv4 } from "uuid";
import { setMaxListeners } from "events";
import "dotenv/config";
import type { ApprovalDecision, ApprovalResponse, ChatMessage, ModelConfig, ApiKeys, Mode, Project, StreamEvent } from "./types";
import { loadSettings } from "./storage";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { runCursorAcpStream } from "./acp-client";

const sessionControllers = new Map<string, AbortController>();
const sessionModes = new Map<string, Mode>();
const pendingApprovals = new Map<string, { resolve: (decision: ApprovalDecision) => void }>();

function createModel(modelConfig: ModelConfig, apiKeys?: ApiKeys): BaseChatModel {
  const { name, effort } = modelConfig;

  if (name === 'kimi-k2.5') {
    const basetenApiKey = apiKeys?.baseten || process.env.BASETEN_API_KEY;
    return new ChatOpenAI({
      model: 'moonshotai/Kimi-K2.5',
      streaming: true,
      configuration: {
        apiKey: basetenApiKey,
        baseURL: 'https://inference.baseten.co/v1',
      },
    });
  }

  if (name.startsWith('gpt-')) {
    const openaiApiKey = apiKeys?.openai || process.env.OPENAI_API_KEY;
    const openaiConfig: ConstructorParameters<typeof ChatOpenAI>[0] = {
      model: name,
      apiKey: openaiApiKey,
      streaming: true,
      useResponsesApi: true,
    };

    if (effort && effort !== 'default') {
      const effortMap: Record<string, string> = {
        'low': 'low',
        'medium': 'medium',
        'medium-fast': 'medium',
        'high': 'high',
        'high-fast': 'high',
        'extra-high': 'xhigh',
      };
      const reasoningEffort = effortMap[effort];
      if (reasoningEffort) {
        openaiConfig.reasoning = {
          effort: reasoningEffort as "low" | "medium" | "high",
        };
      }
    }

    return new ChatOpenAI(openaiConfig);
  }

  const anthropicApiKey = apiKeys?.anthropic || process.env.ANTHROPIC_API_KEY;
  return new ChatAnthropic({
    model: name,
    anthropicApiKey: anthropicApiKey,
    streaming: true,
  });
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

async function runCompaction(
  messages: ChatMessage[],
  modelConfig: ModelConfig,
  apiKeys?: ApiKeys,
): Promise<{ summary: string; keptMessages: ChatMessage[] } | null> {
  try {
    const model = createModel(modelConfig, apiKeys);

    // Keep the last 10% of messages (minimum 2)
    const keepCount = Math.max(2, Math.floor(messages.length * 0.10));
    const messagesToSummarize = messages.slice(0, messages.length - keepCount);
    const keptMessages = messages.slice(messages.length - keepCount);

    if (messagesToSummarize.length === 0) return null;

    // Build conversation text for summarization
    const conversationText = messagesToSummarize.map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${role}: ${content}`;
    }).join('\n\n');

    const result = await model.invoke([
      { role: 'system', content: SUMMARIZATION_PROMPT },
      { role: 'user', content: `Here is the conversation to summarize:\n\n${conversationText}` },
    ]);

    const summary = typeof result.content === 'string'
      ? result.content
      : Array.isArray(result.content)
        ? result.content.map((b: { type: string; text?: string }) => b.type === 'text' ? b.text || '' : '').join('')
        : String(result.content);

    return { summary, keptMessages };
  } catch (err) {
    console.error('[compact] Summarization failed:', err);
    return null;
  }
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
  ipcMain.handle("agent:invoke", async (_event, userMessage: string): Promise<AgentResponse> => {
    const controller = new AbortController();
    const invokeSessionId = `invoke-${uuidv4()}`;
    const settings = loadSettings();
    const modelConfig = settings.modelConfig || { name: "acp-default", provider: "acp-cursor", effort: "default" };
    let content = "";

    try {
      await runCursorAcpStream({
        sessionId: invokeSessionId,
        messages: [{ role: "user", content: userMessage }],
        mode: "yolo",
        modelConfig,
        folder: process.cwd(),
        controller,
        clientVersion: app.getVersion(),
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
      await runCursorAcpStream({
        sessionId,
        messages,
        mode: sessionModes.get(sessionId) || mode,
        modelConfig,
        folder,
        controller,
        clientVersion: app.getVersion(),
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

    const settings = loadSettings();
    const result = await runCompaction(messages, modelConfig, settings.apiKeys);
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
