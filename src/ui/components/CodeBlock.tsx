interface CodeBlockProps {
  text: string;
  language?: string;
}

export function CodeBlock({ text, language }: CodeBlockProps) {
  return (
    <div className="my-2 border border-gray-700 rounded-lg overflow-hidden">
      {language && (
        <div className="bg-gray-800 px-3 py-1 text-xs text-gray-500 border-b border-gray-700">
          {language}
        </div>
      )}
      <pre className="p-3 text-gray-300 text-sm overflow-x-auto bg-gray-900">
        <code>{text}</code>
      </pre>
    </div>
  );
}
