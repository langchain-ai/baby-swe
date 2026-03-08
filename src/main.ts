import { webcrypto, createHash } from 'crypto';
if (!globalThis.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.crypto = webcrypto as any;
}

import { app, BrowserWindow, Menu, dialog, ipcMain, shell, Notification } from 'electron';
import * as path from 'path';
import * as os from 'os';

// Ensure dev and production use the same userData directory.
// app.setName() alone doesn't change the userData path on macOS — must use app.setPath().
// This must happen before any other import that calls app.getPath('userData').
app.setPath('userData', path.join(os.homedir(), 'Library', 'Application Support', 'Baby SWE'));
import { execSync, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as pty from 'node-pty';
import { setupAgentIPC } from './agent';
import * as storage from './storage';
import type { Project, GithubPR, WorktreeInfo, LinearIssue, LinearAuthStatus, LinearSearchResult } from './types';

const terminals = new Map<string, pty.IPty>();

const MAX_FALLBACK_FILES = 1000;
const FALLBACK_PATTERNS = ['*', '*/*', '*/*/*', '*/*/*/*'];
const IGNORE_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'build', 'dist', '.next', '.cache']);

// ─── Git types ───────────────────────────────────────────────────────────────

export type GitFileStatus =
  | 'index-modified' | 'index-added' | 'index-deleted' | 'index-renamed' | 'index-copied'
  | 'modified' | 'deleted' | 'untracked' | 'ignored'
  | 'both-modified' | 'both-added' | 'added-by-us' | 'added-by-them' | 'deleted-by-us' | 'deleted-by-them' | 'both-deleted'
  | 'type-changed' | 'intent-to-add';

export interface GitStatusEntry {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  originalPath?: string; // for renames
}

export interface GitSyncStatus {
  ahead: number;
  behind: number;
  remote: string | null;
  branchName: string | null;
}

let GIT_ENV = { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8', GIT_PAGER: 'cat' };

// ─── Git helper functions ────────────────────────────────────────────────────

function getGitBranch(projectPath: string): string | undefined {
  try {
    const result = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    });
    return result.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getGithubPR(projectPath: string): GithubPR | null {
  try {
    const result = execSync(
      'gh pr view --json number,title,url,state,author,baseRefName,headRefName',
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 8000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    const data = JSON.parse(result.trim());
    return {
      number: data.number,
      title: data.title,
      url: data.url,
      state: data.state,
      author: data.author?.login ?? data.author ?? '',
      baseRef: data.baseRefName,
      headRef: data.headRefName,
    };
  } catch {
    return null;
  }
}

function normalizeCloneUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/^git\s+clone\s+/i, '').trim();
}

function inferCloneTargetName(repoUrl: string): string {
  const withoutQuery = repoUrl.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const tail = withoutQuery.split('/').pop() || withoutQuery.split(':').pop() || '';
  const withoutGitSuffix = tail.replace(/\.git$/i, '');
  const sanitized = withoutGitSuffix
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim();

  return sanitized || 'repository';
}

async function cloneRepository(repoUrl: string, parentPath?: string): Promise<string | null> {
  const normalizedUrl = normalizeCloneUrl(repoUrl);
  if (!normalizedUrl) {
    throw new Error('Repository URL is required');
  }

  if (!parentPath) {
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      defaultPath: os.homedir(),
      title: `Choose a folder to clone ${normalizedUrl} into`,
      buttonLabel: 'Select as Repository Destination',
    };

    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    parentPath = result.filePaths[0];
  }

  const targetName = inferCloneTargetName(normalizedUrl);

  try {
    execFileSync('git', ['clone', normalizedUrl, targetName], {
      cwd: parentPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    });
  } catch (e: any) {
    throw new Error(e.stderr?.trim() || e.message || 'Failed to clone repository');
  }

  const clonedPath = path.join(parentPath, targetName);
  if (!fs.existsSync(clonedPath)) {
    throw new Error('Repository was cloned but destination folder could not be found');
  }

  return clonedPath;
}

function listGitBranches(projectPath: string): { branches: string[]; current: string | null } {
  try {
    const result = execFileSync('git', ['branch', '--no-color', '--sort=-committerdate'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    });
    const lines = result.trim().split('\n').filter(Boolean);
    let current: string | null = null;
    const branches = lines.map((line) => {
      const isCurrent = line.startsWith('* ');
      const name = line.replace(/^\*?\s+/, '').trim();
      if (isCurrent) current = name;
      return name;
    });
    return { branches, current };
  } catch {
    return { branches: [], current: null };
  }
}

function switchGitBranch(projectPath: string, branchName: string): { success: boolean; error?: string; promotedWorktreePath?: string } {
  try {
    const repoRoot = getGitRepoRoot(projectPath) || projectPath;
    const worktreeToPromote = listGitWorktrees(repoRoot).find(
      (wt) => !wt.isMain && !wt.isBare && wt.branch === branchName,
    );

    if (worktreeToPromote) {
      const worktreeStatus = execFileSync('git', ['status', '--porcelain', '-uall'], {
        cwd: worktreeToPromote.path,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });

      if (worktreeStatus.trim().length > 0) {
        return {
          success: false,
          error: `Branch ${branchName} is checked out in worktree ${worktreeToPromote.path}. Commit/stash/push changes there before promoting it to local.`,
        };
      }

      execFileSync('git', ['worktree', 'remove', worktreeToPromote.path], {
        cwd: repoRoot,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });

      execFileSync('git', ['checkout', branchName], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });

      return { success: true, promotedWorktreePath: worktreeToPromote.path };
    }

    execFileSync('git', ['checkout', branchName], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.stderr?.trim() || e.message || 'Failed to switch branch' };
  }
}

