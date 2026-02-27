import { useRef, useEffect, useState } from 'react';
import type { TodoItem } from '../../types';

interface TodoListProps {
  todos: TodoItem[];
}

function StatusIcon({ status }: { status: TodoItem['status'] }) {
  switch (status) {
    case 'pending':
      return <span className="text-gray-500">□</span>;
    case 'in_progress':
      return <span className="text-[#87CEEB] animate-pulse">↻</span>;
    case 'completed':
      return <span className="text-green-400">✓</span>;
  }
}

const MAX_HEIGHT = 160;

export function TodoList({ todos }: TodoListProps) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Find the first in-progress item and scroll it into view
    const firstActive = todos.findIndex(t => t.status === 'in_progress');
    const targetIndex = firstActive !== -1 ? firstActive : todos.length - 1;
    const targetEl = el.children[targetIndex] as HTMLElement | undefined;
    targetEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [todos]);

  if (todos.length === 0) return null;

  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const pending = todos.filter(t => t.status === 'pending').length;

  const statusParts: string[] = [];
  if (completed > 0) statusParts.push(`${completed} done`);
  if (inProgress > 0) statusParts.push(`${inProgress} active`);
  if (pending > 0) statusParts.push(`${pending} pending`);

  return (
    <div className="mt-1 mb-3 font-sans text-xs">
      <div
        className="flex items-center gap-2 text-gray-400 mb-1 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className="text-gray-600 text-xs">{collapsed ? '▶' : '▼'}</span>
        <span>Tasks</span>
        <span className="text-gray-600 text-xs">({statusParts.join(' — ')})</span>
      </div>
      {!collapsed && (
        <div
          ref={scrollRef}
          className="ml-3 border-l border-gray-700 pl-3 space-y-1 overflow-y-auto"
          style={{ maxHeight: MAX_HEIGHT }}
        >
          {todos.map((todo, index) => (
            <div
              key={index}
              className={`flex items-start gap-2 ${
                todo.status === 'completed' ? 'opacity-60' : ''
              }`}
            >
              <StatusIcon status={todo.status} />
              <span
                className={
                  todo.status === 'completed'
                    ? 'text-gray-500 line-through'
                    : todo.status === 'in_progress'
                    ? 'text-gray-200'
                    : 'text-gray-400'
                }
              >
                {todo.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
