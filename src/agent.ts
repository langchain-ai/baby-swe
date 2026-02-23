import { createDeepAgent } from "deepagents";
import { LocalSandboxBackend } from "./backends/local-sandbox";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ipcMain, BrowserWindow } from "electron";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { setMaxListeners } from "events";
import "dotenv/config";
import type { ApprovalDecision, ApprovalResponse, ChatMessage, DiffData, TodoItem, ModelConfig, ApiKeys, Mode, GithubPR, Project } from "./types";
import { loadAgentMemory } from "./memory/agents";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { tavily } from "@tavily/core";
import TurndownService from "turndown";
import { loadSettings } from "./storage";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildSystemPrompt } from "./prompts";
import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";

const sessionControllers = new Map<string, AbortController>();
const sessionModes = new Map<string, Mode>();
const pendingApprovals = new Map<string, { resolve: (decision: ApprovalDecision) => void }>();

const TOOLS_REQUIRING_APPROVAL = ['execute', 'write_file', 'edit_file', 'web_search', 'task'];

const MAX_DIFF_LINES = 800;
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
]);

const MAX_OUTPUT_SIZE = 100 * 1024;

const webSearchTool = tool(
  async ({ query }: { query: string }) => {
    const settings = loadSettings();
    const apiKey = settings.apiKeys?.tavily || process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return JSON.stringify({ results: [], error: 'Tavily API key not set. Use /keys command to configure.' });
    }
    try {
      const client = tavily({ apiKey });
      const response = await client.search(query, { maxResults: 5 });
      return JSON.stringify({
        results: response.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        })),
      });
    } catch (err) {
      return JSON.stringify({ results: [], error: `Web search failed: ${(err as Error).message}` });
    }
  },
  {
    name: "web_search",
    description: "Search the web using Tavily API. Returns top 5 search results with title, URL, and content snippet.",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  }
);

const fetchUrlTool = tool(
  async ({ url }: { url: string }) => {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BabySWE/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        return JSON.stringify({ content: '', error: `HTTP ${response.status}: ${response.statusText}` });
      }
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      if (contentType.includes('text/html')) {
        const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
        const markdown = turndown.turndown(text);
        const truncated = markdown.length > MAX_OUTPUT_SIZE
          ? markdown.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Content truncated due to size limit]'
          : markdown;
        return JSON.stringify({ content: truncated });
      }
      const truncated = text.length > MAX_OUTPUT_SIZE
        ? text.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Content truncated due to size limit]'
        : text;
      return JSON.stringify({ content: truncated });
    } catch (err) {
      return JSON.stringify({ content: '', error: `Fetch failed: ${(err as Error).message}` });
    }
  },
  {
    name: "fetch_url",
    description: "Fetch a URL and return its content. HTML pages are converted to Markdown.",
    schema: z.object({
      url: z.string().describe("The URL to fetch"),
    }),
  }
);

const httpRequestTool = tool(
  async ({ method, url, headers, body }: { method: string; url: string; headers?: Record<string, string>; body?: string }) => {
    try {
      const response = await fetch(url, {
        method: method.toUpperCase(),
        headers: headers || {},
        body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
        signal: AbortSignal.timeout(30_000),
      });
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      let responseBody = await response.text();
      if (responseBody.length > MAX_OUTPUT_SIZE) {
        responseBody = responseBody.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Response truncated due to size limit]';
      }
      return JSON.stringify({ status: response.status, headers: responseHeaders, body: responseBody });
    } catch (err) {
      return JSON.stringify({ status: 0, headers: {}, body: '', error: `HTTP request failed: ${(err as Error).message}` });
    }
  },
  {
    name: "http_request",
    description: "Make an HTTP request. Supports GET, POST, PUT, DELETE methods with custom headers and body.",
    schema: z.object({
      method: z.string().describe("HTTP method (GET, POST, PUT, DELETE)"),
      url: z.string().describe("The URL to request"),
      headers: z.record(z.string(), z.string()).optional().describe("Optional HTTP headers"),
      body: z.string().optional().describe("Optional request body for POST/PUT"),
    }),
  }
);