function pickFallbackLocalBranch(projectPath: string, currentBranch: string): string | null {
  const { branches } = listGitBranches(projectPath);
  if (branches.length === 0) return null;

  const repoRoot = getGitRepoRoot(projectPath) || projectPath;
  const checkedOutWorktreeBranches = new Set(
    listGitWorktrees(repoRoot)
      .filter((wt) => !wt.isMain && !wt.isBare)
      .map((wt) => wt.branch),
  );

  const availableBranches = branches.filter(
    (branch) => branch !== currentBranch && !checkedOutWorktreeBranches.has(branch),
  );

  if (availableBranches.length === 0) return null;

  const preferredBranches = ['main', 'master', 'develop', 'dev', 'trunk'];
  for (const preferred of preferredBranches) {
    if (availableBranches.includes(preferred)) return preferred;
  }

  return availableBranches[0];
}

function handoffLocalBranchToWorktree(projectPath: string, branchName: string): {
  success: boolean;
  worktreePath?: string;
  localBranch?: string;
  error?: string;
} {
  const localBranch = getGitBranch(projectPath);
  if (!localBranch) {
    return { success: false, error: 'Failed to determine local branch' };
  }

  if (localBranch !== branchName) {
    return {
      success: false,
      error: `Local checkout is on ${localBranch}, but this tile is on ${branchName}. Refresh and try again.`,
      localBranch,
    };
  }

  const fallbackLocalBranch = pickFallbackLocalBranch(projectPath, branchName);
  if (!fallbackLocalBranch) {
    return {
      success: false,
      error: `Cannot hand off ${branchName} to a worktree because no other local branch is available. Create another branch first.`,
      localBranch,
    };
  }

  const switchResult = switchGitBranch(projectPath, fallbackLocalBranch);
  if (!switchResult.success) {
    return {
      success: false,
      error: switchResult.error || `Failed to switch local checkout to ${fallbackLocalBranch}`,
      localBranch,
    };
  }

  const addResult = addGitWorktree(projectPath, branchName, false);
  if (addResult.success && addResult.worktreePath) {
    return { success: true, worktreePath: addResult.worktreePath, localBranch: fallbackLocalBranch };
  }

  const rollbackResult = switchGitBranch(projectPath, branchName);
  if (!rollbackResult.success) {
    return {
      success: false,
      error: `${addResult.error || 'Failed to create worktree'} Local checkout was moved to ${fallbackLocalBranch} and automatic rollback to ${branchName} failed: ${rollbackResult.error || 'unknown error'}.`,
      localBranch: fallbackLocalBranch,
    };
  }

  return {
    success: false,
    error: addResult.error || 'Failed to create worktree',
    localBranch: branchName,
  };
}

function createGitBranch(projectPath: string, branchName: string): { success: boolean; error?: string } {
  try {
    execFileSync('git', ['checkout', '-b', branchName], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.stderr?.trim() || e.message || 'Failed to create branch' };
  }
}

function parseXYStatus(x: string, y: string): { indexStatus: GitFileStatus | null; workTreeStatus: GitFileStatus | null } {
  let indexStatus: GitFileStatus | null = null;
  let workTreeStatus: GitFileStatus | null = null;

  // Merge conflicts
  if (x === 'D' && y === 'D') return { indexStatus: 'both-deleted', workTreeStatus: null };
  if (x === 'A' && y === 'U') return { indexStatus: 'added-by-us', workTreeStatus: null };
  if (x === 'U' && y === 'D') return { indexStatus: 'deleted-by-them', workTreeStatus: null };
  if (x === 'U' && y === 'A') return { indexStatus: 'added-by-them', workTreeStatus: null };
  if (x === 'D' && y === 'U') return { indexStatus: 'deleted-by-us', workTreeStatus: null };
  if (x === 'A' && y === 'A') return { indexStatus: 'both-added', workTreeStatus: null };
  if (x === 'U' && y === 'U') return { indexStatus: 'both-modified', workTreeStatus: null };

  // Untracked
  if (x === '?' && y === '?') return { indexStatus: null, workTreeStatus: 'untracked' };

  // Ignored
  if (x === '!' && y === '!') return { indexStatus: null, workTreeStatus: 'ignored' };

  // Index (staged) statuses
  switch (x) {
    case 'M': indexStatus = 'index-modified'; break;
    case 'T': indexStatus = 'type-changed'; break;
    case 'A': indexStatus = 'index-added'; break;
    case 'D': indexStatus = 'index-deleted'; break;
    case 'R': indexStatus = 'index-renamed'; break;
    case 'C': indexStatus = 'index-copied'; break;
  }

  // Working tree (unstaged) statuses
  switch (y) {
    case 'M': workTreeStatus = 'modified'; break;
    case 'D': workTreeStatus = 'deleted'; break;
    case 'T': workTreeStatus = 'type-changed'; break;
    case 'A': workTreeStatus = 'intent-to-add'; break;
  }

  return { indexStatus, workTreeStatus };
}

