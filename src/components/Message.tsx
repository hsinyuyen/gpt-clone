import { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { addZhuyinAnnotations } from "@/utils/zhuyin";
import { useZhuyin } from "@/contexts/ZhuyinContext";
import { useAuth } from "@/contexts/AuthContext";

interface MessageProps {
  message: {
    role: "user" | "system";
    content: string | null;
  };
  avatarName?: string;
  streaming?: boolean;
  onStreamComplete?: () => void;
}

const CHARS_PER_TICK = 2;
const TICK_MS = 30;

// Custom markdown components styled for terminal theme
const mdComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const codeString = String(children).replace(/\n$/, "");

    if (!inline && match) {
      return (
        <div className="my-2 rounded overflow-hidden">
          <div className="flex items-center justify-between bg-[#1e1e1e] px-3 py-1 text-[10px] text-gray-400 border-b border-gray-700">
            <span>{match[1]}</span>
            <button
              onClick={() => navigator.clipboard.writeText(codeString)}
              className="hover:text-white transition-colors"
            >
              複製
            </button>
          </div>
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={match[1]}
            PreTag="div"
            customStyle={{ margin: 0, padding: "12px", fontSize: "12px", borderRadius: 0 }}
            {...props}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      );
    }

    if (!inline) {
      return (
        <div className="my-2 bg-[#1e1e1e] rounded p-3 overflow-x-auto">
          <code className="text-[var(--terminal-accent)] text-xs font-mono" {...props}>
            {children}
          </code>
        </div>
      );
    }

    return (
      <code className="bg-[var(--terminal-primary)]/15 text-[var(--terminal-accent)] px-1.5 py-0.5 rounded text-[0.9em] font-mono" {...props}>
        {children}
      </code>
    );
  },
  strong({ children }: any) {
    return <strong className="text-[var(--terminal-highlight)] font-bold">{children}</strong>;
  },
  em({ children }: any) {
    return <em className="text-[var(--terminal-primary)] italic">{children}</em>;
  },
  h1({ children }: any) {
    return <h1 className="text-lg font-bold text-[var(--terminal-highlight)] mt-3 mb-1">{children}</h1>;
  },
  h2({ children }: any) {
    return <h2 className="text-base font-bold text-[var(--terminal-highlight)] mt-3 mb-1">{children}</h2>;
  },
  h3({ children }: any) {
    return <h3 className="text-sm font-bold text-[var(--terminal-highlight)] mt-2 mb-1">{children}</h3>;
  },
  ul({ children }: any) {
    return <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>;
  },
  ol({ children }: any) {
    return <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>;
  },
  li({ children }: any) {
    return <li className="text-[var(--terminal-green)]">{children}</li>;
  },
  a({ href, children }: any) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--terminal-cyan)] underline hover:text-[var(--terminal-highlight)]">
        {children}
      </a>
    );
  },
  blockquote({ children }: any) {
    return (
      <blockquote className="border-l-2 border-[var(--terminal-primary-dim)] pl-3 my-2 text-[var(--terminal-primary-dim)] italic">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="border-[var(--terminal-primary-dim)] my-3" />;
  },
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full border border-[var(--terminal-primary-dim)] text-xs">{children}</table>
      </div>
    );
  },
  th({ children }: any) {
    return <th className="border border-[var(--terminal-primary-dim)] px-2 py-1 bg-[var(--terminal-primary)]/10 text-[var(--terminal-highlight)] text-left">{children}</th>;
  },
  td({ children }: any) {
    return <td className="border border-[var(--terminal-primary-dim)] px-2 py-1">{children}</td>;
  },
  p({ children }: any) {
    return <p className="my-1">{children}</p>;
  },
};

const Message = ({ message, avatarName, streaming, onStreamComplete }: MessageProps) => {
  const { role, content: text } = message;
  const { zhuyinMode, fontSize } = useZhuyin();
  const { user } = useAuth();
  const [displayedLength, setDisplayedLength] = useState(streaming ? 0 : (text?.length || 0));
  const completedRef = useRef(false);

  const aiDisplayName = avatarName || user?.avatar?.name || "AI";

  const fontSizeClass = {
    small: "text-xs",
    medium: "text-sm",
    large: "text-base",
  }[fontSize];

  const isUser = role === "user";
  const timestamp = new Date().toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Streaming animation
  useEffect(() => {
    if (!streaming || !text || isUser) {
      if (text) setDisplayedLength(text.length);
      return;
    }

    completedRef.current = false;
    setDisplayedLength(0);

    const timer = setInterval(() => {
      setDisplayedLength((prev) => {
        const next = prev + CHARS_PER_TICK;
        if (next >= text.length) {
          clearInterval(timer);
          if (!completedRef.current) {
            completedRef.current = true;
            onStreamComplete?.();
          }
          return text.length;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [text, streaming, isUser]);

  // When content changes without streaming, show full text
  useEffect(() => {
    if (!streaming && text) {
      setDisplayedLength(text.length);
    }
  }, [text, streaming]);

  const visibleText = text ? text.slice(0, displayedLength) : "";
  const isStreaming = streaming && text && displayedLength < text.length;

  // Render content with markdown for AI, plain for user
  const renderedContent = useMemo(() => {
    if (!visibleText) return null;

    if (zhuyinMode) {
      return (
        <span dangerouslySetInnerHTML={{ __html: addZhuyinAnnotations(visibleText) }} />
      );
    }

    if (isUser) {
      return <span>{visibleText}</span>;
    }

    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents as any}>
        {visibleText}
      </ReactMarkdown>
    );
  }, [visibleText, zhuyinMode, isUser]);

  return (
    <div className={`terminal-message px-4 py-2 ${fontSizeClass}`}>
      <div className="flex items-start gap-2">
        {/* Timestamp */}
        <span className="text-[var(--terminal-green-dim)] text-xs shrink-0 font-mono">
          [{timestamp}]
        </span>

        {/* Role indicator */}
        <span
          className={`shrink-0 font-bold ${
            isUser ? "text-[var(--terminal-cyan)]" : "text-[var(--terminal-amber)]"
          }`}
        >
          {isUser ? "USER" : aiDisplayName}@LAB:~$
        </span>

        {/* Message content */}
        <div className="flex-1 text-[var(--terminal-green)] break-words min-w-0 markdown-content">
          {!isUser && text === null ? (
            <span className="flex items-center gap-1">
              <span className="text-[var(--terminal-green-dim)]">Processing</span>
              <span className="terminal-cursor"></span>
            </span>
          ) : (
            <>
              {renderedContent}
              {isStreaming && <span className="terminal-cursor"></span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Message;
