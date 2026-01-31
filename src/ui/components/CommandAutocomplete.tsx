import { useEffect, useRef } from 'react';
import { filterCommandsByCategory, type Command, type CommandCategory } from '../../commands';

interface CommandAutocompleteProps {
  query: string;
  selectedIndex: number;
  onSelect: (command: Command) => void;
}

const CATEGORY_ORDER: CommandCategory[] = ['Actions', 'Navigation', 'Debug'];

export function CommandAutocomplete({ query, selectedIndex, onSelect }: CommandAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const grouped = filterCommandsByCategory(query);

  const flatList: Command[] = [];
  for (const category of CATEGORY_ORDER) {
    const commands = grouped.get(category);
    if (commands) flatList.push(...commands);
  }

  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (flatList.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl overflow-hidden">
        <div className="px-4 py-3 text-gray-500 text-sm">No commands found</div>
      </div>
    );
  }

  let currentIndex = 0;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl overflow-hidden max-h-[300px] overflow-y-auto"
    >
      {CATEGORY_ORDER.map((category) => {
        const commands = grouped.get(category);
        if (!commands || commands.length === 0) return null;

        return (
          <div key={category}>
            <div className="px-4 py-2 text-xs text-gray-500 font-medium sticky top-0 bg-[#1a1f2e]">
              {category}
            </div>
            {commands.map((cmd) => {
              const isSelected = currentIndex === selectedIndex;
              const idx = currentIndex;
              currentIndex++;

              return (
                <button
                  key={cmd.name}
                  data-selected={isSelected}
                  onClick={() => onSelect(cmd)}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 transition-colors ${
                    isSelected ? 'bg-[#2a3142]' : 'hover:bg-[#252a3a]'
                  }`}
                >
                  <span className="text-gray-200 font-medium">{cmd.name}</span>
                  <span className="text-gray-500 text-sm truncate">{cmd.description}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function getFilteredCommandCount(query: string): number {
  const grouped = filterCommandsByCategory(query);
  let count = 0;
  for (const commands of grouped.values()) {
    count += commands.length;
  }
  return count;
}

export function getCommandAtIndex(query: string, index: number): Command | null {
  const grouped = filterCommandsByCategory(query);
  const flatList: Command[] = [];
  for (const category of CATEGORY_ORDER) {
    const commands = grouped.get(category);
    if (commands) flatList.push(...commands);
  }
  return flatList[index] ?? null;
}
