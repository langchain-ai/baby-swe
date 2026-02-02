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
      <div className="mt-2 p-3 bg-[#161b22] border border-[#30363d] rounded-md">
        <span className="text-gray-400 text-sm">Binary file - diff not available</span>
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
      <div className="mt-2 p-3 bg-[#161b22] border border-[#30363d] rounded-md">
        <span className="text-gray-400 text-sm">No changes</span>
      </div>
    );
  }

  return (
    <div className="mt-2 bg-[#0d1117]/60 border border-[#30363d] rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-medium text-gray-300">
            {isNewFile ? filePath.split('/').pop() : filePath.split('/').pop()}
          </span>
          {isNewFile && (
            <span className="text-xs text-gray-500">(new file)</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-green-400">+{stats.additions}</span>
          <span className="text-red-400">-{stats.deletions}</span>
        </div>
      </div>

      <div className="max-h-80 overflow-auto">
        <table className="w-full border-collapse font-mono text-xs">
          <tbody>
            {displayLines.map((line, idx) => {
              if (line.type === 'separator') {
                return (
                  <tr key={idx} className="bg-[#161b22]">
                    <td colSpan={3} className="px-2 py-1 text-center text-gray-500">
                      ···
                    </td>
                  </tr>
                );
              }

              const isAdd = line.type === 'add';
              const isRemove = line.type === 'remove';

              return (
                <tr
                  key={idx}
                  className={
                    isAdd ? 'bg-green-900/20' :
                    isRemove ? 'bg-red-900/20' : ''
                  }
                >
                  <td className="w-10 select-none border-r border-[#30363d]/50 px-2 text-right text-gray-600">
                    {line.oldLineNum || ''}
                  </td>
                  <td className="w-10 select-none border-r border-[#30363d]/50 px-2 text-right text-gray-600">
                    {line.newLineNum || ''}
                  </td>
                  <td className="whitespace-pre px-2">
                    <span className={`mr-2 inline-block w-3 text-center ${
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMoreLines && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-3 py-2 text-xs text-cyan-400 hover:text-cyan-300 border-t border-[#30363d] bg-[#161b22] flex items-center justify-center gap-1"
        >
          <span>Show {hiddenCount} more lines</span>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
      {expanded && hasMoreLines && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full px-3 py-2 text-xs text-cyan-400 hover:text-cyan-300 border-t border-[#30363d] bg-[#161b22] flex items-center justify-center gap-1"
        >
          <span>Show less</span>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
