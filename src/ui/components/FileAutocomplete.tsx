import { useEffect, useRef, useState } from 'react';

interface FileAutocompleteProps {
  query: string;
  selectedIndex: number;
  onSelect: (filePath: string) => void;
}

const MAX_SUGGESTIONS = 10;
const MIN_FUZZY_SCORE = 15;
const MIN_FUZZY_RATIO = 0.4;

function pathDepth(path: string): number {
  return path.split('/').length - 1;
}

function isDotPath(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.'));
}

function sequenceMatcherRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [];
    for (let j = 0; j <= b.length; j++) {
      if (i === 0 || j === 0) {
        matrix[i][j] = 0;
      } else if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  const lcsLength = matrix[a.length][b.length];
  return (2 * lcsLength) / (a.length + b.length);
}

function fuzzyScore(query: string, candidate: string): number {
  const queryLower = query.toLowerCase();
  const candidateLower = candidate.toLowerCase();
  const filename = candidate.split('/').pop()?.toLowerCase() || '';
  const filenameStart = candidateLower.lastIndexOf('/') + 1;

  if (queryLower && filename.includes(queryLower)) {
    const idx = filename.indexOf(queryLower);
    if (idx === 0) {
      return 150 + 1 / candidate.length;
    }
    if (idx > 0 && '_-.'.includes(filename[idx - 1])) {
      return 120 + 1 / candidate.length;
    }
    return 100 + 1 / candidate.length;
  }

  if (queryLower && candidateLower.includes(queryLower)) {
    const idx = candidateLower.indexOf(queryLower);
    if (idx === filenameStart) {
      return 80 + 1 / candidate.length;
    }
    if (idx === 0 || '/_-.'.includes(candidate[idx - 1])) {
      return 60 + 1 / candidate.length;
    }
    return 40 + 1 / candidate.length;
  }

  const filenameRatio = sequenceMatcherRatio(queryLower, filename);
  if (filenameRatio > MIN_FUZZY_RATIO) {
    return filenameRatio * 30;
  }

  const ratio = sequenceMatcherRatio(queryLower, candidateLower);
  return ratio * 15;
}

function fuzzySearch(query: string, candidates: string[], limit: number = MAX_SUGGESTIONS): string[] {
  const includeDotfiles = query.startsWith('.');
  const filtered = includeDotfiles ? candidates : candidates.filter((c) => !isDotPath(c));

  if (!query) {
    const sorted = [...filtered].sort((a, b) => {
      const depthDiff = pathDepth(a) - pathDepth(b);
      if (depthDiff !== 0) return depthDiff;
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    return sorted.slice(0, limit);
  }

  const scored: [number, string][] = [];
  for (const candidate of filtered) {
    const score = fuzzyScore(query, candidate);
    if (score >= MIN_FUZZY_SCORE) {
      scored.push([score, candidate]);
    }
  }

  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map(([, c]) => c);
}

function getFileExtension(path: string): string {
  const filename = path.split('/').pop() || '';
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === 0) return '';
  return filename.slice(dotIndex + 1);
}

export function FileAutocomplete({ query, selectedIndex, onSelect }: FileAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    window.fs.listFiles().then((result) => {
      if (mounted) {
        setFiles(result);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const suggestions = fuzzySearch(query, files);

  if (loading) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl overflow-hidden">
        <div className="px-4 py-3 text-gray-500 text-sm">Loading files...</div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl overflow-hidden">
        <div className="px-4 py-3 text-gray-500 text-sm">No files found</div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl overflow-hidden max-h-[300px] overflow-y-auto"
    >
      {suggestions.map((filePath, idx) => {
        const isSelected = idx === selectedIndex;
        const ext = getFileExtension(filePath);

        return (
          <button
            key={filePath}
            data-selected={isSelected}
            onClick={() => onSelect(filePath)}
            className={`w-full px-4 py-2 text-left flex items-center gap-3 transition-colors ${
              isSelected ? 'bg-[#2a3142]' : 'hover:bg-[#252a3a]'
            }`}
          >
            <span className="text-cyan-400">@</span>
            <span className="text-gray-200 font-medium truncate flex-1">{filePath}</span>
            {ext && <span className="text-gray-500 text-sm">{ext}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function getFileSuggestionsCount(query: string, files: string[]): number {
  return fuzzySearch(query, files).length;
}

export function getFileAtIndex(query: string, files: string[], index: number): string | null {
  const suggestions = fuzzySearch(query, files);
  return suggestions[index] ?? null;
}

export { fuzzySearch };
