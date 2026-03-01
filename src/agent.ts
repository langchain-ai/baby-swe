import { createDeepAgent, LocalShellBackend } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { app, ipcMain, BrowserWindow } from "electron";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { setMaxListeners } from "events";
import "dotenv/config";
import type { ApprovalDecision, ApprovalResponse, ChatMessage, DiffData, TodoItem, ModelConfig, ApiKeys, Mode, GithubPR, Project, StreamEvent } from "./types";
import { loadAgentMemory } from "./memory/agents";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { tavily } from "@tavily/core";
import TurndownService from "turndown";
import { loadSettings } from "./storage";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildSystemPrompt } from "./prompts";
import { getContextLimit, COMPACT_THRESHOLD } from "./context-limits";
import { Command, MemorySaver } from "@langchain/langgraph";

const sessionControllers = new Map<string, AbortController>();
const sessionModes = new Map<string, Mode>();
const pendingApprovals = new Map<string, { resolve: (decision: ApprovalDecision) => void }>();

const TOOLS_REQUIRING_APPROVAL = ['execute', 'write_file', 'edit_file', 'web_search'];

type InterruptActionRequest = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

type InterruptPayload = {
  actionRequests: InterruptActionRequest[];
};

function getInterruptPayload(candidate: unknown): InterruptPayload | null {
  if (!candidate || typeof candidate !== 'object') return null;

  const direct = candidate as { actionRequests?: unknown };
  if (Array.isArray(direct.actionRequests)) {
    return { actionRequests: direct.actionRequests as InterruptActionRequest[] };
  }

  const withInterrupts = candidate as { __interrupt__?: Array<{ value?: unknown }> };
  if (Array.isArray(withInterrupts.__interrupt__) && withInterrupts.__interrupt__.length > 0) {
    const value = withInterrupts.__interrupt__[0]?.value;
    if (value && typeof value === 'object' && Array.isArray((value as { actionRequests?: unknown }).actionRequests)) {
      return { actionRequests: (value as { actionRequests: InterruptActionRequest[] }).actionRequests };
    }
  }

  return null;
}

const MAX_TOOL_ERROR_RETRIES = 3;

const MAX_DIFF_LINES = 800;
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
]);

const MAX_OUTPUT_SIZE = 100 * 1024;

// Large tool result eviction constants
const NUM_CHARS_PER_TOKEN = 4;
const EVICTION_TOKEN_LIMIT = 20_000;
const EVICTION_CHAR_THRESHOLD = NUM_CHARS_PER_TOKEN * EVICTION_TOKEN_LIMIT; // ~80K chars
const EVICTION_DIR = 'large_tool_results';
const EVICTION_HEAD_LINES = 5;
const EVICTION_TAIL_LINES = 5;
const EVICTION_MAX_LINE_LENGTH = 1000;

const TOO_LARGE_TOOL_MSG = `Tool result too large, the result of this tool call {tool_call_id} was saved in the filesystem at this path: {file_path}
You can read the result from the filesystem by using the read_file tool, but make sure to only read part of the result at a time.
You can do this by specifying an offset and limit in the read_file tool call.
For example, to read the first 100 lines, you can use the read_file tool with offset=0 and limit=100.

Here is a preview showing the head and tail of the result (lines of the form
... [N lines truncated] ...
indicate omitted lines in the middle of the content):

{content_sample}
`;

function formatContentWithLineNumbers(lines: string[], startLine: number): string {
  return lines.map((line, i) => {
    const lineNum = startLine + i;
    return `${String(lineNum).padStart(6, ' ')}\t${line}`;
  }).join('\n');
}

