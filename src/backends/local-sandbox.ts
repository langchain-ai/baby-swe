import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

const DEFAULT_TIMEOUT = 120_000;
const MAX_OUTPUT_SIZE = 100 * 1024;
const MAX_LINES = 1000;
const MAX_LINE_LENGTH = 10_000;
const LINE_NUMBER_WIDTH = 6;
const MAX_GREP_MATCHES = 100;
const MAX_MATCH_TEXT_LENGTH = 300;
const MAX_GLOB_ENTRIES = 200;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export interface ExecuteResponse {
  output: string;
  exitCode: number | null;
  truncated: boolean;
}

export interface FileInfo {
  path: string;
  is_dir?: boolean;
  size?: number;
  modified_at?: string;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export interface WriteResult {
  error?: string;
  path?: string;
}

export interface EditResult {
  error?: string;
  path?: string;
  occurrences?: number;
}

function formatContentWithLineNumbers(lines: string[], startLine: number): string {
  const resultLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + startLine;
    if (line.length <= MAX_LINE_LENGTH) {
      resultLines.push(`${lineNum.toString().padStart(LINE_NUMBER_WIDTH)}\t${line}`);
    } else {
      const numChunks = Math.ceil(line.length / MAX_LINE_LENGTH);
      for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
        const start = chunkIdx * MAX_LINE_LENGTH;
        const end = Math.min(start + MAX_LINE_LENGTH, line.length);
        const chunk = line.substring(start, end);
        if (chunkIdx === 0) {
          resultLines.push(`${lineNum.toString().padStart(LINE_NUMBER_WIDTH)}\t${chunk}`);
        } else {
          const marker = `${lineNum}.${chunkIdx}`;
          resultLines.push(`${marker.padStart(LINE_NUMBER_WIDTH)}\t${chunk}`);
        }
      }
    }
  }
  return resultLines.join('\n');
}

function performStringReplacement(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): [string, number] | string {
  if (content === '' && oldString === '') return [newString, 0];
  if (oldString === '') return 'Error: oldString cannot be empty when file has content';
  const occurrences = content.split(oldString).length - 1;
  if (occurrences === 0) return `Error: String not found in file: '${oldString}'`;
  if (occurrences > 1 && !replaceAll) {
    return `Error: String '${oldString}' has multiple occurrences (appears ${occurrences} times) in file. Use replace_all=true to replace all instances, or provide a more specific string with surrounding context.`;
  }
  return [content.split(oldString).join(newString), occurrences];
}

export class LocalSandboxBackend {
  private rootDir: string;

  constructor(options: { rootDir: string }) {
    this.rootDir = options.rootDir;
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath;
    return path.resolve(this.rootDir, filePath);
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

  async lsInfo(dirPath: string): Promise<FileInfo[]> {
    try {
      const resolvedPath = this.resolvePath(dirPath);
      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) return [];

      const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const results: FileInfo[] = [];

      for (const entry of entries) {
        const fullPath = path.join(resolvedPath, entry.name);
        try {
          const entryStat = fs.statSync(fullPath);
          if (entryStat.isFile()) {
            results.push({
              path: fullPath,
              is_dir: false,
              size: entryStat.size,
              modified_at: entryStat.mtime.toISOString(),
            });
          } else if (entryStat.isDirectory()) {
            results.push({
              path: fullPath + path.sep,
              is_dir: true,
              size: 0,
              modified_at: entryStat.mtime.toISOString(),
            });
          }
        } catch {
          continue;
        }
      }

      results.sort((a, b) => a.path.localeCompare(b.path));
      if (results.length > MAX_GLOB_ENTRIES) {
        return results.slice(0, MAX_GLOB_ENTRIES);
      }
      return results;
    } catch {
      return [];
    }
  }

