import { useStore } from '../../store';

const MODELS: Record<string, string> = {
  'claude-sonnet-4-5-20250514': 'Sonnet 4.5',
  'claude-opus-4-5-20250514': 'Opus 4.5',
};

export function HeaderBar() {
  const { currentProject, modelConfig } = useStore();

  const modelLabel = MODELS[modelConfig.name] || modelConfig.name;
  const projectPath = currentProject?.path || '~';
  const displayPath = projectPath.replace(/^\/Users\/[^/]+/, '~');

  return (
    <div className="flex items-start gap-4 px-4 py-3 font-mono text-sm">
      <pre className="text-[#e07a5f] leading-none text-xs">
{` ╭───╮
 │ ◠ │
 ╰───╯`}
      </pre>
      <div className="flex flex-col gap-0.5">
        <span className="text-gray-200 font-semibold">Baby SWE v0.1.0</span>
        <span className="text-gray-500">{modelLabel} · Claude API</span>
        <span className="text-gray-500">{displayPath}</span>
      </div>
    </div>
  );
}