function createContentPreview(content: string): string {
  const lines = content.split('\n');
  const headLines = EVICTION_HEAD_LINES;
  const tailLines = EVICTION_TAIL_LINES;

  if (lines.length <= headLines + tailLines) {
    const preview = lines.map(l => l.slice(0, EVICTION_MAX_LINE_LENGTH));
    return formatContentWithLineNumbers(preview, 1);
  }

  const head = lines.slice(0, headLines).map(l => l.slice(0, EVICTION_MAX_LINE_LENGTH));
  const tail = lines.slice(-tailLines).map(l => l.slice(0, EVICTION_MAX_LINE_LENGTH));

  const headSample = formatContentWithLineNumbers(head, 1);
  const truncationNotice = `\n... [${lines.length - headLines - tailLines} lines truncated] ...\n`;
  const tailSample = formatContentWithLineNumbers(tail, lines.length - tailLines + 1);

  return headSample + truncationNotice + tailSample;
}

/**
 * If a tool result exceeds the eviction threshold, write the full output to a file
 * and return a head/tail preview with a file path reference. The agent can then use
 * read_file with offset/limit to read the full output in chunks.
 *
 * Files are stored in the app's global data directory (not the project root).
 */
function evictLargeToolResult(output: string, _toolName: string, toolCallId: string): string {
  if (output.length <= EVICTION_CHAR_THRESHOLD) return output;

  // Sanitize tool call ID to prevent path traversal
  const sanitizedId = toolCallId.replace(/[./\\]/g, '_');
  const evictionDir = path.join(app.getPath('userData'), EVICTION_DIR);
  const absPath = path.join(evictionDir, sanitizedId);

  try {
    fs.mkdirSync(evictionDir, { recursive: true });
    fs.writeFileSync(absPath, output, 'utf-8');
  } catch (err) {
    console.error('[evict] Failed to write large tool result:', err);
    return output;
  }

  const contentSample = createContentPreview(output);
  return TOO_LARGE_TOOL_MSG
    .replace('{tool_call_id}', toolCallId)
    .replace('{file_path}', absPath)
    .replace('{content_sample}', contentSample);
}

