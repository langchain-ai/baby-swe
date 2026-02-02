import { spawn } from 'child_process';
import { FilesystemBackend } from 'deepagents';
import type { SandboxBackendProtocol, ExecuteResponse, FileUploadResponse, FileDownloadResponse } from 'deepagents';
import TurndownService from 'turndown';
import { tavily } from '@tavily/core';

const DEFAULT_TIMEOUT = 120_000;
const MAX_OUTPUT_SIZE = 100 * 1024;

export class LocalSandboxBackend implements SandboxBackendProtocol {
  private fsBackend: FilesystemBackend;
  private rootDir: string;
  readonly id: string;

  constructor(options: { rootDir: string }) {
    this.rootDir = options.rootDir;
    this.fsBackend = new FilesystemBackend({ rootDir: options.rootDir, virtualMode: true });
    this.id = `local-sandbox-${Date.now()}`;
  }

  async execute(command: string): Promise<ExecuteResponse> {
    return new Promise((resolve) => {
      let output = '';
      let truncated = false;

      const proc = spawn(command, {
        shell: true,
        cwd: this.rootDir,
        env: { ...process.env },
        timeout: DEFAULT_TIMEOUT,
      });

      const appendOutput = (data: Buffer) => {
        if (truncated) return;
        const text = data.toString();
        if (output.length + text.length > MAX_OUTPUT_SIZE) {
          output += text.slice(0, MAX_OUTPUT_SIZE - output.length);
          output += '\n\n[Output truncated due to size limit]';
          truncated = true;
        } else {
          output += text;
        }
      };

      proc.stdout?.on('data', appendOutput);
      proc.stderr?.on('data', appendOutput);

      proc.on('close', (exitCode) => {
        resolve({
          output: output || '(no output)',
          exitCode,
          truncated,
        });
      });

      proc.on('error', (err) => {
        resolve({
          output: `Error executing command: ${err.message}`,
          exitCode: 1,
          truncated: false,
        });
      });

      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
          resolve({
            output: output + '\n\n[Command timed out after 120 seconds]',
            exitCode: null,
            truncated,
          });
        }
      }, DEFAULT_TIMEOUT);
    });
  }

  lsInfo(path: string) {
    return this.fsBackend.lsInfo(path);
  }

  read(filePath: string, offset?: number, limit?: number) {
    return this.fsBackend.read(filePath, offset, limit);
  }

  readRaw(filePath: string) {
    return this.fsBackend.readRaw(filePath);
  }

  grepRaw(pattern: string, path?: string | null, glob?: string | null) {
    return this.fsBackend.grepRaw(pattern, path ?? undefined, glob);
  }

  globInfo(pattern: string, path?: string) {
    return this.fsBackend.globInfo(pattern, path);
  }

  write(filePath: string, content: string) {
    return this.fsBackend.write(filePath, content);
  }

  edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean) {
    return this.fsBackend.edit(filePath, oldString, newString, replaceAll);
  }

  uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
    return this.fsBackend.uploadFiles(files);
  }

  downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    return this.fsBackend.downloadFiles(paths);
  }

  async webSearch(query: string): Promise<{ results: Array<{ title: string; url: string; content: string }>; error?: string }> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return { results: [], error: 'TAVILY_API_KEY not set in environment' };
    }

    try {
      const client = tavily({ apiKey });
      const response = await client.search(query, { maxResults: 5 });
      return {
        results: response.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        })),
      };
    } catch (err) {
      return { results: [], error: `Web search failed: ${(err as Error).message}` };
    }
  }

  async fetchUrl(url: string): Promise<{ content: string; error?: string }> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BabySWE/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return { content: '', error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      if (contentType.includes('text/html')) {
        const turndown = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
        });
        const markdown = turndown.turndown(text);
        const truncated = markdown.length > MAX_OUTPUT_SIZE
          ? markdown.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Content truncated due to size limit]'
          : markdown;
        return { content: truncated };
      }

      const truncated = text.length > MAX_OUTPUT_SIZE
        ? text.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Content truncated due to size limit]'
        : text;
      return { content: truncated };
    } catch (err) {
      return { content: '', error: `Fetch failed: ${(err as Error).message}` };
    }
  }

  async httpRequest(
    method: string,
    url: string,
    headers?: Record<string, string>,
    body?: string
  ): Promise<{ status: number; headers: Record<string, string>; body: string; error?: string }> {
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

      return {
        status: response.status,
        headers: responseHeaders,
        body: responseBody,
      };
    } catch (err) {
      return {
        status: 0,
        headers: {},
        body: '',
        error: `HTTP request failed: ${(err as Error).message}`,
      };
    }
  }
}
