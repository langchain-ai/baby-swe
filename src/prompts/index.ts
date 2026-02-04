import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const PROMPTS_DIR = path.join(__dirname);

interface PromptVariables {
  rootDir?: string;
  gitBranch?: string;
  mainBranch?: string;
  gitStatus?: string;
  directoryStructure?: string;
  agentMemory?: string;
  modelName?: string;
  platform?: string;
  osVersion?: string;
  todayDate?: string;
}

function loadPrompt(filename: string): string {
  const filePath = path.join(PROMPTS_DIR, filename);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return stripFrontmatter(content);
  } catch {
    return '';
  }
}

function stripFrontmatter(content: string): string {
  const frontmatterMatch = content.match(/^<!--[\s\S]*?-->\n?/);
  if (frontmatterMatch) {
    return content.slice(frontmatterMatch[0].length).trim();
  }
  return content.trim();
}

function substituteVariables(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    result = result.replace(regex, value);
  }
  result = result.replace(/\$\{[^}]+\}/g, '');
  return result;
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

function getGitInfo(rootDir: string): { branch: string; mainBranch: string; status: string } {
  let branch = '';
  let mainBranch = 'main';
  let status = '';

  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // Not a git repo
  }

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

  try {
    const rawStatus = execSync('git status --porcelain', {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (rawStatus) {
      const statusLines = rawStatus.split('\n').slice(0, 15);
      const truncated = rawStatus.split('\n').length > 15 ? '\n  ...(truncated)' : '';
      status = statusLines.join('\n') + truncated;
    } else {
      status = '(clean)';
    }
  } catch {
    // Not a git repo
  }

  return { branch, mainBranch, status };
}

function buildToneAndStyle(): string {
  return `# Tone and style
- Only use emojis if the user explicitly requests it.
- Your output will be displayed on a command line interface. Your responses should be short and concise. Use Github-flavored markdown for formatting.
- Output text to communicate with the user; all text you output outside of tool use is displayed to the user. Only use tools to complete tasks.
- NEVER create files unless absolutely necessary. ALWAYS prefer editing existing files.
- Do not use a colon before tool calls.

# Professional objectivity
Prioritize technical accuracy and truthfulness over validating the user's beliefs. Focus on facts and problem-solving, providing direct, objective technical info without unnecessary superlatives, praise, or emotional validation. Disagree when necessary, even if it may not be what the user wants to hear. Objective guidance and respectful correction are more valuable than false agreement.

# No time estimates
Never give time estimates or predictions for how long tasks will take. Focus on what needs to be done, not how long it might take.`;
}

function buildDoingTasks(): string {
  return `# Doing tasks
The user will primarily request you perform software engineering tasks. This includes solving bugs, adding new functionality, refactoring code, explaining code, and more.

- NEVER propose changes to code you haven't read. If a user asks about or wants you to modify a file, read it first. Understand existing code before suggesting modifications.
- Be careful not to introduce security vulnerabilities such as command injection, XSS, SQL injection, and other OWASP top 10 vulnerabilities.
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
  - Don't add features, refactor code, or make "improvements" beyond what was asked.
  - Don't add error handling, fallbacks, or validation for scenarios that can't happen.
  - Don't create helpers, utilities, or abstractions for one-time operations.
- Avoid backwards-compatibility hacks. If something is unused, delete it completely.`;
}

function buildToolUsagePolicy(): string {
  return `# Tool usage policy
- You can call multiple tools in a single response. If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel.
- Use specialized tools instead of bash commands when possible. For file operations, use dedicated tools: read_file for reading files, edit_file for editing, and write_file for creating files.
- When exploring the codebase to gather context, use the available file tools (ls, glob, grep, read_file) efficiently.`;
}

function buildExecutingWithCare(): string {
  return `# Executing actions with care
Carefully consider the reversibility and blast radius of actions. You can freely take local, reversible actions like editing files or running tests. But for actions that are hard to reverse, affect shared systems, or could be destructive, check with the user before proceeding.

Examples of risky actions that warrant user confirmation:
- Destructive operations: deleting files/branches, dropping database tables, rm -rf
- Hard-to-reverse operations: force-pushing, git reset --hard, amending published commits
- Actions visible to others: pushing code, creating/commenting on PRs or issues`;
}

function buildGitInstructions(): string {
  return `# Git operations

## Committing changes
Only create commits when requested by the user. If unclear, ask first.

Git Safety Protocol:
- NEVER update the git config
- NEVER run destructive git commands (push --force, reset --hard, checkout ., clean -f, branch -D) unless explicitly requested
- NEVER skip hooks (--no-verify) unless explicitly requested
- NEVER force push to main/master
- Always create NEW commits rather than amending, unless explicitly requested
- When staging files, prefer adding specific files by name rather than "git add -A"
- NEVER commit changes unless the user explicitly asks

When committing:
1. Run git status and git diff to see changes
2. Run git log to follow the repository's commit message style
3. Draft a concise commit message focusing on the "why" rather than "what"
4. Stage relevant files and create the commit
5. If commit fails due to pre-commit hook, fix the issue and create a NEW commit

## Creating pull requests
Use the gh command for GitHub-related tasks.

1. Run git status and git diff to understand changes
2. Check if the branch tracks a remote and is up to date
3. Run git log and git diff [base-branch]...HEAD to understand full commit history
4. Analyze all commits and draft a PR summary
5. Push to remote if needed, create PR using gh pr create`;
}

function buildBashToolDescription(): string {
  return `## execute (Bash)
Executes a bash command with optional timeout. Working directory persists between commands.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations - use specialized tools instead.

Before executing:
1. If creating directories/files, first use ls to verify parent directory exists
2. Always quote file paths that contain spaces

Usage notes:
- Avoid using find, grep, cat, head, tail, sed, awk, or echo commands. Instead use:
  - File search: Use glob tool
  - Content search: Use grep tool
  - Read files: Use read_file tool
  - Edit files: Use edit_file tool
  - Write files: Use write_file tool
- When issuing multiple commands:
  - If independent, make multiple tool calls in parallel
  - If dependent, chain with '&&'
- Try to use absolute paths and avoid cd`;
}

function buildEditToolDescription(): string {
  return `## edit_file
Performs exact string replacements in files.

Usage:
- You must read a file before editing it
- Preserve exact indentation (tabs/spaces) when matching
- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required
- The edit will FAIL if old_string is not unique. Provide more context to make it unique.`;
}

function buildReadToolDescription(): string {
  return `## read_file
Reads a file from the local filesystem.

Usage:
- The file_path parameter must be an absolute path
- By default, reads up to 2000 lines from the beginning
- Can specify line offset and limit for long files
- Lines longer than 2000 characters will be truncated
- Can read images (PNG, JPG, etc.) - contents are presented visually
- Can read Jupyter notebooks (.ipynb files)
- To read a directory, use ls via the execute tool`;
}

function buildWriteToolDescription(): string {
  return `## write_file
Writes a file to the local filesystem.

Usage:
- Will overwrite existing files
- If editing an existing file, you MUST read it first
- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required
- NEVER proactively create documentation files unless explicitly requested`;
}

function buildGlobToolDescription(): string {
  return `## glob
Fast file pattern matching tool.

- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use for finding files by name patterns`;
}

function buildGrepToolDescription(): string {
  return `## grep
Powerful search tool built on ripgrep.

- ALWAYS use this for search tasks, not bash grep/rg
- Supports full regex syntax
- Filter files with glob parameter or type parameter
- Output modes: "content", "files_with_matches" (default), "count"`;
}

function buildToolDescriptions(): string {
  return `# Tool descriptions

${buildBashToolDescription()}

${buildReadToolDescription()}

${buildWriteToolDescription()}

${buildEditToolDescription()}

${buildGlobToolDescription()}

${buildGrepToolDescription()}`;
}

function buildEnvironmentInfo(vars: PromptVariables): string {
  const sections: string[] = [];

  sections.push(`Working directory: ${vars.rootDir || 'Not set'}`);

  if (vars.gitBranch) {
    sections.push(`Current branch: ${vars.gitBranch}`);
  }

  if (vars.mainBranch) {
    sections.push(`Main branch: ${vars.mainBranch}`);
  }

  sections.push(`Platform: ${vars.platform || process.platform}`);
  sections.push(`Today's date: ${vars.todayDate || new Date().toISOString().split('T')[0]}`);

  return `# Environment
${sections.join('\n')}`;
}

function buildGitStatus(vars: PromptVariables): string {
  if (!vars.gitStatus) return '';

  return `# Git status
${vars.gitStatus}`;
}

function buildDirectoryStructure(vars: PromptVariables): string {
  if (!vars.directoryStructure) return '';

  return `# Directory structure
${vars.directoryStructure}`;
}

function buildAgentMemory(vars: PromptVariables): string {
  if (!vars.agentMemory) return '';

  return `# Agent Memory (AGENTS.md)
${vars.agentMemory}`;
}

export function buildSystemPrompt(rootDir?: string, agentMemory?: string): string {
  const sections: string[] = [];

  sections.push(`You are baby-swe, an AI software engineering assistant built with Claude.`);

  sections.push(buildToneAndStyle());
  sections.push(buildDoingTasks());
  sections.push(buildToolUsagePolicy());
  sections.push(buildExecutingWithCare());
  sections.push(buildGitInstructions());
  sections.push(buildToolDescriptions());

  const vars: PromptVariables = {
    platform: process.platform,
    todayDate: new Date().toISOString().split('T')[0],
  };

  if (rootDir) {
    vars.rootDir = rootDir;

    const gitInfo = getGitInfo(rootDir);
    vars.gitBranch = gitInfo.branch;
    vars.mainBranch = gitInfo.mainBranch;
    vars.gitStatus = gitInfo.status;

    vars.directoryStructure = getDirectoryStructure(rootDir, 3, 30);

    if (agentMemory) {
      vars.agentMemory = agentMemory;
    }

    sections.push(buildEnvironmentInfo(vars));

    if (vars.gitStatus) {
      sections.push(buildGitStatus(vars));
    }

    if (vars.directoryStructure) {
      sections.push(buildDirectoryStructure(vars));
    }

    if (vars.agentMemory) {
      sections.push(buildAgentMemory(vars));
    }
  } else {
    sections.push(`# Environment
No working directory selected. Open a folder to enable filesystem access.`);
  }

  return sections.join('\n\n');
}

export function buildExploreAgentPrompt(): string {
  return `You are a file search specialist for baby-swe. You excel at thoroughly navigating and exploring codebases.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
- Deleting files
- Moving or copying files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to search and analyze existing code.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use glob for broad file pattern matching
- Use grep for searching file contents with regex
- Use read_file when you know the specific file path
- Use execute ONLY for read-only operations (ls, git status, git log, git diff)
- Return file paths as absolute paths in your final response
- Avoid using emojis

NOTE: You are meant to be a fast agent that returns output as quickly as possible.
- Make efficient use of tools: be smart about how you search
- Spawn multiple parallel tool calls for grepping and reading files

Complete the user's search request efficiently and report your findings clearly.`;
}

export { loadPrompt, stripFrontmatter, substituteVariables, getGitInfo, getDirectoryStructure };
