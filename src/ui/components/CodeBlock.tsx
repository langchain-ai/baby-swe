interface CodeBlockProps {
  text: string;
  language?: string;
}

export function CodeBlock({ text }: CodeBlockProps) {
  return (
    <pre className="bg-[#111827] rounded px-2 py-1 text-gray-300 overflow-x-auto">
      <code>{text}</code>
    </pre>
  );
}
