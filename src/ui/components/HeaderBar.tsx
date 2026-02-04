import { useStore } from '../../store';
import type { Project } from '../../types';

const MODELS: Record<string, string> = {
  'claude-sonnet-4-5': 'Sonnet 4.5',
  'claude-opus-4-5': 'Opus 4.5',
  'gpt-5.2-codex': 'GPT-5.2 Codex',
};

const GPT_EFFORT_LABELS: Record<string, string> = {
  'low': 'GPT-5.2 Fast',
  'medium': 'GPT-5.2 High',
  'medium-fast': 'GPT-5.2 High Fast',
  'high': 'GPT-5.2 Extra High',
  'high-fast': 'GPT-5.2 Extra High Fast',
};

interface HeaderBarProps {
  project?: Project | null;
  compact?: boolean;
}

export function HeaderBar({ project, compact }: HeaderBarProps) {
  const { modelConfig } = useStore();

  const getModelLabel = () => {
    if (modelConfig.name === 'gpt-5.2' && modelConfig.effort) {
      return GPT_EFFORT_LABELS[modelConfig.effort] || `GPT-5.2 (${modelConfig.effort})`;
    }
    return MODELS[modelConfig.name] || modelConfig.name;
  };

  const modelLabel = getModelLabel();
  const apiLabel = modelConfig.name.startsWith('gpt-') ? 'OpenAI API' : 'Claude API';
  const projectPath = project?.path || '~';
  const displayPath = projectPath.replace(/^\/Users\/[^/]+/, '~');

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 font-mono text-xs border-b border-gray-700/50 shrink-0">
        <pre className="text-[#e07a5f] leading-none text-[10px]">{`╭─╮
│◠│
╰─╯`}</pre>
        <div className="flex items-center gap-2 text-gray-500 truncate">
          <span className="text-gray-300 font-medium">Baby SWE</span>
          <span>·</span>
          <span>{modelLabel}</span>
          <span>·</span>
          <span className="truncate">{displayPath}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 px-4 py-3 font-mono text-sm">
      <pre className="text-[#e07a5f] leading-none text-xs">
{` ╭───╮
 │ ◠ │
 ╰───╯`}
      </pre>
      <div className="flex flex-col gap-0.5">
        <span className="text-gray-200 font-semibold">Baby SWE v0.1.0</span>
        <span className="text-gray-500">{modelLabel} · {apiLabel}</span>
        <span className="text-gray-500">{displayPath}</span>
      </div>
    </div>
  );
}