function getGitStatus(projectPath: string): GitStatusEntry[] {
  try {
    const result = execFileSync('git', ['status', '-z', '-uall'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    });

    const entries: GitStatusEntry[] = [];
    // -z format: entries separated by NUL. For renames/copies: "XY ORIG\0NEW\0", others: "XY PATH\0"
    const parts = result.split('\0');

    let i = 0;
    while (i < parts.length) {
      const raw = parts[i];
      if (raw.length < 3) { i++; continue; } // skip empty trailing parts

      const x = raw[0];
      const y = raw[1];
      // raw[2] is a space separator
      const filePath = raw.slice(3);

      let originalPath: string | undefined;
      // Renames and copies have an extra NUL-separated path
      if (x === 'R' || x === 'C') {
        i++;
        originalPath = filePath;   // first path is the original (source)
        const newPath = parts[i];  // second path is the destination
        if (newPath === undefined) { i++; continue; }

        const { indexStatus, workTreeStatus } = parseXYStatus(x, y);

        if (indexStatus) {
          entries.push({ path: newPath, status: indexStatus, staged: true, originalPath });
        }
        if (workTreeStatus) {
          entries.push({ path: newPath, status: workTreeStatus, staged: false, originalPath });
        }
        i++;
        continue;
      }

      const { indexStatus, workTreeStatus } = parseXYStatus(x, y);

      // Merge conflict entries are not "staged" in the normal sense
      const isConflict = ['both-modified', 'both-added', 'both-deleted', 'added-by-us', 'added-by-them', 'deleted-by-us', 'deleted-by-them'].includes(indexStatus || '');

      if (isConflict && indexStatus) {
        entries.push({ path: filePath, status: indexStatus, staged: false });
      } else {
        if (indexStatus) {
          entries.push({ path: filePath, status: indexStatus, staged: true });
        }
        if (workTreeStatus) {
          entries.push({ path: filePath, status: workTreeStatus, staged: false });
        }
      }

      i++;
    }

    return entries;
  } catch {
    return [];
  }
}

function getGitFileDiff(projectPath: string, filePath: string, staged: boolean): { original: string; modified: string } | null {
  try {
    const relativePath = filePath.startsWith('/') ? path.relative(projectPath, filePath) : filePath;

    let original = '';
    try {
      original = execFileSync('git', ['show', `HEAD:${relativePath}`], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });
    } catch {
      // File doesn't exist in HEAD (new file)
      original = '';
    }

    let modified: string;
    if (staged) {
      // Staged: compare HEAD vs index
      try {
        modified = execFileSync('git', ['show', `:${relativePath}`], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: GIT_ENV,
        });
      } catch {
        modified = '';
      }
    } else {
      // Unstaged: compare index vs working tree
      const absolutePath = path.join(projectPath, relativePath);
      modified = fs.readFileSync(absolutePath, 'utf-8');
      // For unstaged, original should be the index version, not HEAD
      try {
        original = execFileSync('git', ['show', `:${relativePath}`], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: GIT_ENV,
        });
      } catch {
        // Fall back to HEAD if no index version
      }
    }

    return { original, modified };
  } catch {
    return null;
  }
}

function getGitSyncStatus(projectPath: string): GitSyncStatus {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    }).trim();

    let ahead = 0, behind = 0, remote: string | null = null;

    try {
      const upstream = execFileSync('git', ['rev-parse', '--abbrev-ref', '@{upstream}'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      }).trim();
      remote = upstream;

      const counts = execFileSync('git', ['rev-list', '--left-right', '--count', `${upstream}...HEAD`], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      }).trim();
      const [behindStr, aheadStr] = counts.split(/\s+/);
      behind = parseInt(behindStr, 10) || 0;
      ahead = parseInt(aheadStr, 10) || 0;
    } catch {
      // No upstream set
    }

    return { ahead, behind, remote, branchName: branch };
  } catch {
    return { ahead: 0, behind: 0, remote: null, branchName: null };
  }
}

// ─── Git worktree functions ──────────────────────────────────────────────────

function getGitRepoRoot(projectPath: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    }).trim();
  } catch {
    return null;
  }
}

function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 10);
}

function sanitizePathSegment(value: string, fallback: string, maxLength = 40): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '')
    .slice(0, maxLength);
  return sanitized || fallback;
}

function getGlobalWorktreeDir(repoRoot: string, branch: string): string {
  const baseDir = path.join(app.getPath('userData'), 'worktrees');
  const repoName = sanitizePathSegment(path.basename(repoRoot), 'repo');
  const branchName = sanitizePathSegment(branch, 'branch');
  const repoKey = `${repoName}-${shortHash(repoRoot)}`;
  const branchKey = `${branchName}-${shortHash(branch)}`;
  return path.join(baseDir, repoKey, branchKey);
}

