import { useState } from 'react';
import { useStore } from '../../store';
import type { Thread } from '../../types';

function getTimeGroup(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 14) return '1w ago';
  return `${Math.floor(days / 7)}w ago`;
}

function groupThreadsByTime(threads: Thread[]): Map<string, Thread[]> {
  const groups = new Map<string, Thread[]>();
  const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const thread of sorted) {
    const group = getTimeGroup(thread.updatedAt);
    const existing = groups.get(group) || [];
    groups.set(group, [...existing, thread]);
  }

  return groups;
}

interface Props {
  onClose: () => void;
}

export function ThreadHistory({ onClose }: Props) {
  const { threads, currentThreadId, switchThread, deleteThread, renameThread } = useStore();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const filtered = search
    ? threads.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
    : threads;

  const grouped = groupThreadsByTime(filtered);

  const handleThreadClick = (id: string) => {
    switchThread(id);
    onClose();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteThread(id);
  };

  const handleEditStart = (e: React.MouseEvent, thread: Thread) => {
    e.stopPropagation();
    setEditingId(thread.id);
    setEditValue(thread.title);
  };

  const handleEditSave = (id: string) => {
    if (editValue.trim()) {
      renameThread(id, editValue.trim());
    }
    setEditingId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleEditSave(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div className="absolute top-full right-0 mt-2 w-80 bg-[#12171f] border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
      <div className="p-3 border-b border-gray-700">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#1a1f2e] text-gray-200 text-sm px-3 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-gray-500"
          autoFocus
        />
      </div>
      <div className="max-h-96 overflow-y-auto">
        {grouped.size === 0 ? (
          <div className="p-4 text-gray-500 text-sm text-center">No threads yet</div>
        ) : (
          Array.from(grouped.entries()).map(([group, groupThreads]) => (
            <div key={group}>
              <div className="px-3 py-2 text-xs text-gray-500 font-medium">{group}</div>
              {groupThreads.map((thread) => (
                <div
                  key={thread.id}
                  onClick={() => handleThreadClick(thread.id)}
                  className={`px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-[#1a1f2e] group ${
                    thread.id === currentThreadId ? 'bg-[#1a1f2e]' : ''
                  }`}
                >
                  <ChatIcon />
                  {editingId === thread.id ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleEditSave(thread.id)}
                      onKeyDown={(e) => handleEditKeyDown(e, thread.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-[#0a0f1a] text-gray-200 text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-sm text-gray-300 truncate">{thread.title}</span>
                  )}
                  {thread.id === currentThreadId && editingId !== thread.id && (
                    <>
                      <span className="text-xs text-gray-500 px-2 py-0.5 bg-[#0a0f1a] rounded">
                        Current
                      </span>
                      <button
                        onClick={(e) => handleEditStart(e, thread)}
                        className="p-1 text-gray-500 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <EditIcon />
                      </button>
                    </>
                  )}
                  {editingId !== thread.id && (
                    <button
                      onClick={(e) => handleDelete(e, thread.id)}
                      className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-gray-500 flex-shrink-0"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
