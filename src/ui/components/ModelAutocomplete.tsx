import { useEffect, useRef } from 'react';
import type { AgentHarness } from '../../types';

export interface ModelOption {
  id: string;
  name: string;
  effort?: string;
}

export const CURSOR_MODELS: ModelOption[] = [
  { id: 'claude-opus-4-6', name: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex Medium', effort: 'medium' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex High', effort: 'high' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex Extra High', effort: 'extra-high' },
  { id: 'gpt-5.4', name: 'GPT-5.4 Medium', effort: 'medium' },
  { id: 'gpt-5.4', name: 'GPT-5.4 High', effort: 'high' },
  { id: 'gpt-5.4', name: 'GPT-5.4 Extra High', effort: 'extra-high' },
];

export const DEEPAGENTS_MODELS: ModelOption[] = [
  { id: 'claude-opus-4-6', name: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex Medium', effort: 'medium' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex High', effort: 'high' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex Extra High', effort: 'extra-high' },
  { id: 'gpt-5.4', name: 'GPT-5.4 Medium', effort: 'medium' },
  { id: 'gpt-5.4', name: 'GPT-5.4 High', effort: 'high' },
  { id: 'gpt-5.4', name: 'GPT-5.4 Extra High', effort: 'extra-high' },
  { id: 'kimi-k2.5', name: 'Kimi K2.5' },
];

export const CLAUDE_AGENT_MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
];

export const CODEX_MODELS: ModelOption[] = [
  { id: 'codex-mini', name: 'Codex Mini' },
  { id: 'o3', name: 'o3' },
  { id: 'o4-mini', name: 'o4-mini' },
];

export function getModelsForHarness(harness: AgentHarness): ModelOption[] {
  switch (harness) {
    case 'deepagents':
      return DEEPAGENTS_MODELS;
    case 'claude-agent':
      return CLAUDE_AGENT_MODELS;
    case 'codex':
      return CODEX_MODELS;
    case 'cursor':
    default:
      return CURSOR_MODELS;
  }
}

export const AVAILABLE_MODELS: ModelOption[] = CURSOR_MODELS;

interface ModelAutocompleteProps {
  selectedIndex: number;
  currentModelId: string;
  currentEffort?: string;
  harness: AgentHarness;
  onSelect: (model: ModelOption) => void;
}

export function ModelAutocomplete({ selectedIndex, currentModelId, currentEffort, harness, onSelect }: ModelAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const models = getModelsForHarness(harness);

  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl overflow-hidden max-h-[300px] overflow-y-auto"
    >
      <div className="px-4 py-2 text-xs text-gray-500 font-medium border-b border-[#2a3142] sticky top-0 bg-[#1a1f2e]">
        Select Model
      </div>
      {models.map((model, idx) => {
        const isSelected = idx === selectedIndex;
        const isCurrent = model.id === currentModelId && (model.effort || undefined) === (currentEffort || undefined);

        return (
          <button
            key={`${model.id}-${model.effort ?? ''}`}
            data-selected={isSelected}
            onClick={() => onSelect(model)}
            className={`w-full px-4 py-2 text-left flex items-center gap-3 transition-colors ${
              isSelected ? 'bg-[#2a3142]' : 'hover:bg-[#252a3a]'
            }`}
          >
            <span className={isCurrent ? 'text-gray-200 font-medium' : 'text-gray-400'}>{model.name}</span>
            {isCurrent && (
              <span className="ml-auto text-gray-400">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function getModelCount(harness: AgentHarness): number {
  return getModelsForHarness(harness).length;
}

export function getModelAtIndex(index: number, harness: AgentHarness): ModelOption | null {
  return getModelsForHarness(harness)[index] ?? null;
}