  async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) return `Error: File '${filePath}' not found`;

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      if (!content || content.trim() === '') {
        return 'System reminder: File exists but has empty contents';
      }

      const lines = content.split('\n');
      const startIdx = offset ?? 0;
      const effectiveLimit = limit ?? MAX_LINES;
      const endIdx = Math.min(startIdx + effectiveLimit, lines.length);

      if (startIdx >= lines.length) {
        return `Error: Line offset ${offset} exceeds file length (${lines.length} lines)`;
      }

      let result = formatContentWithLineNumbers(lines.slice(startIdx, endIdx), startIdx + 1);

      const resultLines = result.split('\n');
      if (resultLines.length > MAX_LINES) {
        result = resultLines.slice(0, MAX_LINES).join('\n') + `\n\n[Content truncated: showing ${MAX_LINES} of ${resultLines.length} lines]`;
      }
      if (result.length > MAX_OUTPUT_SIZE) {
        result = result.slice(0, MAX_OUTPUT_SIZE) + '\n\n[Content truncated due to size limit]';
      }
      return result;
    } catch (e) {
      return `Error reading file '${filePath}': ${(e as Error).message}`;
    }
  }

  async grepRaw(pattern: string, searchPath?: string | null, glob?: string | null): Promise<string> {
    const baseFull = this.resolvePath(searchPath || '.');

    try {
      fs.statSync(baseFull);
    } catch {
      return `No matches found for pattern '${pattern}'`;
    }

    const matches = await this.ripgrepSearch(pattern, baseFull, glob || null);

    if (matches.length === 0) {
      return `No matches found for pattern '${pattern}'`;
    }

    const totalMatches = matches.length;
    const truncatedMatches = matches.slice(0, MAX_GREP_MATCHES);

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

  private async ripgrepSearch(pattern: string, baseFull: string, includeGlob: string | null): Promise<GrepMatch[]> {
    return new Promise((resolve) => {
      const args = ['--json', '-F'];
      if (includeGlob) args.push('--glob', includeGlob);
      args.push('--', pattern, baseFull);

      const proc = spawn('rg', args, { timeout: 30_000 });
      const matches: GrepMatch[] = [];
      let output = '';

      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0 && code !== 1) {
          resolve(this.literalSearchSync(pattern, baseFull, includeGlob));
          return;
        }
        for (const line of output.split('\n')) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type !== 'match') continue;
            const pdata = data.data || {};
            const ftext = pdata.path?.text;
            if (!ftext) continue;
            const ln = pdata.line_number;
            const lt = pdata.lines?.text?.replace(/\n$/, '') || '';
            if (ln === undefined) continue;
            matches.push({ path: ftext, line: ln, text: lt });
          } catch {
            continue;
          }
        }
        resolve(matches);
      });

      proc.on('error', () => {
        resolve(this.literalSearchSync(pattern, baseFull, includeGlob));
      });
    });
  }

  private literalSearchSync(pattern: string, baseFull: string, includeGlob: string | null): GrepMatch[] {
    const matches: GrepMatch[] = [];
    try {
      const stat = fs.statSync(baseFull);
      const cwd = stat.isDirectory() ? baseFull : path.dirname(baseFull);
      const files = fg.sync('**/*', { cwd, absolute: true, onlyFiles: true, dot: true });

      for (const fp of files) {
        try {
          if (includeGlob) {
            const { isMatch } = require('micromatch') as { isMatch: (str: string, pattern: string) => boolean };
            if (!isMatch(path.basename(fp), includeGlob)) continue;
          }
          if (fs.statSync(fp).size > MAX_FILE_SIZE_BYTES) continue;
          const lines = fs.readFileSync(fp, 'utf-8').split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(pattern)) {
              matches.push({ path: fp, line: i + 1, text: lines[i] });
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Base path not accessible
    }
    return matches;
  }

  async globInfo(pattern: string, searchPath?: string): Promise<FileInfo[]> {
    const normalizedPattern = pattern.startsWith('/') ? pattern.substring(1) : pattern;
    const resolvedSearchPath = searchPath ? this.resolvePath(searchPath) : this.rootDir;

    try {
      const stat = fs.statSync(resolvedSearchPath);
      if (!stat.isDirectory()) return [];
    } catch {
      return [];
    }

    const results: FileInfo[] = [];
    try {
      const matches = await fg(normalizedPattern, {
        cwd: resolvedSearchPath,
        absolute: true,
        onlyFiles: true,
        dot: true,
      });

      for (const matchedPath of matches) {
        try {
          const stat = fs.statSync(matchedPath);
          if (!stat.isFile()) continue;
          results.push({
            path: matchedPath,
            is_dir: false,
            size: stat.size,
            modified_at: stat.mtime.toISOString(),
          });
        } catch {
          continue;
        }
      }
    } catch {
      return [];
    }

    if (results.length > MAX_GLOB_ENTRIES) {
      return results.slice(0, MAX_GLOB_ENTRIES);
    }
    return results;
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      try {
        const stat = fs.lstatSync(resolvedPath);
        if (stat.isSymbolicLink()) {
          return { error: `Cannot write to ${filePath} because it is a symlink. Symlinks are not allowed.` };
        }
        return { error: `Cannot write to ${filePath} because it already exists. Read and then make an edit, or write to a new path.` };
      } catch {
        // File doesn't exist - good, proceed
      }
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      fs.writeFileSync(resolvedPath, content, 'utf-8');
      return { path: filePath };
    } catch (e) {
      return { error: `Error writing file '${filePath}': ${(e as Error).message}` };
    }
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      const stat = fs.lstatSync(resolvedPath);
      if (stat.isSymbolicLink()) {
        return { error: `Error: Symlinks are not allowed: ${filePath}` };
      }
      if (!stat.isFile()) {
        return { error: `Error: File '${filePath}' not found` };
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const result = performStringReplacement(content, oldString, newString, replaceAll ?? false);
      if (typeof result === 'string') return { error: result };

      const [newContent, occurrences] = result;
      fs.writeFileSync(resolvedPath, newContent, 'utf-8');
      return { path: filePath, occurrences };
    } catch (e) {
      return { error: `Error editing file '${filePath}': ${(e as Error).message}` };
    }
  }
}
