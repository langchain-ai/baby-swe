import { useState, useCallback, useRef, memo } from 'react';
import type { LinearIssue, SelectedLinearIssue } from '../../types';

interface LinearAutocompleteProps {
  query: string;
  selectedIndex: number;
  onSelect: (issue: SelectedLinearIssue) => void;
  loading: boolean;
  issues: LinearIssue[];
}

export const LinearAutocomplete = memo(function LinearAutocomplete({
  query,
  selectedIndex,
  onSelect,
  loading,
  issues,
}: LinearAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);

  if (!query && !loading && issues.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#1a2332] border border-[#2a3142] rounded-lg shadow-lg overflow-hidden z-50">
        <div className="px-3 py-2 text-sm text-gray-400">
          Type to search Linear issues...
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#1a2332] border border-[#2a3142] rounded-lg shadow-lg overflow-hidden z-50">
        <div className="px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
          <span className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
          Searching Linear...
        </div>
      </div>
    );
  }

  if (issues.length === 0 && query) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#1a2332] border border-[#2a3142] rounded-lg shadow-lg overflow-hidden z-50">
        <div className="px-3 py-2 text-sm text-gray-400">
          No issues found for "{query}"
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-[#1a2332] border border-[#2a3142] rounded-lg shadow-lg overflow-hidden z-50 max-h-[300px] overflow-y-auto"
    >
      {issues.map((issue, index) => {
        const isSelected = index === selectedIndex;
        return (
          <button
            key={issue.id}
            type="button"
            onClick={() => {
              onSelect({
                id: issue.id,
                identifier: issue.identifier,
                title: issue.title,
                description: issue.description,
                url: issue.url,
                stateName: issue.state.name,
                stateColor: issue.state.color,
                comments: issue.comments,
                attachments: issue.attachments,
              });
            }}
            className={`w-full text-left px-3 py-2 flex items-start gap-3 transition-colors ${
              isSelected ? 'bg-[#2a3545]' : 'hover:bg-[#232d3d]'
            }`}
          >
            <span
              className="shrink-0 mt-0.5 w-2 h-2 rounded-full"
              style={{ backgroundColor: issue.state.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#5E6AD2]">
                  {issue.identifier}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${issue.state.color}20`,
                    color: issue.state.color,
                  }}
                >
                  {issue.state.name}
                </span>
              </div>
              <div className="text-sm text-gray-200 truncate mt-0.5">
                {issue.title}
              </div>
              {issue.assignee && (
                <div className="text-xs text-gray-500 mt-0.5">
                  Assigned to {issue.assignee.name}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
});

export function useLinearSearch() {
  const [query, setQuery] = useState('');
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    setError(null);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setIssues([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await window.linear.search(searchQuery);
        if (result.error) {
          setError(result.error);
          setIssues([]);
        } else {
          setIssues(result.issues);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
        setIssues([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const reset = useCallback(() => {
    setQuery('');
    setIssues([]);
    setLoading(false);
    setError(null);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  }, []);

  return {
    query,
    issues,
    loading,
    error,
    search,
    reset,
  };
}
