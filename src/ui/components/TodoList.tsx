import type { TodoItem } from '../../types';

interface TodoListProps {
  todos: TodoItem[];
}

function StatusIcon({ status }: { status: TodoItem['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <span className="w-4 h-4 rounded border border-gray-500 flex-shrink-0" />
      );
    case 'in_progress':
      return (
        <span className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin flex-shrink-0" />
      );
    case 'completed':
      return (
        <span className="w-4 h-4 rounded bg-green-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      );
  }
}

export function TodoList({ todos }: TodoListProps) {
  if (todos.length === 0) return null;

  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const pending = todos.filter(t => t.status === 'pending').length;

  return (
    <div className="my-4 bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="text-gray-300 text-sm font-medium">Tasks</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {completed > 0 && (
            <span className="text-green-400">{completed} done</span>
          )}
          {inProgress > 0 && (
            <span className="text-cyan-400">{inProgress} active</span>
          )}
          {pending > 0 && (
            <span className="text-gray-500">{pending} pending</span>
          )}
        </div>
      </div>
      <div className="px-3 py-2 space-y-2">
        {todos.map((todo, index) => (
          <div
            key={index}
            className={`flex items-start gap-3 py-1 ${
              todo.status === 'completed' ? 'opacity-60' : ''
            }`}
          >
            <div className="mt-0.5">
              <StatusIcon status={todo.status} />
            </div>
            <span
              className={`text-sm ${
                todo.status === 'completed'
                  ? 'text-gray-500 line-through'
                  : todo.status === 'in_progress'
                  ? 'text-gray-200'
                  : 'text-gray-400'
              }`}
            >
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