const webTools = [webSearchTool, fetchUrlTool, httpRequestTool];

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function computeDiffData(
  toolName: string,
  toolArgs: Record<string, unknown>,
  rootDir: string
): DiffData | undefined {
  if (toolName !== 'edit_file' && toolName !== 'write_file') {
    return undefined;
  }

  const filePath = (toolArgs.filePath as string) || (toolArgs.file_path as string) || (toolArgs.path as string) || '';
  if (!filePath) return undefined;

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(rootDir, filePath);

  if (isBinaryFile(absolutePath)) {
    return {
      originalContent: null,
      newContent: '',
      filePath,
      isNewFile: false,
      isBinary: true,
      isTruncated: false,
      totalLines: 0,
    };
  }

  let originalContent: string | null = null;
  let isNewFile = false;

  try {
    originalContent = fs.readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      isNewFile = true;
    } else {
      return {
        originalContent: null,
        newContent: '',
        filePath,
        isNewFile: false,
        isBinary: true,
        isTruncated: false,
        totalLines: 0,
      };
    }
  }

  let newContent: string;

  if (toolName === 'write_file') {
    newContent = (toolArgs.content as string) || '';
  } else {
    const oldString = (toolArgs.oldString as string) || (toolArgs.old_string as string) || '';
    const newString = (toolArgs.newString as string) || (toolArgs.new_string as string) || '';

    if (isNewFile) {
      newContent = newString;
    } else {
      newContent = originalContent!.replace(oldString, newString);
    }
  }

  const totalLines = newContent.split('\n').length;
  const isTruncated = totalLines > MAX_DIFF_LINES;

  return {
    originalContent: isNewFile ? null : originalContent,
    newContent,
    filePath,
    isNewFile,
    isBinary: false,
    isTruncated,
    totalLines,
  };
}

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
      openAIApiKey: openaiApiKey,
      streaming: true,
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
        openaiConfig.modelKwargs = {
          reasoning_effort: reasoningEffort,
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

// Middleware that catches tool call errors (e.g. schema validation failures) and
// converts them into ToolMessages so the agent can self-correct instead of crashing.
const toolErrorRecoveryMiddleware = createMiddleware({
  name: "toolErrorRecoveryMiddleware",
  wrapToolCall: async (request, next) => {
    try {
      return await next(request);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return new ToolMessage({
        content: `Error invoking tool '${request.toolCall.name}' with kwargs ${JSON.stringify(request.toolCall.args)} with error: ${errorMessage} Please fix your mistakes.`,
        tool_call_id: request.toolCall.id ?? "",
        name: request.toolCall.name,
        additional_kwargs: { tool_error: true },
      });
    }
  },
});

function createAgent(rootDir?: string, modelConfig?: ModelConfig, apiKeys?: ApiKeys, githubPR?: GithubPR | null) {
  const modelCfg = modelConfig || { name: 'claude-sonnet-4-6', provider: 'anthropic', effort: 'default' };
  const model = createModel(modelCfg, apiKeys);
  const agentMemory = rootDir ? loadAgentMemory(rootDir) || undefined : undefined;
  const systemPrompt = buildSystemPrompt(rootDir, agentMemory, githubPR);

  const config: Parameters<typeof createDeepAgent>[0] = {
    model,
    systemPrompt,
    tools: rootDir ? [] : webTools,
    middleware: [toolErrorRecoveryMiddleware as any],
  };

  if (rootDir) {
    config!.backend = () => new LocalSandboxBackend({ rootDir });
  }

  return createDeepAgent(config);
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


function safeSend(webContents: Electron.WebContents, channel: string, ...args: unknown[]): void {
  try {
    if (!webContents.isDestroyed()) {
      webContents.send(channel, ...args);
    }
  } catch {
    // Window destroyed or IPC unavailable
  }
}

export function setupAgentIPC(mainWindow: BrowserWindow, getTileProject: (tileId: string) => string | null, getTileProjectData?: (tileId: string) => Project | null) {
  ipcMain.handle("agent:invoke", async (_event, userMessage: string): Promise<AgentResponse> => {
    try {
      const settings = loadSettings();
      const agent = createAgent(undefined, undefined, settings.apiKeys);
      const result = await agent.invoke(
        { messages: [{ role: "user", content: userMessage }] },
        { recursionLimit: 10000 }
      );

      const lastMessage = result.messages[result.messages.length - 1];
      const content = typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      return { content };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Agent error: ${errorMessage}`);
    }
  });

  ipcMain.on("agent:set-mode", (_event, sessionId: string, mode: Mode) => {
    sessionModes.set(sessionId, mode);
  });

  ipcMain.on("agent:stream", async (_event, sessionId: string, tileId: string, messages: ChatMessage[], modelConfig: ModelConfig, mode: Mode) => {
    const existing = sessionControllers.get(sessionId);
    if (existing) {
      existing.abort();
    }

    const controller = new AbortController();
    setMaxListeners(50, controller.signal);
    sessionControllers.set(sessionId, controller);
    sessionModes.set(sessionId, mode);

    const toolTimers = new Map<string, number>();
    let sentFinalEvent = false;

    const send = (data: Record<string, unknown>) => {
      safeSend(mainWindow.webContents, 'agent:stream-event', data);
    };

    const sendFinal = (data: Record<string, unknown>) => {
      if (sentFinalEvent) return;
      sentFinalEvent = true;
      send(data);
    };

    try {
      const folder = getTileProject(tileId);
      const projectData = getTileProjectData ? getTileProjectData(tileId) : null;
      const settings = loadSettings();
      const apiKeys = settings.apiKeys;
      const streamAgent = createAgent(folder || undefined, modelConfig, apiKeys, projectData?.githubPR);

      console.log(`[agent:stream] Starting stream for session ${sessionId}, tile: ${tileId}, folder: ${folder}, model: ${modelConfig.name}, effort: ${modelConfig.effort}, messages: ${messages.length}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = await streamAgent.streamEvents(
        { messages: messages as any },
        { version: "v2", signal: controller.signal, recursionLimit: 10000, configurable: { rootDir: folder } }
      );

      for await (const event of stream) {
        if (controller.signal.aborted) break;

        if (event.event === "on_chat_model_stream") {
          const chunk = event.data?.chunk;
          if (chunk?.content) {
            let token = '';
            if (typeof chunk.content === 'string') {
              token = chunk.content;
            } else if (Array.isArray(chunk.content)) {
              for (const block of chunk.content) {
                if (block.type === 'text' && block.text) {
                  token += block.text;
                }
              }
            }

            if (token) {
              send({ type: 'token', sessionId, token });
            }
          }
        }

        if (event.event === "on_chat_model_end") {
          const message = event.data?.output;
          if (message?.usage_metadata) {
            const { input_tokens, output_tokens } = message.usage_metadata;
            send({
              type: 'token-usage',
              sessionId,
              inputTokens: input_tokens || 0,
              outputTokens: output_tokens || 0,
            });
          }
        }

        if (event.event === "on_tool_start") {
          const toolCallId = event.run_id;
          const toolName = event.name;
          let toolArgs = event.data?.input || {};

          if (toolArgs.input && typeof toolArgs.input === 'string') {
            try {
              toolArgs = JSON.parse(toolArgs.input);
            } catch {
              // Keep original if parsing fails
            }
          }

          toolTimers.set(toolCallId, Date.now());

          const currentMode = sessionModes.get(sessionId) || mode;
          const requiresApproval = TOOLS_REQUIRING_APPROVAL.includes(toolName) && currentMode !== 'yolo';
          const approvalRequestId = requiresApproval ? uuidv4() : undefined;

          let diffData: DiffData | undefined;
          if (folder && (toolName === 'edit_file' || toolName === 'write_file')) {
            diffData = computeDiffData(toolName, toolArgs, folder);
          }

          send({
            type: 'tool-start',
            sessionId,
            toolCallId,
            toolName,
            toolArgs,
            approvalRequestId,
            diffData,
          });

          if (toolName === 'write_todos' && toolArgs.todos) {
            send({
              type: 'todo-update',
              sessionId,
              todos: toolArgs.todos as TodoItem[],
            });
          }

          if (requiresApproval && approvalRequestId) {
            const decision = await new Promise<ApprovalDecision>((resolve) => {
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
            });

            if (decision === 'reject') {
              send({
                type: 'tool-end',
                sessionId,
                toolCallId,
                output: 'Tool execution skipped by user',
                error: 'skipped',
                elapsedMs: 0,
              });
              sendFinal({ type: 'done', sessionId });
              controller.abort();
              return;
            }

            send({
              type: 'tool-status-update',
              sessionId,
              toolCallId,
              status: 'running',
            });
          }
        }

        if (event.event === "on_tool_end") {
          const toolCallId = event.run_id;
          const startTime = toolTimers.get(toolCallId) || Date.now();
          const elapsedMs = Date.now() - startTime;
          toolTimers.delete(toolCallId);

          const output = event.data?.output;
          let outputStr = '';
          let errorStr: string | undefined;

          if (typeof output === 'string') {
            outputStr = output;
            if (outputStr.startsWith('Error ')) {
              errorStr = outputStr;
            }
          } else if (output && typeof output === 'object') {
            const isToolError =
              output.kwargs?.additional_kwargs?.tool_error === true ||
              output.additional_kwargs?.tool_error === true ||
              output.kwargs?.status === 'error' ||
              output.status === 'error';
            if (output.kwargs?.content) {
              outputStr = String(output.kwargs.content);
            } else if (output.content) {
              outputStr = String(output.content);
            } else if ('output' in output) {
              outputStr = String(output.output);
            } else if ('error' in output) {
              errorStr = String(output.error);
              outputStr = errorStr;
            } else {
              outputStr = JSON.stringify(output, null, 2);
            }
            if (isToolError || outputStr.startsWith('Error ')) {
              errorStr = outputStr;
            }
          }

          send({
            type: 'tool-end',
            sessionId,
            toolCallId,
            output: outputStr,
            error: errorStr,
            elapsedMs,
          });
        }
      }

      if (!controller.signal.aborted) {
        console.log(`[agent:stream] Stream completed for session ${sessionId}`);
        sendFinal({ type: 'done', sessionId });
      }
    } catch (error) {
      console.error(`[agent:stream] Error for session ${sessionId}:`, error);
      sendFinal({ type: 'error', sessionId, error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      if (!controller.signal.aborted) {
        sendFinal({ type: 'done', sessionId });
      }
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
}
