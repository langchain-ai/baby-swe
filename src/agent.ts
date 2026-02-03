import { createDeepAgent } from "deepagents";
import { LocalSandboxBackend } from "./backends/local-sandbox";
import { ChatAnthropic } from "@langchain/anthropic";
import { ipcMain, BrowserWindow } from "electron";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import "dotenv/config";
import type { ApprovalDecision, ApprovalResponse, ChatMessage, DiffData, TodoItem } from "./types";
import { loadAgentMemory } from "./memory/agents";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { tavily } from "@tavily/core";
import TurndownService from "turndown";
import { loadSettings } from "./storage";

const sessionControllers = new Map<string, AbortController>();
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
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return JSON.stringify({ results: [], error: 'TAVILY_API_KEY not set in environment' });
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

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.venv', 'venv',
  'build', 'dist', '.next', '.cache', 'coverage', '.turbo',
]);

function getDirectoryStructure(rootDir: string, maxDepth: number, maxEntries: number): string {
  const lines: string[] = [];
  let entryCount = 0;

  function walk(dir: string, depth: number, prefix: string): void {
    if (depth > maxDepth || entryCount >= maxEntries) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.') && !IGNORE_DIRS.has(e.name))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      for (const entry of entries) {
        if (entryCount >= maxEntries) break;

        const isDir = entry.isDirectory();
        lines.push(`${prefix}${isDir ? '/' : ''}${entry.name}`);
        entryCount++;

        if (isDir && depth < maxDepth) {
          walk(path.join(dir, entry.name), depth + 1, prefix + '  ');
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  walk(rootDir, 1, '');
  return lines.join('\n');
}

function getLocalContext(rootDir: string): string {
  const sections: string[] = [];

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    sections.push(`Current branch: ${branch}`);
  } catch {
    // Not a git repo or git not available
  }

  try {
    let mainBranch = 'main';
    try {
      execSync('git rev-parse --verify main', {
        cwd: rootDir,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      try {
        execSync('git rev-parse --verify master', {
          cwd: rootDir,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        mainBranch = 'master';
      } catch {
        mainBranch = '';
      }
    }
    if (mainBranch) {
      sections.push(`Main branch: ${mainBranch}`);
    }
  } catch {
    // Ignore
  }

  try {
    const status = execSync('git status --porcelain', {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (status) {
      const statusLines = status.split('\n').slice(0, 15);
      const truncated = status.split('\n').length > 15 ? '\n  ...(truncated)' : '';
      sections.push(`Git status:\n${statusLines.join('\n')}${truncated}`);
    }
  } catch {
    // Not a git repo
  }

  try {
    const structure = getDirectoryStructure(rootDir, 3, 20);
    if (structure) {
      sections.push(`Directory structure:\n${structure}`);
    }
  } catch {
    // Ignore
  }

  return sections.join('\n\n');
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

function createAgent(rootDir?: string) {
  const model = new ChatAnthropic({
    model: "claude-opus-4-5-20251101",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    streaming: true,
  });

  let systemPrompt: string;

  if (rootDir) {
    const localContext = getLocalContext(rootDir);
    const agentMemory = loadAgentMemory(rootDir);

    systemPrompt = `You are baby-swe, a helpful software engineering assistant.
You help users with coding tasks, debugging, and software development questions.
Be concise and helpful.

Your current working directory is: ${rootDir}
You have full access to the filesystem within this directory. Use the available tools to explore and modify the codebase:
- File tools: ls, read_file, write_file, edit_file, glob, grep
- Shell execution: execute (run shell commands in the project directory)

IMPORTANT: When the user mentions files using the @path/to/file syntax, the @ symbol is just a mention marker.
The actual file path is everything after the @ symbol (without the @). For example, @src/index.ts refers to the file src/index.ts.

When the user asks about code or files, start by exploring the directory structure to understand the project.
When running commands with execute, prefer non-interactive commands and handle errors gracefully.${localContext ? `

## Project Context
${localContext}` : ''}${agentMemory ? `

## Agent Memory
${agentMemory}` : ''}`;
  } else {
    systemPrompt = `You are baby-swe, a helpful software engineering assistant.
You help users with coding tasks, debugging, and software development questions.
Be concise and helpful.

No working directory has been selected. Ask the user to open a folder to enable filesystem access.`;
  }

  const config: Parameters<typeof createDeepAgent>[0] = {
    model,
    systemPrompt,
    tools: rootDir ? [] : webTools,
  };

  if (rootDir) {
    config.backend = () => new LocalSandboxBackend({ rootDir });
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

export function setupAgentIPC(mainWindow: BrowserWindow, getTileProject: (tileId: string) => string | null) {
  ipcMain.handle("agent:invoke", async (_event, userMessage: string): Promise<AgentResponse> => {
    try {
      const agent = createAgent(undefined);
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

  ipcMain.on("agent:stream", async (_event, sessionId: string, tileId: string, messages: ChatMessage[]) => {
    const controller = new AbortController();
    sessionControllers.set(sessionId, controller);

    const toolTimers = new Map<string, number>();

    try {
      const folder = getTileProject(tileId);
      const streamAgent = createAgent(folder || undefined);

      console.log(`[agent:stream] Starting stream for session ${sessionId}, tile: ${tileId}, folder: ${folder}, messages: ${messages.length}`);

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
              mainWindow.webContents.send('agent:stream-event', {
                type: 'token',
                sessionId,
                token,
              });
            }
          }
        }

        if (event.event === "on_chat_model_end") {
          const message = event.data?.output;
          if (message?.usage_metadata) {
            const { input_tokens, output_tokens } = message.usage_metadata;
            mainWindow.webContents.send('agent:stream-event', {
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

          const settings = loadSettings();
          const requiresApproval = TOOLS_REQUIRING_APPROVAL.includes(toolName) && !settings.yoloMode;
          const approvalRequestId = requiresApproval ? uuidv4() : undefined;

          let diffData: DiffData | undefined;
          if (folder && (toolName === 'edit_file' || toolName === 'write_file')) {
            diffData = computeDiffData(toolName, toolArgs, folder);
          }

          mainWindow.webContents.send('agent:stream-event', {
            type: 'tool-start',
            sessionId,
            toolCallId,
            toolName,
            toolArgs,
            approvalRequestId,
            diffData,
          });

          if (toolName === 'write_todos' && toolArgs.todos) {
            mainWindow.webContents.send('agent:stream-event', {
              type: 'todo-update',
              sessionId,
              todos: toolArgs.todos as TodoItem[],
            });
          }

          if (requiresApproval && approvalRequestId) {
            const decision = await new Promise<ApprovalDecision>((resolve) => {
              pendingApprovals.set(approvalRequestId, { resolve });
            });

            if (decision === 'reject') {
              mainWindow.webContents.send('agent:stream-event', {
                type: 'tool-end',
                sessionId,
                toolCallId,
                output: 'Tool execution skipped by user',
                error: 'skipped',
                elapsedMs: 0,
              });
              mainWindow.webContents.send('agent:stream-event', {
                type: 'done',
                sessionId,
              });
              controller.abort();
              return;
            }

            mainWindow.webContents.send('agent:stream-event', {
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
          } else if (output && typeof output === 'object') {
            // Handle LangChain ToolMessage object
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
          }

          mainWindow.webContents.send('agent:stream-event', {
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
        mainWindow.webContents.send('agent:stream-event', {
          type: 'done',
          sessionId,
        });
      }
    } catch (error) {
      console.error(`[agent:stream] Error for session ${sessionId}:`, error);
      if (!controller.signal.aborted) {
        mainWindow.webContents.send('agent:stream-event', {
          type: 'error',
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } finally {
      sessionControllers.delete(sessionId);
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
