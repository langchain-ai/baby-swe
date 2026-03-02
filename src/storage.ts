import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Project, GlobalSettings, ModelConfig, Thread } from './types';

const SETTINGS_FILE = 'settings.json';
const PROJECTS_FILE = 'projects.json';
const THREADS_DIR = 'threads';

function getDataPath(): string {
  return app.getPath('userData');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Failed to read ${filePath}:`, e);
  }
  return null;
}

function writeJsonFile(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function initStorage(): void {
  const dataPath = getDataPath();
  ensureDir(dataPath);
  ensureDir(path.join(dataPath, THREADS_DIR));
}

export function loadSettings(): GlobalSettings {
  const filePath = path.join(getDataPath(), SETTINGS_FILE);
  const settings = readJsonFile<GlobalSettings>(filePath);
  if (settings) return settings;

  return {
    version: 1,
    modelConfig: {
      name: 'claude-sonnet-4-6',
      provider: 'anthropic',
      effort: 'medium',
    },
    permissionMode: 'default',
    yoloMode: false,
  };
}

export function saveSettings(settings: GlobalSettings): void {
  const filePath = path.join(getDataPath(), SETTINGS_FILE);
  writeJsonFile(filePath, settings);
}

function loadProjects(): Project[] {
  const filePath = path.join(getDataPath(), PROJECTS_FILE);
  const data = readJsonFile<{ projects: Project[] }>(filePath);
  return data?.projects || [];
}

function saveProjects(projects: Project[]): void {
  const filePath = path.join(getDataPath(), PROJECTS_FILE);
  writeJsonFile(filePath, { projects });
}

export function getRecentProjects(limit = 10): Project[] {
  const projects = loadProjects();
  return projects
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, limit);
}

export function getProjectByPath(folderPath: string): Project | null {
  const projects = loadProjects();
  return projects.find((p) => p.path === folderPath) || null;
}

export function createProject(folderPath: string): Project {
  const projects = loadProjects();
  const now = Date.now();

  const project: Project = {
    id: uuidv4(),
    path: folderPath,
    name: path.basename(folderPath),
    createdAt: now,
    lastOpenedAt: now,
  };

  projects.push(project);
  saveProjects(projects);

  ensureDir(path.join(getDataPath(), THREADS_DIR, project.id));

  return project;
}

export function updateProjectLastOpened(projectId: string): void {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (project) {
    project.lastOpenedAt = Date.now();
    saveProjects(projects);
  }
}

export function getOrCreateProject(folderPath: string): Project {
  let project = getProjectByPath(folderPath);
  if (!project) {
    project = createProject(folderPath);
  }
  updateProjectLastOpened(project.id);
  return project;
}

export function loadThreadsForProject(projectId: string): Thread[] {
  const threadsDir = path.join(getDataPath(), THREADS_DIR, projectId);
  if (!fs.existsSync(threadsDir)) return [];

  const threads: Thread[] = [];
  const files = fs.readdirSync(threadsDir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const thread = readJsonFile<Thread>(path.join(threadsDir, file));
    if (thread) threads.push(thread);
  }

  return threads.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveThread(projectId: string, thread: Thread): void {
  const threadPath = path.join(getDataPath(), THREADS_DIR, projectId, `${thread.id}.json`);
  writeJsonFile(threadPath, { ...thread, projectId });
}

export function deleteThread(projectId: string, threadId: string): void {
  const threadPath = path.join(getDataPath(), THREADS_DIR, projectId, `${threadId}.json`);
  try {
    if (fs.existsSync(threadPath)) {
      fs.unlinkSync(threadPath);
    }
  } catch (e) {
    console.error('Failed to delete thread:', e);
  }
}

export function migrateFromFolderStorage(project: Project): number {
  const legacyPath = path.join(project.path, '.baby-swe', 'threads.json');
  if (!fs.existsSync(legacyPath)) return 0;

  try {
    const data = fs.readFileSync(legacyPath, 'utf-8');
    const threads: Omit<Thread, 'projectId'>[] = JSON.parse(data);

    for (const thread of threads) {
      saveThread(project.id, { ...thread, projectId: project.id });
    }

    fs.renameSync(legacyPath, legacyPath + '.migrated');
    console.log(`Migrated ${threads.length} threads from ${project.path}`);
    return threads.length;
  } catch (e) {
    console.error('Migration failed:', e);
    return 0;
  }
}
