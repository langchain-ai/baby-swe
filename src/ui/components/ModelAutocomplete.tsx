import { useEffect, useRef } from 'react';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4-5-20250514', name: 'Sonnet 4.5', description: 'Fast and capable' },
  { id: 'claude-opus-4-5-20250514', name: 'Opus 4.5', description: 'Most intelligent' },
];

interface ModelAutocompleteProps {
  selectedIndex: number;
  currentModelId: string;
  onSelect: (model: ModelOption) => void;
}

export function ModelAutocomplete({ selectedIndex, currentModelId, onSelect }: ModelAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl overflow-hidden"
    >
      <div className="px-4 py-2 text-xs text-gray-500 font-medium border-b border-[#2a3142]">
        Select Model
      </div>
      {AVAILABLE_MODELS.map((model, idx) => {
        const isSelected = idx === selectedIndex;
        const isCurrent = model.id === currentModelId;

        return (
          <button
            key={model.id}
            data-selected={isSelected}
            onClick={() => onSelect(model)}
            className={`w-full px-4 py-2 text-left flex items-center gap-3 transition-colors ${
              isSelected ? 'bg-[#2a3142]' : 'hover:bg-[#252a3a]'
            }`}
          >
            <span className="text-gray-200 font-medium">{model.name}</span>
            <span className="text-gray-500 text-sm">{model.description}</span>
            {isCurrent && (
              <span className="ml-auto text-xs text-[#5a9bc7]">current</span>
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
