import type { Thread, ModelConfig } from './types';

const MODEL_KEY = 'baby-swe-model';
const THREADS_FILE = 'threads.json';

export async function saveThreads(threads: Thread[]): Promise<void> {
  try {
    await window.folder.writeData(THREADS_FILE, JSON.stringify(threads));
  } catch (e) {
    console.error('Failed to save threads:', e);
  }
}

export async function loadThreads(): Promise<Thread[]> {
  try {
    const data = await window.folder.readData(THREADS_FILE);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load threads:', e);
    return [];
  }
}

export function saveModelConfig(config: ModelConfig): void {
  try {
    localStorage.setItem(MODEL_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save model config:', e);
  }
}

export function loadModelConfig(): ModelConfig | null {
  try {
    const data = localStorage.getItem(MODEL_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Failed to load model config:', e);
    return null;
  }
}
