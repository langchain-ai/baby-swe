import type { Thread, ModelConfig } from './types';

const STORAGE_KEY = 'baby-swe-threads';
const MODEL_KEY = 'baby-swe-model';

export function saveThreads(threads: Thread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch (e) {
    console.error('Failed to save threads:', e);
  }
}

export function loadThreads(): Thread[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
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
