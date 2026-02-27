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
    <div className="leading-6 text-[13px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <div className="text-[color:var(--ui-accent)] text-[20px] font-semibold mt-4 mb-2 tracking-tight">{children}</div>,
          h2: ({ children }) => <div className="text-[color:var(--ui-accent)] text-[17px] font-semibold mt-3 mb-2 tracking-tight">{children}</div>,
          h3: ({ children }) => <div className="text-[color:var(--ui-accent)] text-[15px] font-semibold mt-3 mb-1">{children}</div>,
          p: ({ children }) => <p className="my-1.5 text-[color:var(--ui-text)]">{children}</p>,
          a: ({ href, children }) => (
            <a className="text-[color:var(--ui-accent)] underline decoration-[color:var(--ui-accent)]/50" href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          ul: ({ children }) => <div className="ml-4 my-1.5">{children}</div>,
          ol: ({ children }) => <div className="ml-4 my-1.5">{children}</div>,
          li: ({ children }) => <div className="text-[color:var(--ui-text)] [&>p]:inline [&>p]:my-0">• {children}</div>,
          blockquote: ({ children }) => (
            <div className="border-l-2 border-[var(--ui-border)] pl-3 my-2 text-[color:var(--ui-text-muted)]">{children}</div>
          ),
          hr: () => <hr className="border-[var(--ui-border-subtle)] my-3" />,
          table: ({ children }) => (
            <div className="text-[color:var(--ui-text-muted)] overflow-x-auto my-2">
              <table className="border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-[var(--ui-border)]">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th className="px-3 py-1 text-left text-[color:var(--ui-accent)]">{children}</th>,
          td: ({ children }) => <td className="px-3 py-1 text-[color:var(--ui-text-muted)]">{children}</td>,
          code: ({ className, children }) => {
            const text = extractText(children);
            const match = /language-([^\s]+)/.exec(className || '');
            const isBlock = match || text.includes('\n');
            if (isBlock) {
              return (
                <pre className="bg-[var(--ui-panel)] rounded-xl px-3 py-2 my-2 text-[12px] overflow-x-auto border border-[var(--ui-border-subtle)]">
                  <code className="text-[color:var(--ui-text)]">{text.replace(/\n$/, '')}</code>
                </pre>
              );
            }
            return <code className="font-mono text-[0.85em] text-[color:var(--ui-accent)] bg-[var(--ui-panel-2)] px-1.5 py-0.5 rounded-md">{text}</code>;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
