import { useEffect, useRef } from 'react';

export interface ModelOption {
  id: string;
  name: string;
  effort?: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'claude-opus-4-6', name: 'Opus 4.6' },
  { id: 'claude-sonnet-4-5', name: 'Sonnet 4.5' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
  { id: 'kimi-k2.5', name: 'Kimi K2.5' },
];

interface ModelAutocompleteProps {
  selectedIndex: number;
  currentModelId: string;
  currentEffort?: string;
  onSelect: (model: ModelOption) => void;
}

export function ModelAutocomplete({ selectedIndex, currentModelId, currentEffort, onSelect }: ModelAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);

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
      {AVAILABLE_MODELS.map((model, idx) => {
        const isSelected = idx === selectedIndex;
        const isCurrent = model.id === currentModelId && (model.effort || undefined) === (currentEffort || undefined);

        return (
          <button
            key={model.id}
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

export function getModelCount(): number {
  return AVAILABLE_MODELS.length;
}

export function getModelAtIndex(index: number): ModelOption | null {
  return AVAILABLE_MODELS[index] ?? null;
}
