import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

const AGENTS_FILENAME = 'AGENTS.md';
const MAX_NESTED_FILES = 20;
const MAX_NESTED_CONTENT_CHARS = 20_000;

function readNonEmptyFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    return content ? content : null;
  } catch {
    return null;
  }
}

function isPathInsideDirectory(filePath: string, dirPath: string): boolean {
  const relative = path.relative(dirPath, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function findNestedAgentFiles(rootDir: string): string[] {
  const normalizedRootDir = path.resolve(rootDir);
  const rootAgentsPath = path.resolve(path.join(normalizedRootDir, AGENTS_FILENAME));

  let repoRoot: string;
  try {
    repoRoot = execFileSync('git', ['-C', normalizedRootDir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return [];
  }

  let output: string;
  try {
    output = execFileSync(
      'git',
      ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '--', AGENTS_FILENAME, `**/${AGENTS_FILENAME}`],
      { encoding: 'utf-8' },
    );
  } catch {
    return [];
  }

  const nestedFiles = new Set<string>();

  for (const repoRelativePath of output.split('\n')) {
    const trimmedPath = repoRelativePath.trim();
    if (!trimmedPath) continue;

    const absolutePath = path.resolve(repoRoot, trimmedPath);

    if (absolutePath === rootAgentsPath) continue;
    if (path.basename(absolutePath) !== AGENTS_FILENAME) continue;
    if (!isPathInsideDirectory(absolutePath, normalizedRootDir)) continue;

    nestedFiles.add(absolutePath);
    if (nestedFiles.size >= MAX_NESTED_FILES) break;
  }

  return Array.from(nestedFiles).sort((a, b) => a.localeCompare(b));
}

function loadNestedProjectMemory(rootDir: string): string | null {
  const nestedFiles = findNestedAgentFiles(rootDir);
  if (nestedFiles.length === 0) return null;

  const sections: string[] = [];
  let remainingChars = MAX_NESTED_CONTENT_CHARS;

  for (const nestedFile of nestedFiles) {
    if (remainingChars <= 0) break;

    const content = readNonEmptyFile(nestedFile);
    if (!content) continue;

    const relativePath = path.relative(rootDir, nestedFile) || AGENTS_FILENAME;
    const heading = `#### ${relativePath}`;

    if (content.length <= remainingChars) {
      sections.push(`${heading}\n${content}`);
      remainingChars -= content.length;
      continue;
    }

    sections.push(`${heading}\n${content.slice(0, remainingChars)}\n\n...[truncated due to size limit]...`);
    remainingChars = 0;
  }

  if (sections.length === 0) return null;

  return `### Nested Project Instructions (path-scoped)
Apply these instructions when working in or under the matching paths.

${sections.join('\n\n')}`;
}

export function loadAgentMemory(rootDir?: string): string | null {
  const sections: string[] = [];

  const userMemoryPath = path.join(os.homedir(), '.baby-swe', AGENTS_FILENAME);
  const userMemory = readNonEmptyFile(userMemoryPath);
  if (userMemory) {
    sections.push(`### User Preferences\n${userMemory}`);
  }

  if (rootDir) {
    const projectMemoryPath = path.join(rootDir, AGENTS_FILENAME);
    const projectMemory = readNonEmptyFile(projectMemoryPath);
    if (projectMemory) {
      sections.push(`### Project Instructions\n${projectMemory}`);
    }

    const nestedProjectMemory = loadNestedProjectMemory(rootDir);
    if (nestedProjectMemory) {
      sections.push(nestedProjectMemory);
    }
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}