function createWebTools() {
  const maybeEvict = (output: string, toolName: string, toolCallId: string): string => {
    return evictLargeToolResult(output, toolName, toolCallId);
  };

  const webSearchTool = tool(
    async ({ query }: { query: string }, runManager) => {
      const settings = loadSettings();
      const apiKey = settings.apiKeys?.tavily || process.env.TAVILY_API_KEY;
      if (!apiKey) {
        return JSON.stringify({ results: [], error: 'Tavily API key not set. Use /keys command to configure.' });
      }
      try {
        const client = tavily({ apiKey });
        const response = await client.search(query, { maxResults: 5 });
        const result = JSON.stringify({
          results: response.results.map((r) => ({
            title: r.title,
            url: r.url,
            content: r.content,
          })),
        });
        return maybeEvict(result, 'web_search', runManager?.runId || 'web_search');
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
    async ({ url }: { url: string }, runManager) => {
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
        let result: string;
        if (contentType.includes('text/html')) {
          const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
          const markdown = turndown.turndown(text);
          const truncated = markdown.length > MAX_OUTPUT_SIZE
            ? markdown.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Content truncated due to size limit]'
            : markdown;
          result = JSON.stringify({ content: truncated });
        } else {
          const truncated = text.length > MAX_OUTPUT_SIZE
            ? text.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Content truncated due to size limit]'
            : text;
          result = JSON.stringify({ content: truncated });
        }
        return maybeEvict(result, 'fetch_url', runManager?.runId || 'fetch_url');
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
    async ({ method, url, headers, body }: { method: string; url: string; headers?: Record<string, string>; body?: string }, runManager) => {
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
        const result = JSON.stringify({ status: response.status, headers: responseHeaders, body: responseBody });
        return maybeEvict(result, 'http_request', runManager?.runId || 'http_request');
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

  return [webSearchTool, fetchUrlTool, httpRequestTool];
}

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
    const replaceAll = Boolean(toolArgs.replaceAll ?? toolArgs.replace_all);

    if (isNewFile) {
      newContent = newString;
    } else if (replaceAll && oldString.length > 0) {
      newContent = originalContent!.split(oldString).join(newString);
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

async function createAgent(rootDir?: string, modelConfig?: ModelConfig, apiKeys?: ApiKeys, githubPR?: GithubPR | null, mode: Mode = 'agent') {
  const modelCfg = modelConfig || { name: 'claude-sonnet-4-6', provider: 'anthropic', effort: 'default' };
  const model = createModel(modelCfg, apiKeys);
  const agentMemory = rootDir ? loadAgentMemory(rootDir) || undefined : undefined;
  const systemPrompt = buildSystemPrompt(rootDir, agentMemory, githubPR);
  const webTools = createWebTools();

  const backend = rootDir
    ? await LocalShellBackend.create({
        rootDir,
        inheritEnv: true,
        timeout: 120,
        maxOutputBytes: 100_000,
      })
    : undefined;

  return createDeepAgent({
    model: model as any,
    tools: webTools as any,
    systemPrompt,
    backend,
    interruptOn: mode === 'yolo'
      ? undefined
      : Object.fromEntries(TOOLS_REQUIRING_APPROVAL.map((toolName) => [toolName, true])),
    checkpointer: new MemorySaver(),
    name: 'baby-swe',
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

function isToolValidationError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('did not match expected schema') ||
    msg.includes('ToolInputParsingException') ||
    msg.includes('ToolInvocationError');
}

function isPromptTooLongError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('prompt is too long') ||
    msg.includes('context_length_exceeded') ||
    msg.includes('maximum context length');
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

export function setupAgentIPC(mainWindow: BrowserWindow, getTileProject: (tileId: string) => string | null, getTileProjectData?: (tileId: string) => Project | null) {
  ipcMain.handle("agent:invoke", async (_event, userMessage: string): Promise<AgentResponse> => {
    try {
      const settings = loadSettings();
      const agent = await createAgent(undefined, undefined, settings.apiKeys, null, 'yolo');
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

  ipcMain.on("agent:stream", async (event, sessionId: string, tileId: string, messages: ChatMessage[], modelConfig: ModelConfig, mode: Mode) => {
    const existing = sessionControllers.get(sessionId);
    if (existing) {
      existing.abort();
    }

    const controller = new AbortController();
    setMaxListeners(50, controller.signal);
    sessionControllers.set(sessionId, controller);
    sessionModes.set(sessionId, mode);

    const toolTimers = new Map<string, number>();
    const interruptedToolCalls = new Set<string>();
    const interruptedToolNames = new Map<string, string[]>();
    const toolIdRemapping = new Map<string, string>();
    let sentFinalEvent = false;
    let lastInputTokens = 0;

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
      const projectData = getTileProjectData ? getTileProjectData(tileId) : null;
      const settings = loadSettings();
      const apiKeys = settings.apiKeys;
      let currentMessages: ChatMessage[] = messages;
      let toolErrorRetries = 0;
      let lastToolCall: { id: string; name: string; args: Record<string, unknown> } | null = null;

      // Retry loop: when a tool validation error crashes the stream, we append
      // the error context and re-invoke so the LLM can see its mistake and retry.
      retryLoop: while (true) {
        if (controller.signal.aborted) break;

        const streamAgent = await createAgent(
          folder || undefined,
          modelConfig,
          apiKeys,
          projectData?.githubPR,
          sessionModes.get(sessionId) || mode,
        );

        console.log(`[agent:stream] Starting stream for session ${sessionId}, tile: ${tileId}, folder: ${folder}, model: ${modelConfig.name}, effort: ${modelConfig.effort}, messages: ${currentMessages.length}${toolErrorRetries > 0 ? ` (retry ${toolErrorRetries})` : ''}`);

        try {
          let nextStreamInput: unknown = { messages: currentMessages as any };

          while (!controller.signal.aborted) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stream = await streamAgent.streamEvents(
              nextStreamInput as any,
              {
                version: "v2",
                signal: controller.signal,
                recursionLimit: 10000,
                configurable: { thread_id: sessionId },
              }
            );

            let interruptPayload: InterruptPayload | null = null;

            for await (const event of stream) {
              if (controller.signal.aborted) break;

              const maybeInterrupt =
                getInterruptPayload(event.data?.output) ||
                getInterruptPayload(event.data?.chunk) ||
                getInterruptPayload(event.data);
              if (maybeInterrupt) {
                interruptPayload = maybeInterrupt;
                break;
              }

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
                  lastInputTokens = input_tokens || 0;
                  send({
                    type: 'token-usage',
                    sessionId,
                    inputTokens: input_tokens || 0,
                    outputTokens: output_tokens || 0,
                  });
                }
              }

              if (event.event === "on_tool_start") {
                const rawToolCallId = event.run_id;
                const toolName = event.name;
                let toolArgs = event.data?.input || {};

                if (toolArgs.input && typeof toolArgs.input === 'string') {
                  try {
                    toolArgs = JSON.parse(toolArgs.input);
                  } catch {
                    // Keep original if parsing fails
                  }
                }

                toolTimers.set(rawToolCallId, Date.now());
                lastToolCall = { id: rawToolCallId, name: toolName, args: toolArgs };

                if (interruptedToolCalls.has(rawToolCallId)) {
                  send({
                    type: 'tool-status-update',
                    sessionId,
                    toolCallId: rawToolCallId,
                    status: 'running',
                  });
                  continue;
                }

                const nameQueue = interruptedToolNames.get(toolName);
                const approvalToolCallId = nameQueue?.shift();
                if (approvalToolCallId) {
                  if (!nameQueue || nameQueue.length === 0) {
                    interruptedToolNames.delete(toolName);
                  }
                  toolIdRemapping.set(rawToolCallId, approvalToolCallId);
                  send({
                    type: 'tool-status-update',
                    sessionId,
                    toolCallId: approvalToolCallId,
                    status: 'running',
                  });
                  continue;
                }

                let diffData: DiffData | undefined;
                if (folder && (toolName === 'edit_file' || toolName === 'write_file')) {
                  diffData = computeDiffData(toolName, toolArgs, folder);
                }

                send({
                  type: 'tool-start',
                  sessionId,
                  toolCallId: rawToolCallId,
                  toolName,
                  toolArgs,
                  diffData,
                });

                if (toolName === 'write_todos' && toolArgs.todos) {
                  send({
                    type: 'todo-update',
                    sessionId,
                    todos: toolArgs.todos as TodoItem[],
                  });
                }
              }

              if (event.event === "on_tool_end") {
                const rawToolCallId = event.run_id;
                const toolCallId = toolIdRemapping.get(rawToolCallId) || rawToolCallId;
                const startTime = toolTimers.get(rawToolCallId) || Date.now();
                const elapsedMs = Date.now() - startTime;
                toolTimers.delete(rawToolCallId);
                toolIdRemapping.delete(rawToolCallId);
                interruptedToolCalls.delete(toolCallId);

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

            if (controller.signal.aborted) break;

            if (!interruptPayload) {
              // Stream completed successfully — exit retry loop
              break retryLoop;
            }

            const decisions: Array<Record<string, unknown>> = [];
            for (const action of interruptPayload.actionRequests) {
              const toolName = typeof action.name === 'string' ? action.name : 'unknown_tool';
              const toolArgs = action.args && typeof action.args === 'object' ? action.args : {};
              const toolCallId = typeof action.id === 'string' ? action.id : uuidv4();
              const approvalRequestId = uuidv4();
              interruptedToolCalls.add(toolCallId);
              const queue = interruptedToolNames.get(toolName) || [];
              queue.push(toolCallId);
              interruptedToolNames.set(toolName, queue);

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

              if (decision === 'approve' || decision === 'auto-approve') {
                decisions.push({ type: 'approve' });
                send({
                  type: 'tool-status-update',
                  sessionId,
                  toolCallId,
                  status: 'running',
                });
              } else {
                decisions.push({ type: 'reject' });
                interruptedToolCalls.delete(toolCallId);
                send({
                  type: 'tool-end',
                  sessionId,
                  toolCallId,
                  output: 'Tool execution skipped by user',
                  error: 'skipped',
                  elapsedMs: 0,
                });
              }
            }

            nextStreamInput = new Command({ resume: { decisions } });
          }
        } catch (streamError) {
          if (isToolValidationError(streamError) && toolErrorRetries < MAX_TOOL_ERROR_RETRIES && !controller.signal.aborted) {
            toolErrorRetries++;
            const errorMsg = streamError instanceof Error ? streamError.message : String(streamError);
            console.warn(`[agent:stream] Tool validation error for session ${sessionId} (retry ${toolErrorRetries}/${MAX_TOOL_ERROR_RETRIES}):`, errorMsg);

            if (lastToolCall) {
              const startTime = toolTimers.get(lastToolCall.id) || Date.now();
              send({
                type: 'tool-end',
                sessionId,
                toolCallId: lastToolCall.id,
                output: errorMsg,
                error: errorMsg,
                elapsedMs: Date.now() - startTime,
              });
              toolTimers.delete(lastToolCall.id);
            }

            currentMessages = [
              ...currentMessages,
              {
                role: 'assistant',
                content: `I attempted to call the tool "${lastToolCall?.name ?? 'unknown'}" but it failed with a schema validation error: ${errorMsg}\n\nI need to retry with the correct arguments.`,
              },
              {
                role: 'user',
                content: 'Your previous tool call failed because of invalid or missing arguments. Please retry with the correct arguments. Make sure all required parameters are provided.',
              },
            ];

            lastToolCall = null;
            continue retryLoop;
          }

          if (isPromptTooLongError(streamError) && !controller.signal.aborted && currentMessages.length > 4) {
            const errorMsg = streamError instanceof Error ? streamError.message : String(streamError);
            console.warn(`[agent:stream] Prompt too long for session ${sessionId}, auto-compacting: ${errorMsg}`);

            send({ type: 'compact-start', sessionId });

            const settings = loadSettings();
            const compactResult = await runCompaction(currentMessages, modelConfig, settings.apiKeys);
            if (compactResult) {
              console.log(`[agent:stream] Emergency compact complete for session ${sessionId}, summarized ${currentMessages.length - compactResult.keptMessages.length} messages`);

              const summaryMessage: ChatMessage = {
                role: 'user',
                content: `[Context compacted — previous conversation summarized to fit context window]\n\n${compactResult.summary}`,
              };
              currentMessages = [summaryMessage, ...compactResult.keptMessages];

              send({
                type: 'compact',
                sessionId,
                summary: compactResult.summary,
                keptMessages: compactResult.keptMessages,
              });

              lastToolCall = null;
              continue retryLoop;
            } else {
              console.error(`[agent:stream] Emergency compact failed for session ${sessionId}`);
              send({ type: 'compact-end', sessionId });
            }
          }

          throw streamError;
        }
      }

      if (!controller.signal.aborted) {
        console.log(`[agent:stream] Stream completed for session ${sessionId}`);
        sendFinal({ type: 'done', sessionId });

        // Check if context usage crossed the compact threshold
        const contextLimit = getContextLimit(modelConfig.name);
        const contextUsage = lastInputTokens / contextLimit;
        if (contextUsage >= COMPACT_THRESHOLD && messages.length > 4) {
          console.log(`[agent:stream] Context at ${(contextUsage * 100).toFixed(1)}% (${lastInputTokens}/${contextLimit}), triggering compact for session ${sessionId}`);
          send({ type: 'compact-start', sessionId });

          const settings = loadSettings();
          const result = await runCompaction(messages, modelConfig, settings.apiKeys);
          if (result) {
            console.log(`[agent:stream] Compact complete for session ${sessionId}, summarized ${messages.length - result.keptMessages.length} messages`);
            send({
              type: 'compact',
              sessionId,
              summary: result.summary,
              keptMessages: result.keptMessages,
            });
          } else {
            console.log(`[agent:stream] Compact failed or skipped for session ${sessionId}`);
            send({ type: 'compact-end', sessionId });
          }
        }
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
