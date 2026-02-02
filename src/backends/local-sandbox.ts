import { spawn } from 'child_process';
import { FilesystemBackend } from 'deepagents';
import type { SandboxBackendProtocol, ExecuteResponse, FileUploadResponse, FileDownloadResponse } from 'deepagents';
import TurndownService from 'turndown';
import { tavily } from '@tavily/core';

const DEFAULT_TIMEOUT = 120_000;
const MAX_OUTPUT_SIZE = 100 * 1024;
const MAX_LINES = 1000;
const MAX_GREP_MATCHES = 100;
const MAX_MATCH_TEXT_LENGTH = 300;
const MAX_GLOB_ENTRIES = 200;

export class LocalSandboxBackend implements SandboxBackendProtocol {
  private fsBackend: FilesystemBackend;
  private rootDir: string;
  readonly id: string;

  constructor(options: { rootDir: string }) {
    this.rootDir = options.rootDir;
    this.fsBackend = new FilesystemBackend({ rootDir: options.rootDir });
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

  async lsInfo(path: string) {
    const result = await this.fsBackend.lsInfo(path);
    if (result.length > MAX_GLOB_ENTRIES) {
      return result.slice(0, MAX_GLOB_ENTRIES);
    }
    return result;
  }

  async read(filePath: string, offset?: number, limit?: number) {
    const effectiveLimit = limit ?? MAX_LINES;
    const result = await this.fsBackend.read(filePath, offset, effectiveLimit);
    const lines = result.split('\n');
    if (lines.length > MAX_LINES) {
      return lines.slice(0, MAX_LINES).join('\n') + `\n\n[Content truncated: showing ${MAX_LINES} of ${lines.length} lines]`;
    }
    if (result.length > MAX_OUTPUT_SIZE) {
      return result.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Content truncated due to size limit]';
    }
    return result;
  }

  readRaw(filePath: string) {
    return this.fsBackend.readRaw(filePath);
  }

  async grepRaw(pattern: string, path?: string | null, glob?: string | null): Promise<string> {
    const result = await this.fsBackend.grepRaw(pattern, path ?? undefined, glob);

    if (typeof result === 'string') {
      if (result.length > MAX_OUTPUT_SIZE) {
        return result.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Results truncated due to size limit]';
      }
      return result;
    }

    if (result.length === 0) {
      return `No matches found for pattern '${pattern}'`;
    }

    const totalMatches = result.length;
    const truncatedMatches = result.slice(0, MAX_GREP_MATCHES);

    const lines: string[] = [];
    let currentFile: string | null = null;

    for (const match of truncatedMatches) {
      if (match.path !== currentFile) {
        currentFile = match.path;
        lines.push(`\n${currentFile}:`);
      }
      const text = match.text.length > MAX_MATCH_TEXT_LENGTH
        ? match.text.slice(0, MAX_MATCH_TEXT_LENGTH) + '...'
        : match.text;
      lines.push(`  ${match.line}: ${text}`);
    }

    let output = lines.join('\n');

    if (totalMatches > MAX_GREP_MATCHES) {
      output += `\n\n[Results truncated: showing ${MAX_GREP_MATCHES} of ${totalMatches} matches. Refine your search pattern for more specific results.]`;
    }

    if (output.length > MAX_OUTPUT_SIZE) {
      output = output.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Results truncated due to size limit]';
    }

    return output;
  }

  async globInfo(pattern: string, path?: string) {
    const result = await this.fsBackend.globInfo(pattern, path);
    if (result.length > MAX_GLOB_ENTRIES) {
      return result.slice(0, MAX_GLOB_ENTRIES);
    }
    return result;
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
