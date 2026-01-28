interface CodeBlockProps {
  text: string;
  language?: string;
}

export function CodeBlock({ text, language }: CodeBlockProps) {
  return (
    <div className="my-3 bg-[#0d1117] border border-[#2a3142] rounded-lg overflow-hidden">
      {language && (
        <div className="bg-[#161b22] px-4 py-2 text-xs text-cyan-400 border-b border-[#2a3142] font-mono">
          {language}
        </div>
      )}
      <pre className="p-4 text-gray-300 text-sm overflow-x-auto font-mono">
        <code>{text}</code>
      </pre>
    </div>
  );
}
