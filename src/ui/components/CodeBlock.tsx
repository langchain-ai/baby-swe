import { useEffect, useMemo, useState } from "react";
import { getSingletonHighlighter, type ThemedToken } from "shiki";

interface CodeBlockProps {
  text: string;
  language?: string;
}

const TOKEN_CACHE = new Map<string, ThemedToken[][]>();

function normalizeLanguage(language?: string): string {
  const raw = (language || "").toLowerCase().trim();
  if (!raw) return "text";

  const aliases: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    md: "markdown",
    yml: "yaml",
    sh: "bash",
    zsh: "bash",
    shell: "bash",
    py: "python",
    rb: "ruby",
    rs: "rust",
    csharp: "csharp",
    "c#": "csharp",
    plaintext: "text",
    txt: "text",
  };

  return aliases[raw] || raw;
}

function languageLabel(language: string): string {
  if (language === "text") return "text";
  if (language === "typescript") return "ts";
  if (language === "javascript") return "js";
  return language;
}

export function CodeBlock({ text, language }: CodeBlockProps) {
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);
  const displayLanguage = useMemo(() => languageLabel(normalizedLanguage), [normalizedLanguage]);

  useEffect(() => {
    let cancelled = false;
    setTokens(null);

    if (normalizedLanguage === "text") return;

    const cacheKey = `${normalizedLanguage}::${text}`;
    const cached = TOKEN_CACHE.get(cacheKey);
    if (cached) {
      setTokens(cached);
      return;
    }

    getSingletonHighlighter({
      themes: ["github-dark"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      langs: [normalizedLanguage as any],
    })
      .then((highlighter) => {
        if (cancelled) return;
        const result = highlighter.codeToTokens(text, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lang: normalizedLanguage as any,
          theme: "github-dark",
        });
        TOKEN_CACHE.set(cacheKey, result.tokens);
        setTokens(result.tokens);
      })
      .catch(() => {
        if (!cancelled) {
          setTokens(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [text, normalizedLanguage]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-2 rounded-xl bg-[var(--ui-accent-bubble)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        <span className="text-[color:var(--ui-text-muted)]">{displayLanguage}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text)] transition-colors"
          title="Copy code"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-3 pb-3 text-[12px] overflow-x-auto">
        {tokens ? (
          <code>
            {tokens.map((lineTokens, lineIndex) => (
              <div key={lineIndex} className="whitespace-pre">
                {lineTokens.map((token, tokenIndex) => (
                  <span key={tokenIndex} style={{ color: token.color }}>
                    {token.content}
                  </span>
                ))}
              </div>
            ))}
          </code>
        ) : (
          <code className="text-[color:var(--ui-text)]">{text}</code>
        )}
      </pre>
    </div>
  );
}
