import type { Thread, GlobalSettings, Project } from './types';

export async function loadSettings(): Promise<GlobalSettings> {
  return window.storage.getSettings();
}

export async function saveSettings(settings: GlobalSettings): Promise<void> {
  await window.storage.saveSettings(settings);
}

export async function loadRecentProjects(): Promise<Project[]> {
  return window.storage.getRecentProjects();
}

export async function loadThreads(): Promise<Thread[]> {
  return window.storage.getThreads();
}

export async function saveThread(thread: Thread): Promise<void> {
  await window.storage.saveThread(thread);
}

export async function deleteThread(threadId: string): Promise<void> {
  await window.storage.deleteThread(threadId);
}
