import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
    <div className="leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <div className="text-gray-100 font-bold mt-3 mb-1">{children}</div>,
          h2: ({ children }) => <div className="text-gray-100 font-bold mt-3 mb-1">{children}</div>,
          h3: ({ children }) => <div className="text-gray-100 font-semibold mt-2 mb-1">{children}</div>,
          p: ({ children }) => <div className="my-1">{children}</div>,
          a: ({ href, children }) => (
            <a className="text-[#87CEEB] underline" href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          ul: ({ children }) => <div className="ml-4 my-1">{children}</div>,
          ol: ({ children }) => <div className="ml-4 my-1">{children}</div>,
          li: ({ children }) => <div className="text-gray-200">• {children}</div>,
          blockquote: ({ children }) => (
            <div className="border-l-2 border-gray-600 pl-3 my-2 text-gray-400">{children}</div>
          ),
          hr: () => <hr className="border-gray-700 my-3" />,
          table: ({ children }) => (
            <div className="text-gray-400 overflow-x-auto my-2">
              <table className="border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-gray-700">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th className="px-3 py-1 text-left text-gray-300">{children}</th>,
          td: ({ children }) => <td className="px-3 py-1 text-gray-400">{children}</td>,
          code: ({ className, children }) => {
            const text = extractText(children);
            const match = /language-([^\s]+)/.exec(className || '');
            const isBlock = match || text.includes('\n');
            if (isBlock) {
              return (
                <pre className="bg-[#111827] rounded px-3 py-2 my-2 text-sm overflow-x-auto border-l-2 border-gray-700">
                  <code className="text-gray-300">{text.replace(/\n$/, '')}</code>
                </pre>
              );
            }
            return <code className="text-[#a8d8ea]">`{text}`</code>;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
