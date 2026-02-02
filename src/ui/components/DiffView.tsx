import { useState, useMemo } from 'react';
import type { DiffData } from '../../types';

interface DiffViewProps {
  diffData: DiffData;
}

const CONTEXT_LINES = 3;
const MAX_COLLAPSED_LINES = 20;

type DiffLineData = {
  type: 'context' | 'remove' | 'add' | 'separator';
  text: string;
  oldLineNum?: number;
  newLineNum?: number;
};

function computeDiffLines(
  originalContent: string | null,
  newContent: string
): DiffLineData[] {
  const oldLines = originalContent?.split('\n') ?? [];
  const newLines = newContent.split('\n');

  if (originalContent === null) {
    return newLines.map((line, idx) => ({
      type: 'add' as const,
      text: line,
      newLineNum: idx + 1,
    }));
  }

  const result: DiffLineData[] = [];

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({
        type: 'context',
        text: oldLines[i],
        oldLineNum: i + 1,
        newLineNum: j + 1,
      });
      i++;
      j++;
    } else {
      let foundMatch = false;
      for (let lookAhead = 1; lookAhead <= 5; lookAhead++) {
        if (i + lookAhead < oldLines.length && j < newLines.length &&
            oldLines[i + lookAhead] === newLines[j]) {
          for (let k = 0; k < lookAhead; k++) {
            result.push({
              type: 'remove',
              text: oldLines[i + k],
              oldLineNum: i + k + 1,
            });
          }
          i += lookAhead;
          foundMatch = true;
          break;
        }
        if (j + lookAhead < newLines.length && i < oldLines.length &&
            newLines[j + lookAhead] === oldLines[i]) {
          for (let k = 0; k < lookAhead; k++) {
            result.push({
              type: 'add',
              text: newLines[j + k],
              newLineNum: j + k + 1,
            });
          }
          j += lookAhead;
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        if (i < oldLines.length) {
          result.push({
            type: 'remove',
            text: oldLines[i],
            oldLineNum: i + 1,
          });
          i++;
        }
        if (j < newLines.length) {
          result.push({
            type: 'add',
            text: newLines[j],
            newLineNum: j + 1,
          });
          j++;
        }
      }
    }
  }

  return result;
}

function filterToHunks(lines: DiffLineData[], contextLines: number = CONTEXT_LINES): DiffLineData[] {
  const changeIndices: number[] = [];
  lines.forEach((line, idx) => {
    if (line.type === 'add' || line.type === 'remove') {
      changeIndices.push(idx);
    }
  });

  if (changeIndices.length === 0) {
    return [];
  }

  const includeSet = new Set<number>();
  for (const idx of changeIndices) {
    for (let i = Math.max(0, idx - contextLines); i <= Math.min(lines.length - 1, idx + contextLines); i++) {
      includeSet.add(i);
    }
  }

  const result: DiffLineData[] = [];
  let lastIncluded = -2;

  for (let i = 0; i < lines.length; i++) {
    if (includeSet.has(i)) {
      if (lastIncluded >= 0 && i - lastIncluded > 1) {
        result.push({ type: 'separator', text: '···' });
      }
      result.push(lines[i]);
      lastIncluded = i;
    }
  }

  return result;
}

export function DiffView({ diffData }: DiffViewProps) {
  const [expanded, setExpanded] = useState(false);

  const { originalContent, newContent, filePath, isNewFile, isBinary } = diffData;

  if (isBinary) {
    return (
      <div className="mt-2 text-gray-500 text-xs font-mono">
        Binary file - diff not available
      </div>
    );
  }

  const allDiffLines = useMemo(
    () => computeDiffLines(originalContent, newContent),
    [originalContent, newContent]
  );

  const hunkLines = useMemo(
    () => filterToHunks(allDiffLines),
    [allDiffLines]
  );

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const line of allDiffLines) {
      if (line.type === 'add') additions++;
      else if (line.type === 'remove') deletions++;
    }
    return { additions, deletions };
  }, [allDiffLines]);

  const displayLines = expanded ? hunkLines : hunkLines.slice(0, MAX_COLLAPSED_LINES);
  const hasMoreLines = hunkLines.length > MAX_COLLAPSED_LINES;
  const hiddenCount = hunkLines.length - MAX_COLLAPSED_LINES;

  if (hunkLines.length === 0) {
    return (
      <div className="mt-2 text-gray-500 text-xs font-mono">
        No changes
      </div>
    );
  }

  return (
    <div className="mt-2 font-mono text-xs">
      <div className="flex items-center gap-2 text-gray-500 mb-1">
        <span className="text-gray-400">{filePath.split('/').pop()}</span>
        {isNewFile && <span>(new)</span>}
        <span className="text-green-400">+{stats.additions}</span>
        <span className="text-red-400">-{stats.deletions}</span>
      </div>

      <div className="max-h-60 overflow-auto border-l border-gray-700 pl-2">
        {displayLines.map((line, idx) => {
          if (line.type === 'separator') {
            return (
              <div key={idx} className="text-gray-600 py-0.5">
                ···
              </div>
            );
          }

          const isAdd = line.type === 'add';
          const isRemove = line.type === 'remove';

          return (
            <div
              key={idx}
              className={`whitespace-pre ${
                isAdd ? 'bg-green-900/30' :
                isRemove ? 'bg-red-900/30' : ''
              }`}
            >
              <span className="text-gray-600 w-8 inline-block text-right pr-2">
                {line.oldLineNum || line.newLineNum || ''}
              </span>
              <span className={`w-4 inline-block ${
                isAdd ? 'text-green-400' :
                isRemove ? 'text-red-400' : 'text-gray-600'
              }`}>
                {isAdd ? '+' : isRemove ? '-' : ' '}
              </span>
              <span className={
                isAdd ? 'text-green-300' :
                isRemove ? 'text-red-300' : 'text-gray-400'
              }>
                {line.text}
              </span>
            </div>
          );
        })}
      </div>

      {hasMoreLines && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-1 text-xs text-cyan-400 hover:text-cyan-300"
        >
          +{hiddenCount} more lines
        </button>
      )}
      {expanded && hasMoreLines && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-1 text-xs text-cyan-400 hover:text-cyan-300"
        >
          Show less
        </button>
      )}
    </div>
  );
}
