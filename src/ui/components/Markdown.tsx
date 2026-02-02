import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

interface MarkdownProps {
  content: string;
}

function extractText(children: ReactNode): string {
  if (Array.isArray(children)) {
    return children.map((child) => (typeof child === 'string' ? child : '')).join('');
  }
  return typeof children === 'string' ? children : '';
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        h1: ({ children }) => <h1 className="text-xl font-semibold text-gray-100 mb-3">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-semibold text-gray-100 mb-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold text-gray-100 mb-2">{children}</h3>,
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        a: ({ href, children }) => (
          <a className="text-cyan-400 hover:text-cyan-300 underline" href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="list-disc list-inside ml-4 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside ml-4 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="text-gray-200">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-[#2a3142] pl-3 text-gray-300 italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-[#2a3142]" />,
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-[#2a3142] bg-[#161b22] px-3 py-2 text-left text-gray-200">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-[#2a3142] px-3 py-2 text-gray-300">{children}</td>
        ),
        code: ({ inline, className, children }) => {
          const text = extractText(children);
          if (inline) {
            return <code className="px-1 py-0.5 rounded bg-[#0d1117] text-cyan-300 font-mono text-sm">{text}</code>;
          }
          const match = /language-([^\s]+)/.exec(className || '');
          const language = match ? match[1] : undefined;
          return <CodeBlock text={text.replace(/\n$/, '')} language={language} />;
        },
        pre: ({ children }) => <>{children}</>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
