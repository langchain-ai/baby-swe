import { useEffect, useRef } from 'react';

interface FileAutocompleteProps {
  suggestions: string[];
  selectedIndex: number;
  onSelect: (filePath: string) => void;
  loading?: boolean;
}

interface IndexedFile {
  path: string;
  lowerPath: string;
  lowerFileName: string;
  depth: number;
  isDotPath: boolean;
}

export interface FileSearchIndex {
  entries: IndexedFile[];
  defaultVisibleSuggestions: string[];
  defaultAllSuggestions: string[];
}

export interface FileAutocompleteContext {
  atIndex: number;
  tokenEnd: number;
  fileQuery: string;
}

const MAX_SUGGESTIONS = 10;
const FILE_BOUNDARY_CHARS = '/_-.';
const ACTIVE_FILE_TAG_PATTERN = /(?:^|\s)@([^\s@]*)$/;

function pathDepth(path: string): number {
  return path.split('/').length - 1;
}

function isDotPath(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.'));
}

function compareDefaultSuggestionOrder(a: IndexedFile, b: IndexedFile): number {
  const depthDiff = a.depth - b.depth;
  if (depthDiff !== 0) return depthDiff;
  return a.lowerPath.localeCompare(b.lowerPath);
}

function isBoundaryChar(char: string | undefined): boolean {
  if (!char) return true;
  return FILE_BOUNDARY_CHARS.includes(char);
}

function subsequenceScore(query: string, candidate: string): number {
  if (!query || !candidate) return 0;

  let queryIndex = 0;
  let score = 0;
  let contiguousStreak = 0;
  let previousMatchIndex = -2;

  for (let i = 0; i < candidate.length && queryIndex < query.length; i++) {
    if (candidate[i] !== query[queryIndex]) continue;

    contiguousStreak = i === previousMatchIndex + 1 ? contiguousStreak + 1 : 1;
    score += 2 + contiguousStreak * 2;

    if (isBoundaryChar(candidate[i - 1])) {
      score += 6;
    }

    previousMatchIndex = i;
    queryIndex++;
  }

  return queryIndex === query.length ? score : 0;
}

function scoreCandidate(query: string, candidate: IndexedFile): number {
  if (candidate.lowerPath === query) return 5000;
  if (candidate.lowerFileName === query) return 4500;

  if (candidate.lowerFileName.startsWith(query)) {
    return 4000 - candidate.depth * 12 - candidate.lowerPath.length * 0.1;
  }

  if (candidate.lowerPath.startsWith(query)) {
    return 3500 - candidate.depth * 8 - candidate.lowerPath.length * 0.1;
  }

  const fileNameMatchIndex = candidate.lowerFileName.indexOf(query);
  if (fileNameMatchIndex !== -1) {
    const boundaryBonus = isBoundaryChar(candidate.lowerFileName[fileNameMatchIndex - 1]) ? 300 : 0;
    return 3000 + boundaryBonus - fileNameMatchIndex * 6 - candidate.depth * 8;
  }

  const pathMatchIndex = candidate.lowerPath.indexOf(query);
  if (pathMatchIndex !== -1) {
    const boundaryBonus = isBoundaryChar(candidate.lowerPath[pathMatchIndex - 1]) ? 200 : 0;
    return 2400 + boundaryBonus - pathMatchIndex * 4 - candidate.depth * 4;
  }

  const fileNameSubsequenceScore = subsequenceScore(query, candidate.lowerFileName);
  if (fileNameSubsequenceScore > 0) {
    return 1600 + fileNameSubsequenceScore - candidate.depth * 5;
  }

  const pathSubsequenceScore = subsequenceScore(query, candidate.lowerPath);
  if (pathSubsequenceScore > 0) {
    return 1000 + pathSubsequenceScore - candidate.depth * 3;
  }

  return 0;
}

export function buildFileSearchIndex(candidates: string[]): FileSearchIndex {
  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
  const entries = uniqueCandidates.map((path) => {
    const fileName = path.split('/').pop() || '';

    return {
      path,
      lowerPath: path.toLowerCase(),
      lowerFileName: fileName.toLowerCase(),
      depth: pathDepth(path),
      isDotPath: isDotPath(path),
    };
  });

  const defaultAllSuggestions = [...entries]
    .sort(compareDefaultSuggestionOrder)
    .map((entry) => entry.path)
    .slice(0, MAX_SUGGESTIONS);

  const defaultVisibleSuggestions = [...entries]
    .filter((entry) => !entry.isDotPath)
    .sort(compareDefaultSuggestionOrder)
    .map((entry) => entry.path)
    .slice(0, MAX_SUGGESTIONS);

  return {
    entries,
    defaultVisibleSuggestions,
    defaultAllSuggestions,
  };
}

export function searchFileSuggestions(index: FileSearchIndex, query: string, limit: number = MAX_SUGGESTIONS): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  const includeDotfiles = normalizedQuery.startsWith('.');

  if (!normalizedQuery) {
    const defaults = includeDotfiles ? index.defaultAllSuggestions : index.defaultVisibleSuggestions;
    return defaults.slice(0, limit);
  }

  const scored: Array<{ score: number; candidate: IndexedFile }> = [];

  for (const candidate of index.entries) {
    if (!includeDotfiles && candidate.isDotPath) continue;

    const score = scoreCandidate(normalizedQuery, candidate);
    if (score <= 0) continue;

    scored.push({ score, candidate });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.lowerPath.localeCompare(b.candidate.lowerPath);
  });

  return scored.slice(0, limit).map((result) => result.candidate.path);
}

function getFileExtension(path: string): string {
  const filename = path.split('/').pop() || '';
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === 0) return '';
  return filename.slice(dotIndex + 1);
}

export function getFileAutocompleteContext(query: string, cursorPosition: number): FileAutocompleteContext | null {
  const beforeCursor = query.slice(0, cursorPosition);
  const match = ACTIVE_FILE_TAG_PATTERN.exec(beforeCursor);
  if (!match) return null;

  const fileQuery = match[1] || '';
  const atIndex = beforeCursor.length - fileQuery.length - 1;

  let tokenEnd = cursorPosition;
  while (tokenEnd < query.length && !/\s/.test(query[tokenEnd] || '')) {
    tokenEnd++;
  }

  return {
    atIndex,
    tokenEnd,
    fileQuery,
  };
}

export function insertFileTag(query: string, filePath: string, context: FileAutocompleteContext): { nextQuery: string; nextCursor: number } {
  const prefix = query.slice(0, context.atIndex);
  const suffix = query.slice(context.tokenEnd);
  const needsTrailingSpace = suffix.length === 0 || !/^\s/.test(suffix);
  const insertion = `@${filePath}${needsTrailingSpace ? ' ' : ''}`;

  const nextQuery = prefix + insertion + suffix;
  const nextCursor = prefix.length + insertion.length;

  return { nextQuery, nextCursor };
}

export function FileAutocomplete({ suggestions, selectedIndex, onSelect, loading = false }: FileAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (loading) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl overflow-hidden">
        <div className="px-4 py-3 text-gray-500 text-sm">Indexing files...</div>
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
            <span className="text-[#87CEEB]">@</span>
            <span className="text-gray-200 font-medium truncate flex-1">{filePath}</span>
            {ext && <span className="text-gray-500 text-sm">{ext}</span>}
          </button>
        );
      })}
    </div>
  );
}
