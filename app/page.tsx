'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_GREETING =
  "Hi! I'm BlueprintAI. Describe your business idea and I'll design your Supabase database schema.";

const EXAMPLE_PROMPTS = [
  {
    title: 'E-commerce store',
    description: 'Products, orders, customers, payments',
    prompt:
      'I want to build an e-commerce store where customers browse products, add them to a cart, and check out. I need to track orders and payments.',
  },
  {
    title: 'SaaS with teams',
    description: 'Workspaces, members, roles, billing',
    prompt:
      'I want to build a SaaS app where users can create teams, invite members with different roles, and subscribe to plans.',
  },
  {
    title: 'Social app',
    description: 'Posts, comments, likes, follows',
    prompt:
      'I want to build a social app where users can post content, follow other users, and like and comment on posts.',
  },
];

function extractSchemaArtifacts(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const blocks = [...msg.content.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) =>
      m[1].trim(),
    );
    if (blocks.length > 0) {
      return { schema: blocks[0] ?? null, migration: blocks[1] ?? null };
    }
  }
  return null;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: INITIAL_GREETING },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'schema' | 'migration'>('schema');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const artifacts = extractSchemaArtifacts(messages);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: text };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput('');
    setLoading(true);

    const REVEAL_CHARS = 1;
    const REVEAL_INTERVAL_MS = 18;

    let target = '';
    let displayed = '';
    let assistantStarted = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (stopped) return;
      if (displayed.length < target.length) {
        displayed = target.slice(0, displayed.length + REVEAL_CHARS);
        if (!assistantStarted) {
          assistantStarted = true;
          setLoading(false);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: displayed },
          ]);
        } else {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: displayed,
            };
            return updated;
          });
        }
      }
      timer = setTimeout(tick, REVEAL_INTERVAL_MS);
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.filter(
            (m) => m.role !== 'assistant' || next.indexOf(m) !== 0,
          ),
        }),
      });

      if (!res.ok) {
        let errMsg = 'Something went wrong. Please try again.';
        try {
          const data = await res.json();
          if (typeof data?.error === 'string') errMsg = data.error;
        } catch {}
        throw new Error(errMsg);
      }

      if (!res.body) throw new Error('Empty response from server.');

      tick();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) target += chunk;
      }

      while (displayed.length < target.length) {
        await new Promise((r) => setTimeout(r, REVEAL_INTERVAL_MS));
      }
    } catch (err) {
      stopped = true;
      if (timer) clearTimeout(timer);

      const errMsg =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';

      if (!assistantStarted) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: errMsg },
        ]);
      } else {
        const finalContent = `${displayed}\n\n[${errMsg}]`;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: finalContent,
          };
          return updated;
        });
      }
    } finally {
      stopped = true;
      if (timer) clearTimeout(timer);
      setLoading(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([{ role: 'assistant', content: INITIAL_GREETING }]);
    setInput('');
    setActiveTab('schema');
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-500/10">
            B
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">BlueprintAI</div>
            <div className="text-[11px] text-zinc-500">
              Conversational Supabase schema designer
            </div>
          </div>
        </div>
        <button
          onClick={handleNewConversation}
          className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700 rounded-md px-3 py-1.5 transition-colors"
        >
          New conversation
        </button>
      </header>

      {/* Split panes */}
      <div className="flex-1 flex min-h-0">
        {/* Chat pane */}
        <section className="w-full md:w-[42%] flex flex-col border-r border-zinc-800/80 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {messages.map((msg, i) => (
              <MessageBubble key={i} role={msg.role} content={msg.content} />
            ))}
            {loading && <ThinkingBubble />}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-zinc-800/80 p-4 shrink-0">
            <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 focus-within:border-zinc-700 focus-within:bg-zinc-900 transition-colors">
              <textarea
                className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none px-4 py-3 pr-12"
                rows={2}
                placeholder="Describe your business idea..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                disabled={loading}
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="absolute right-2 bottom-2 h-8 w-8 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 flex items-center justify-center transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="text-[11px] text-zinc-600 mt-2 px-1">
              Press Enter to send, Shift+Enter for new line
            </div>
          </div>
        </section>

        {/* Artifact pane */}
        <section className="hidden md:flex flex-1 flex-col min-h-0 bg-zinc-950">
          {artifacts ? (
            <SchemaArtifact
              schema={artifacts.schema}
              migration={artifacts.migration}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <EmptyArtifact
              onPickPrompt={(p) => send(p)}
              disabled={loading}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
}: {
  role: 'user' | 'assistant';
  content: string;
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-emerald-500 text-zinc-950 rounded-br-sm font-medium'
            : 'bg-zinc-900 text-zinc-100 border border-zinc-800/80 rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-zinc-900 border border-zinc-800/80 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce" />
      </div>
    </div>
  );
}

function EmptyArtifact({
  onPickPrompt,
  disabled,
}: {
  onPickPrompt: (p: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-10">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/5 border border-emerald-500/20 flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-emerald-400"
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v14a9 3 0 0 0 18 0V5" />
              <path d="M3 12a9 3 0 0 0 18 0" />
            </svg>
          </div>
        </div>

        <h2 className="text-center text-xl font-semibold tracking-tight text-zinc-100 mb-2">
          Your schema will appear here
        </h2>
        <p className="text-center text-sm text-zinc-500 mb-8 leading-relaxed">
          Describe your idea in the chat. BlueprintAI will ask a few questions,
          then generate production-ready Supabase SQL.
        </p>

        <div className="text-[11px] uppercase tracking-wider text-zinc-600 mb-3 text-center">
          Or start with an example
        </div>
        <div className="space-y-2">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex.title}
              onClick={() => onPickPrompt(ex.prompt)}
              disabled={disabled}
              className="w-full text-left px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-100">
                    {ex.title}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {ex.description}
                  </div>
                </div>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0 ml-3"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SchemaArtifact({
  schema,
  migration,
  activeTab,
  onTabChange,
}: {
  schema: string | null;
  migration: string | null;
  activeTab: 'schema' | 'migration';
  onTabChange: (t: 'schema' | 'migration') => void;
}) {
  const code = activeTab === 'schema' ? schema : migration;
  const filename = activeTab === 'schema' ? 'schema.sql' : 'migration.sql';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    if (!code) return;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 h-12 shrink-0">
        <div className="flex items-center gap-1">
          <TabButton
            active={activeTab === 'schema'}
            onClick={() => onTabChange('schema')}
            disabled={!schema}
          >
            Schema
          </TabButton>
          <TabButton
            active={activeTab === 'migration'}
            onClick={() => onTabChange('migration')}
            disabled={!migration}
          >
            Migration
          </TabButton>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!code}
            className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700 rounded-md px-3 py-1.5 transition-colors disabled:opacity-40"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!code}
            className="text-xs text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-md px-3 py-1.5 transition-colors disabled:opacity-40 font-medium"
          >
            Download
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-zinc-950">
        {code ? (
          <pre className="text-[13px] font-mono text-zinc-200 p-5 leading-relaxed">
            <code>{code}</code>
          </pre>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500">
            No {activeTab} available
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800/80 px-5 py-2 text-[11px] text-zinc-600 flex items-center justify-between shrink-0">
        <span className="font-mono">{filename}</span>
        <span>{code ? `${code.split('\n').length} lines` : ''}</span>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
        active
          ? 'bg-zinc-800/80 text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:hover:text-zinc-500'
      }`}
    >
      {children}
    </button>
  );
}