function isManagedWorktreePath(worktreePath: string): boolean {
  const baseDir = path.join(app.getPath('userData'), 'worktrees');
  const resolvedBaseDir = path.resolve(baseDir);
  const resolvedWorktreePath = path.resolve(worktreePath);
  return resolvedWorktreePath === resolvedBaseDir || resolvedWorktreePath.startsWith(`${resolvedBaseDir}${path.sep}`);
}

function cleanupWorktreeIfOrphaned(project: Project | null | undefined): void {
  const worktreePath = project?.worktreePath;
  if (!project || !worktreePath || !isManagedWorktreePath(worktreePath)) return;

  const stillReferenced = Array.from(tileProjects.values()).some(
    (tileProject) => tileProject?.path === project.path && tileProject?.worktreePath === worktreePath,
  );
  if (stillReferenced) return;

  removeGitWorktree(project.path, worktreePath);
}

function listGitWorktrees(projectPath: string): WorktreeInfo[] {
  try {
    const result = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    });

    const worktrees: WorktreeInfo[] = [];
    const blocks = result.split('\n\n').filter(Boolean);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      let wtPath = '';
      let branch = '';
      let isBare = false;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.slice('worktree '.length);
        } else if (line.startsWith('branch ')) {
          // branch refs/heads/main -> main
          branch = line.slice('branch '.length).replace('refs/heads/', '');
        } else if (line === 'bare') {
          isBare = true;
        } else if (line === 'detached') {
          branch = '(detached)';
        }
      }

      if (wtPath) {
        const repoRoot = getGitRepoRoot(projectPath);
        worktrees.push({
          path: wtPath,
          branch,
          isMain: wtPath === repoRoot,
          isBare,
        });
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

function addGitWorktree(projectPath: string, branch: string, newBranch: boolean, startPoint?: string): { success: boolean; worktreePath?: string; error?: string } {
  try {
    const repoRoot = getGitRepoRoot(projectPath) || projectPath;
    const worktreeDir = getGlobalWorktreeDir(repoRoot, branch);

    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });

    const args = ['worktree', 'add'];
    if (newBranch) {
      args.push('-b', branch);
    }
    args.push(worktreeDir);
    if (!newBranch) {
      args.push(branch);
    } else if (startPoint) {
      args.push(startPoint);
    }

    execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    });

    return { success: true, worktreePath: worktreeDir };
  } catch (e: any) {
    return { success: false, error: e.stderr?.trim() || e.message || 'Failed to add worktree' };
  }
}

function removeGitWorktree(projectPath: string, worktreePath: string): { success: boolean; error?: string } {
  try {
    const repoRoot = getGitRepoRoot(projectPath) || projectPath;
    execFileSync('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: GIT_ENV,
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.stderr?.trim() || e.message || 'Failed to remove worktree' };
  }
}

function listProjectFiles(projectPath: string): string[] {
  try {
    const result = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
      env: GIT_ENV,
    });

    const files = result
      .split('\0')
      .filter(Boolean);

    return Array.from(new Set(files)).sort((a, b) => a.localeCompare(b));
  } catch {
    return listFilesWithGlob(projectPath);
  }
}

// ─── Linear API functions ────────────────────────────────────────────────────

async function getLinearApiKey(): Promise<string | null> {
  try {
    const settings = await storage.loadSettings();
    return settings.apiKeys?.linearApiKey || null;
  } catch {
    return null;
  }
}

async function checkLinearAuth(): Promise<LinearAuthStatus> {
  const apiKey = await getLinearApiKey();
  if (!apiKey) {
    return { authenticated: false };
  }

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({
        query: `query { viewer { id email name } }`,
      }),
    });

    if (!response.ok) {
      return { authenticated: false, error: 'Invalid API key' };
    }

    const data = await response.json() as { errors?: Array<{ message: string }>; data?: { viewer: { email: string; name: string } } };
    if (data.errors) {
      return { authenticated: false, error: data.errors[0]?.message || 'API error' };
    }

    return {
      authenticated: true,
      email: data.data?.viewer.email,
      name: data.data?.viewer.name,
    };
  } catch (e: any) {
    return { authenticated: false, error: e.message || 'Failed to connect to Linear' };
  }
}

async function searchLinearIssues(query: string): Promise<LinearSearchResult> {
  const apiKey = await getLinearApiKey();
  if (!apiKey) {
    return { issues: [], error: 'Linear API key not configured' };
  }

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({
        query: `
          query SearchIssues($query: String!) {
            issueSearch(query: $query, first: 20) {
              nodes {
                id
                identifier
                title
                description
                url
                priority
                state {
                  name
                  color
                }
                assignee {
                  name
                  email
                }
                labels {
                  nodes {
                    name
                    color
                  }
                }
              }
            }
          }
        `,
        variables: { query },
      }),
    });

    if (!response.ok) {
      return { issues: [], error: 'Failed to search Linear issues' };
    }

    const data = await response.json() as { errors?: Array<{ message: string }>; data?: { issueSearch: { nodes: any[] } } };
    if (data.errors) {
      return { issues: [], error: data.errors[0]?.message || 'API error' };
    }

    const issues: LinearIssue[] = (data.data?.issueSearch.nodes || []).map((node: any) => ({
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      description: node.description,
      url: node.url,
      priority: node.priority,
      state: {
        name: node.state.name,
        color: node.state.color,
      },
      assignee: node.assignee ? {
        name: node.assignee.name,
        email: node.assignee.email,
      } : undefined,
      labels: (node.labels?.nodes || []).map((l: any) => ({
        name: l.name,
        color: l.color,
      })),
      comments: [],
      attachments: [],
    }));

    return { issues };
  } catch (e: any) {
    return { issues: [], error: e.message || 'Failed to search Linear issues' };
  }
}

