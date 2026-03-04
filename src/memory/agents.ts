import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const AGENTS_FILENAME = 'AGENTS.md';
const MAX_NESTED_FILES = 20;
const MAX_NESTED_CONTENT_CHARS = 20_000;
const MAX_SCANNED_DIRS = 5_000;

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'release',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
]);

function readNonEmptyFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    return content ? content : null;
  } catch {
    return null;
  }
}

function findNestedAgentFiles(rootDir: string): string[] {
  const nestedFiles: string[] = [];
  const rootAgentsPath = path.resolve(path.join(rootDir, AGENTS_FILENAME));
  const stack: string[] = [rootDir];
  let scannedDirs = 0;

  while (stack.length > 0 && nestedFiles.length < MAX_NESTED_FILES && scannedDirs < MAX_SCANNED_DIRS) {
    const dirPath = stack.pop();
    if (!dirPath) break;
    scannedDirs += 1;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          stack.push(entryPath);
        }
        continue;
      }

      if (!entry.isFile() || entry.name !== AGENTS_FILENAME) {
        continue;
      }

      if (path.resolve(entryPath) === rootAgentsPath) {
        continue;
      }

      nestedFiles.push(entryPath);
      if (nestedFiles.length >= MAX_NESTED_FILES) {
        break;
      }
    }
  }

  return nestedFiles.sort((a, b) => a.localeCompare(b));
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
