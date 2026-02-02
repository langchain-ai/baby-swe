import { spawn } from 'child_process';
import { FilesystemBackend } from 'deepagents';
import type { SandboxBackendProtocol, ExecuteResponse, FileUploadResponse, FileDownloadResponse } from 'deepagents';

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
}