async function getLinearIssue(issueId: string): Promise<LinearIssue | null> {
  const apiKey = await getLinearApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({
        query: `
          query GetIssue($id: String!) {
            issue(id: $id) {
              id
              identifier
              title
              description
              url
              priority
              state {
                name
                color
              }
              assignee {
                name
                email
              }
              labels {
                nodes {
                  name
                  color
                }
              }
              comments {
                nodes {
                  body
                  user {
                    name
                  }
                  createdAt
                }
              }
              attachments {
                nodes {
                  url
                  title
                }
              }
            }
          }
        `,
        variables: { id: issueId },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { errors?: Array<{ message: string }>; data?: { issue: any } };
    if (data.errors || !data.data?.issue) {
      return null;
    }

    const node = data.data.issue;
    return {
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      description: node.description,
      url: node.url,
      priority: node.priority,
      state: {
        name: node.state.name,
        color: node.state.color,
      },
      assignee: node.assignee ? {
        name: node.assignee.name,
        email: node.assignee.email,
      } : undefined,
      labels: (node.labels?.nodes || []).map((l: any) => ({
        name: l.name,
        color: l.color,
      })),
      comments: (node.comments?.nodes || []).map((c: any) => ({
        body: c.body,
        user: { name: c.user?.name || 'Unknown' },
        createdAt: c.createdAt,
      })),
      attachments: (node.attachments?.nodes || []).map((a: any) => ({
        url: a.url,
        title: a.title,
      })),
    };
  } catch {
    return null;
  }
}

function listFilesWithGlob(projectPath: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  function walkDir(dir: string, depth: number, maxDepth: number): void {
    if (depth > maxDepth || files.length >= MAX_FALLBACK_FILES) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= MAX_FALLBACK_FILES) return;
        if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(projectPath, fullPath);

        if (entry.isFile()) {
          if (!seen.has(relativePath)) {
            seen.add(relativePath);
            files.push(relativePath);
          }
        } else if (entry.isDirectory()) {
          walkDir(fullPath, depth + 1, maxDepth);
        }
      }
    } catch {}
  }

  walkDir(projectPath, 0, 4);
  return files.sort((a, b) => a.localeCompare(b));
}

let mainWindow: BrowserWindow | null = null;
let isWindowFocused = true;
const tileProjects = new Map<string, Project | null>();

export function isAppFocused(): boolean {
  return isWindowFocused;
}

export function showAgentCompletionNotification(projectName?: string): void {
  if (isWindowFocused || !Notification.isSupported()) return;

  const notification = new Notification({
    title: 'Baby SWE',
    body: projectName ? `Agent completed in ${projectName}` : 'Agent run completed',
    silent: false,
  });

  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  notification.show();
}

function updateWindowTitle(): void {
  if (!mainWindow) return;
  mainWindow.setTitle('Baby SWE');
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { label: `Hide ${app.name}`, accelerator: 'Cmd+Alt+H', click: () => app.hide() },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function getUserShellEnv(): Record<string, string> {
  const shell = process.env.SHELL || '/bin/zsh';
  const commandArgs: string[][] = [
    ['-il', '-c'],
    ['-l', '-c'],
    ['-i', '-c'],
  ];

  for (const args of commandArgs) {
    try {
      const mark = require('crypto').randomBytes(8).toString('hex');
      const command = `echo '${mark}'; env; echo '${mark}'`;
      const result = execFileSync(shell, [...args, command], {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Extract only the content between the two markers to strip shell noise
      const start = result.indexOf(mark);
      const end = result.lastIndexOf(mark);
      if (start === -1 || start === end) continue;

      const envBlock = result.slice(start + mark.length, end);
      const env: Record<string, string> = { ...process.env as Record<string, string> };
      for (const line of envBlock.split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0) {
          env[line.slice(0, idx)] = line.slice(idx + 1);
        }
      }
      return env;
    } catch {
      // Try next shell mode
    }
  }

  return process.env as Record<string, string>;
}

const userShellEnv = getUserShellEnv();
Object.assign(process.env, userShellEnv);
GIT_ENV = { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8', GIT_PAGER: 'cat' };

function setupTerminalIPC(): void {
  ipcMain.on('terminal:create', (_event, id: string, cwd?: string) => {
    if (terminals.has(id)) return;

    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh';
    
    try {
      const term = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: cwd || process.env.HOME || '/',
        env: userShellEnv,
      });

      terminals.set(id, term);

      term.onData((data) => {
        mainWindow?.webContents.send('terminal:data', id, data);
      });

      term.onExit(() => {
        terminals.delete(id);
      });
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      
      let helpMessage = `\x1b[31mError: Terminal failed to start\x1b[0m\r\n\r\n`;
      helpMessage += `${errorMessage}\r\n\r\n`;
      helpMessage += `\x1b[33mPlease report this issue at:\x1b[0m\r\n`;
      helpMessage += `\x1b[36mhttps://github.com/langchain-ai/baby-swe/issues\x1b[0m\r\n\r\n`;
      helpMessage += `Platform: ${process.platform}, Arch: ${process.arch}\r\n`;
      
      mainWindow?.webContents.send('terminal:data', id, helpMessage);
      mainWindow?.webContents.send('terminal:error', id, errorMessage);
    }
  });

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    const term = terminals.get(id);
    if (term) {
      term.write(data);
    }
  });

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    const term = terminals.get(id);
    if (term) {
      term.resize(cols, rows);
    }
  });

  ipcMain.on('terminal:destroy', (_event, id: string) => {
    const term = terminals.get(id);
    if (term) {
      term.kill();
      terminals.delete(id);
    }
  });
}

