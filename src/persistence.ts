import type { GlobalSettings, Project } from './types';

export async function loadSettings(): Promise<GlobalSettings> {
  return window.storage.getSettings();
}

export async function saveSettings(settings: GlobalSettings): Promise<void> {
  await window.storage.saveSettings(settings);
}

export async function loadRecentProjects(): Promise<Project[]> {
  return window.storage.getRecentProjects();
}
