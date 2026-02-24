import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const PROMPTS_DIR = path.join(__dirname);

interface GithubPR {
  number: number;
  title: string;
  url: string;
  state: string;
  author: string;
  baseRef: string;
  headRef: string;
}

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
  githubPR?: GithubPR | null;
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
- Be terse and concise. Avoid unnecessary preamble, filler, or verbosity. Get straight to the point.
- Only use emojis if the user explicitly requests it.
- Your output will be displayed on a command line interface. Use Github-flavored markdown for formatting.
- Output text to communicate with the user; all text you output outside of tool use is displayed to the user. Only use tools to complete tasks.
- NEVER create files unless absolutely necessary. ALWAYS prefer editing existing files.
- Do not use a colon before tool calls.
- Never give time estimates or predictions for how long tasks will take.

# Professional objectivity
Prioritize technical accuracy and truthfulness over validating the user's beliefs. Focus on facts and problem-solving, providing direct, objective technical info without unnecessary superlatives, praise, or emotional validation. Disagree when necessary, even if it may not be what the user wants to hear. Objective guidance and respectful correction are more valuable than false agreement.`;
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
5. Push to remote if needed, create PR using gh pr create

## GitHub CLI (gh)
The \`gh\` CLI is available for all GitHub operations. Use it freely for tasks like:
- \`gh pr view\` — view the current PR details
- \`gh pr diff\` — get the full diff of the current PR
- \`gh pr checks\` — check CI status
- \`gh pr review\` — submit a review
- \`gh pr comment\` — add a comment to the PR
- \`gh issue view <number>\` — view an issue
- \`gh issue list\` — list issues
- \`gh repo view\` — view repo info
- \`gh run list\` / \`gh run view\` — view GitHub Actions runs`;
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

function buildGithubPR(vars: PromptVariables): string {
  if (!vars.githubPR) return '';

  const pr = vars.githubPR;
  return `# GitHub Pull Request
The current branch has an open pull request:
- PR #${pr.number}: ${pr.title}
- URL: ${pr.url}
- State: ${pr.state}
- Author: ${pr.author}
- Base branch: ${pr.baseRef}
- Head branch: ${pr.headRef}

You can use \`gh pr diff\` to view the full PR diff, \`gh pr checks\` to check CI status, and other \`gh pr\` subcommands to interact with this PR.`;
}

export function buildSystemPrompt(rootDir?: string, agentMemory?: string, githubPR?: GithubPR | null): string {
  const sections: string[] = [];

  sections.push(`You are baby-swe, an AI software engineering assistant built with Claude.`);

  sections.push(buildToneAndStyle());
  sections.push(buildDoingTasks());
  sections.push(buildGitInstructions());

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

    if (githubPR) {
      vars.githubPR = githubPR;
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

    if (vars.githubPR) {
      sections.push(buildGithubPR(vars));
    }
  } else {
    sections.push(`# Environment
No working directory selected. Open a folder to enable filesystem access.`);
  }

  return sections.join('\n\n');
}

export { loadPrompt, stripFrontmatter, substituteVariables, getGitInfo, getDirectoryStructure };