function setupAppIPC(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion());
}

function setupStorageIPC(): void {
  ipcMain.handle('storage:getSettings', () => storage.loadSettings());

  ipcMain.handle('storage:saveSettings', (_event, settings) => {
    storage.saveSettings(settings);
  });

  ipcMain.handle('storage:getRecentProjects', () => storage.getRecentProjects());

  ipcMain.handle('storage:loadThreadsForProject', (_event, projectId: string) => {
    return storage.loadThreadsForProject(projectId);
  });

  ipcMain.handle('storage:saveThread', (_event, projectId: string, thread: any) => {
    storage.saveThread(projectId, thread);
  });

  ipcMain.handle('storage:deleteThread', (_event, projectId: string, threadId: string) => {
    storage.deleteThread(projectId, threadId);
  });

  ipcMain.handle('tile:openProject', async (_event, tileId: string, folderPath?: string) => {
    const previousProject = tileProjects.get(tileId);
    if (!folderPath) {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      folderPath = result.filePaths[0];
    }

    const project = storage.getOrCreateProject(folderPath);
    storage.migrateFromFolderStorage(project);
    const gitBranch = getGitBranch(folderPath);
    const githubPR = getGithubPR(folderPath);
    const projectWithBranch = { ...project, gitBranch, githubPR };
    tileProjects.set(tileId, projectWithBranch);
    mainWindow?.webContents.send('tile:projectChanged', tileId, projectWithBranch);
    cleanupWorktreeIfOrphaned(previousProject);
    return projectWithBranch;
  });

  ipcMain.handle('tile:cloneRepository', async (_event, repoUrl: string, parentPath?: string) => {
    return cloneRepository(repoUrl, parentPath);
  });

  ipcMain.handle('tile:openWorktree', async (_event, tileId: string, mainProjectPath: string, worktreePath: string) => {
    const previousProject = tileProjects.get(tileId);
    const gitBranch = getGitBranch(worktreePath);
    const githubPR = getGithubPR(worktreePath);
    const project = storage.getOrCreateProject(mainProjectPath);
    const projectWithWorktree: Project = {
      ...project,
      gitBranch,
      githubPR,
      worktreePath,
      worktreeType: 'worktree',
    };
    tileProjects.set(tileId, projectWithWorktree);
    mainWindow?.webContents.send('tile:projectChanged', tileId, projectWithWorktree);
    cleanupWorktreeIfOrphaned(previousProject);
    return projectWithWorktree;
  });

  ipcMain.handle('tile:closeProject', (_event, tileId: string) => {
    const previousProject = tileProjects.get(tileId);
    tileProjects.delete(tileId);
    mainWindow?.webContents.send('tile:projectChanged', tileId, null);
    cleanupWorktreeIfOrphaned(previousProject);
  });

  ipcMain.handle('fs:listFiles', (_event, projectPath?: string) => {
    if (!projectPath) return [];
    return listProjectFiles(projectPath);
  });

  ipcMain.handle('git:listBranches', (_event, projectPath: string) => {
    return listGitBranches(projectPath);
  });

  ipcMain.handle('git:switchBranch', (_event, projectPath: string, branchName: string) => {
    const result = switchGitBranch(projectPath, branchName);
    if (result.success) {
      const updatedBranch = getGitBranch(projectPath) || branchName;

      for (const [tileId, project] of tileProjects.entries()) {
        // Update local checkout tiles
        if (project?.path === projectPath && !project.worktreePath) {
          const updatedProject = { ...project, gitBranch: updatedBranch, githubPR: null };
          tileProjects.set(tileId, updatedProject);
          mainWindow?.webContents.send('tile:projectChanged', tileId, updatedProject);
          continue;
        }

        // If this branch was promoted from a worktree, move tiles off that removed worktree
        if (result.promotedWorktreePath && project?.path === projectPath && project.worktreePath === result.promotedWorktreePath) {
          const updatedProject: Project = {
            ...project,
            gitBranch: updatedBranch,
            githubPR: null,
            worktreePath: undefined,
            worktreeType: 'local',
          };
          tileProjects.set(tileId, updatedProject);
          mainWindow?.webContents.send('tile:projectChanged', tileId, updatedProject);
        }
      }

      setTimeout(() => {
        const githubPR = getGithubPR(projectPath);
        for (const [tileId, project] of tileProjects.entries()) {
          if (project?.path === projectPath && !project.worktreePath && project.gitBranch === updatedBranch) {
            const refreshedProject = { ...project, githubPR };
            tileProjects.set(tileId, refreshedProject);
            mainWindow?.webContents.send('tile:projectChanged', tileId, refreshedProject);
          }
        }
      }, 0);
    }
    return result;
  });

  ipcMain.handle('git:handoffToWorktree', (_event, projectPath: string, branchName: string) => {
    const result = handoffLocalBranchToWorktree(projectPath, branchName);
    const actualLocalBranch = getGitBranch(projectPath);

    if (actualLocalBranch) {
      for (const [tileId, project] of tileProjects.entries()) {
        if (project?.path === projectPath && !project.worktreePath) {
          const updatedProject: Project = {
            ...project,
            gitBranch: actualLocalBranch,
            githubPR: null,
            worktreePath: undefined,
            worktreeType: 'local',
          };
          tileProjects.set(tileId, updatedProject);
          mainWindow?.webContents.send('tile:projectChanged', tileId, updatedProject);
        }
      }

      setTimeout(() => {
        const githubPR = getGithubPR(projectPath);
        for (const [tileId, project] of tileProjects.entries()) {
          if (project?.path === projectPath && !project.worktreePath && project.gitBranch === actualLocalBranch) {
            const refreshedProject = { ...project, githubPR };
            tileProjects.set(tileId, refreshedProject);
            mainWindow?.webContents.send('tile:projectChanged', tileId, refreshedProject);
          }
        }
      }, 0);
    }

    return result;
  });

  ipcMain.handle('git:getPR', (_event, projectPath: string) => {
    return getGithubPR(projectPath);
  });

  ipcMain.handle('git:createBranch', (_event, projectPath: string, branchName: string) => {
    const result = createGitBranch(projectPath, branchName);
    if (result.success) {
      const updatedBranch = getGitBranch(projectPath) || branchName;

      for (const [tileId, project] of tileProjects.entries()) {
        // Only update tiles on the local checkout, not worktree tiles
        if (project?.path === projectPath && !project.worktreePath) {
          const updatedProject = { ...project, gitBranch: updatedBranch, githubPR: null };
          tileProjects.set(tileId, updatedProject);
          mainWindow?.webContents.send('tile:projectChanged', tileId, updatedProject);
        }
      }

      setTimeout(() => {
        const githubPR = getGithubPR(projectPath);
        for (const [tileId, project] of tileProjects.entries()) {
          if (project?.path === projectPath && !project.worktreePath && project.gitBranch === updatedBranch) {
            const refreshedProject = { ...project, githubPR };
            tileProjects.set(tileId, refreshedProject);
            mainWindow?.webContents.send('tile:projectChanged', tileId, refreshedProject);
          }
        }
      }, 0);
    }
    return result;
  });

  ipcMain.handle('git:syncLocalBranch', (_event, projectPath: string) => {
    const currentBranch = getGitBranch(projectPath);
    if (!currentBranch) return { synced: false };

    let synced = false;
    for (const [tileId, project] of tileProjects.entries()) {
      if (project?.path === projectPath && !project.worktreePath && project.gitBranch !== currentBranch) {
        const updatedProject = { ...project, gitBranch: currentBranch };
        tileProjects.set(tileId, updatedProject);
        mainWindow?.webContents.send('tile:projectChanged', tileId, updatedProject);
        synced = true;
      }
    }

    if (synced) {
      setTimeout(() => {
        const githubPR = getGithubPR(projectPath);
        for (const [tileId, project] of tileProjects.entries()) {
          if (project?.path === projectPath && !project.worktreePath && project.gitBranch === currentBranch) {
            const refreshedProject = { ...project, githubPR };
            tileProjects.set(tileId, refreshedProject);
            mainWindow?.webContents.send('tile:projectChanged', tileId, refreshedProject);
          }
        }
      }, 0);
    }

    return { synced, branch: currentBranch };
  });

  ipcMain.handle('git:diffFile', (_event, projectPath: string, filePath: string, staged: boolean) => {
    return getGitFileDiff(projectPath, filePath, staged);
  });

  ipcMain.handle('git:status', (_event, projectPath: string) => {
    return getGitStatus(projectPath);
  });

  ipcMain.handle('git:stageFile', (_event, projectPath: string, filePath: string) => {
    try {
      execFileSync('git', ['add', '--', filePath], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.stderr?.trim() || e.message || 'Failed to stage file' };
    }
  });

  ipcMain.handle('git:unstageFile', (_event, projectPath: string, filePath: string) => {
    try {
      execFileSync('git', ['restore', '--staged', '--', filePath], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.stderr?.trim() || e.message || 'Failed to unstage file' };
    }
  });

  ipcMain.handle('git:discardFile', (_event, projectPath: string, filePath: string, isUntracked: boolean) => {
    try {
      if (isUntracked) {
        execFileSync('git', ['clean', '-f', '--', filePath], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: GIT_ENV,
        });
      } else {
        execFileSync('git', ['checkout', '--', filePath], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: GIT_ENV,
        });
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.stderr?.trim() || e.message || 'Failed to discard file' };
    }
  });

  ipcMain.handle('git:stageAll', (_event, projectPath: string) => {
    try {
      execFileSync('git', ['add', '-A'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.stderr?.trim() || e.message || 'Failed to stage all' };
    }
  });

  ipcMain.handle('git:unstageAll', (_event, projectPath: string) => {
    try {
      execFileSync('git', ['reset', 'HEAD'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });
      return { success: true };
    } catch (e: any) {
      // On initial commit, use rm --cached
      try {
        execFileSync('git', ['rm', '--cached', '-r', '.'], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: GIT_ENV,
        });
        return { success: true };
      } catch (e2: any) {
        return { success: false, error: e2.stderr?.trim() || e2.message || 'Failed to unstage all' };
      }
    }
  });

  ipcMain.handle('git:discardAll', (_event, projectPath: string) => {
    try {
      execFileSync('git', ['checkout', '--', '.'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });
      // Also clean untracked files
      execFileSync('git', ['clean', '-fd'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.stderr?.trim() || e.message || 'Failed to discard all' };
    }
  });

  ipcMain.handle('git:commit', (_event, projectPath: string, message: string) => {
    try {
      execFileSync('git', ['commit', '-m', message], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: GIT_ENV,
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.stderr?.trim() || e.message || 'Failed to commit' };
    }
  });

  ipcMain.handle('git:push', (_event, projectPath: string) => {
    const pushEnv = { ...userShellEnv, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8', GIT_PAGER: 'cat' };
    try {
      execFileSync('git', ['push'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: pushEnv,
      });
      return { success: true };
    } catch (e: any) {
      try {
        const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: GIT_ENV,
        }).trim();
        execFileSync('git', ['push', '--set-upstream', 'origin', branch], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 30000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: pushEnv,
        });
        return { success: true };
      } catch (e2: any) {
        return { success: false, error: e2.stderr?.trim() || e2.message || 'Failed to push' };
      }
    }
  });

  ipcMain.handle('git:pull', (_event, projectPath: string) => {
    const pullEnv = { ...userShellEnv, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8', GIT_PAGER: 'cat' };
    try {
      execFileSync('git', ['pull'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: pullEnv,
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.stderr?.trim() || e.message || 'Failed to pull' };
    }
  });

  ipcMain.handle('git:syncStatus', (_event, projectPath: string) => {
    return getGitSyncStatus(projectPath);
  });

  // ─── Worktree IPC handlers ────────────────────────────────────────────────

  ipcMain.handle('git:listWorktrees', (_event, projectPath: string) => {
    return listGitWorktrees(projectPath);
  });

  ipcMain.handle('git:addWorktree', (_event, projectPath: string, branch: string, newBranch?: boolean, startPoint?: string) => {
    const result = addGitWorktree(projectPath, branch, newBranch ?? false, startPoint);
    return result;
  });

  ipcMain.handle('git:removeWorktree', (_event, projectPath: string, worktreePath: string) => {
    const result = removeGitWorktree(projectPath, worktreePath);
    if (result.success) {
      for (const [tileId, project] of tileProjects.entries()) {
        if (project?.path === projectPath && project.worktreePath === worktreePath) {
          const updatedProject: Project = {
            ...project,
            gitBranch: getGitBranch(projectPath),
            githubPR: getGithubPR(projectPath),
            worktreePath: undefined,
            worktreeType: 'local',
          };
          tileProjects.set(tileId, updatedProject);
          mainWindow?.webContents.send('tile:projectChanged', tileId, updatedProject);
        }
      }
    }
    return result;
  });

  // ─── Linear IPC handlers ────────────────────────────────────────────────

  ipcMain.handle('linear:authStatus', () => {
    return checkLinearAuth();
  });

  ipcMain.handle('linear:search', (_event, query: string) => {
    return searchLinearIssues(query);
  });

  ipcMain.handle('linear:getIssue', (_event, issueId: string) => {
    return getLinearIssue(issueId);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 450,
    minHeight: 600,
    title: 'Baby SWE',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#1a2332',
    icon: path.join(__dirname, 'assets', 'icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open all links in the external browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow!.webContents.getURL()) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('focus', () => {
    isWindowFocused = true;
  });

  mainWindow.on('blur', () => {
    isWindowFocused = false;
  });
}

app.whenReady().then(() => {
  storage.initStorage();
  createMenu();
  setupAppIPC();
  setupStorageIPC();
  setupTerminalIPC();
  createWindow();
  setupAgentIPC(
    mainWindow!,
    (tileId: string) => {
      const project = tileProjects.get(tileId);
      if (!project) return null;
      // Use worktree path if available, otherwise main project path
      return project.worktreePath || project.path;
    },
    (tileId: string) => tileProjects.get(tileId) || null,
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
