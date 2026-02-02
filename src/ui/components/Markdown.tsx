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
        h1: ({ children }) => <h1 className="text-sm font-semibold text-gray-100 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold text-gray-100 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-medium text-gray-100 mb-1">{children}</h3>,
        p: ({ children }) => <p className="mb-1 last:mb-0 text-sm">{children}</p>,
        a: ({ href, children }) => (
          <a className="text-cyan-400 hover:text-cyan-300 underline text-sm" href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="list-disc list-inside ml-3 space-y-0.5 text-sm">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside ml-3 space-y-0.5 text-sm">{children}</ol>,
        li: ({ children }) => <li className="text-gray-200 text-sm">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-700 pl-2 text-gray-400 text-sm">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-gray-700 my-1" />,
        table: ({ children }) => (
          <div className="font-mono text-xs text-gray-400 my-1 overflow-x-auto">
            <table className="border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-gray-700">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => (
          <th className="px-2 py-0.5 text-left text-gray-300 font-medium">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-0.5 text-gray-400">{children}</td>
        ),
        code: ({ inline, className, children }) => {
          const text = extractText(children);
          if (inline) {
            return <code className="px-1 py-0.5 rounded bg-[#1a1f2e] text-cyan-300 font-mono text-xs">{text}</code>;
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
