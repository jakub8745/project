import { FormEvent, useEffect, useRef, useState } from 'react';

export interface BlobChatMessage {
  id: string;
  role: 'system' | 'visitor' | 'blob';
  text: string;
  createdAt: number;
  blobId?: string;
  senderLabel?: string;
}

interface BlobChatWindowProps {
  title?: string;
  messages: BlobChatMessage[];
  loading?: boolean;
  error?: string | null;
  bridgeOnline?: boolean;
  locked?: boolean;
  placeholder?: string;
  lockedPlaceholder?: string;
  onSend: (text: string) => Promise<void> | void;
}

export default function BlobChatWindow({
  title = 'Blob Chat',
  messages,
  loading = false,
  error,
  bridgeOnline = true,
  locked = false,
  placeholder = 'Send a message...',
  lockedPlaceholder = 'Enter secret words to unlock chat...',
  onSend
}: BlobChatWindowProps) {
  const [input, setInput] = useState('');
  const [hasNewBlobMessage, setHasNewBlobMessage] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const indicatorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest) return;
    const previousId = lastMessageIdRef.current;
    lastMessageIdRef.current = latest.id;
    if (!previousId) return;
    if (latest.id === previousId) return;
    if (latest.role !== 'blob') return;
    setHasNewBlobMessage(true);
    if (indicatorTimerRef.current !== null) {
      window.clearTimeout(indicatorTimerRef.current);
    }
    indicatorTimerRef.current = window.setTimeout(() => {
      setHasNewBlobMessage(false);
      indicatorTimerRef.current = null;
    }, 3200);
  }, [messages]);

  useEffect(() => {
    return () => {
      if (indicatorTimerRef.current !== null) {
        window.clearTimeout(indicatorTimerRef.current);
      }
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    await onSend(text);
    inputRef.current?.blur();
  };

  return (
    <section className="pointer-events-auto absolute bottom-4 right-4 z-40 flex h-[24rem] w-[22rem] max-w-[92vw] flex-col rounded-xl border border-white/20 bg-slate-950/85 shadow-xl backdrop-blur-sm">
      <header className="flex items-center justify-between border-b border-white/15 px-3 py-2 text-sm font-semibold text-white">
        <div className="flex items-center gap-2">
          <span>{title}</span>
          {hasNewBlobMessage ? (
            <span className="rounded-full border border-cyan-300/40 bg-cyan-400/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100 animate-pulse">
              New reply
            </span>
          ) : null}
        </div>
        {!bridgeOnline ? (
          <span className="rounded-full border border-rose-300/40 bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
            Bridge offline
          </span>
        ) : locked ? (
          <span className="rounded-full border border-amber-300/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
            Locked
          </span>
        ) : null}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {messages.length === 0 ? (
          <p className="text-white/55">No messages yet.</p>
        ) : (
          messages.map((message) => {
            const isVisitor = message.role === 'visitor';
            const isBlob = message.role === 'blob';
            const label = isVisitor ? 'Visitor' : isBlob ? message.senderLabel || 'Blob' : 'System';
            return (
              <article
                key={message.id}
                className={`rounded-md px-2 py-1 ${
                  isVisitor
                    ? 'ml-8 bg-cyan-500/25 text-cyan-50'
                    : isBlob
                      ? 'mr-8 bg-amber-500/25 text-amber-50'
                      : 'bg-white/10 text-white/75'
                }`}
              >
                <p className="mb-1 text-[10px] uppercase tracking-wider text-white/60">{label}</p>
                <p className="whitespace-pre-wrap leading-snug">{message.text}</p>
              </article>
            );
          })
        )}
      </div>
      {error ? <p className="px-3 pb-1 text-xs text-rose-300">{error}</p> : null}
      <form onSubmit={submit} className="flex gap-2 border-t border-white/15 p-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              (event.currentTarget as HTMLInputElement).blur();
            }
            event.stopPropagation();
          }}
          onKeyUp={(event) => {
            event.stopPropagation();
          }}
          placeholder={locked ? lockedPlaceholder : placeholder}
          className="flex-1 rounded-md border border-white/20 bg-slate-900/80 px-2 py-1 text-sm text-white outline-none focus:border-cyan-300/70"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cyan-500/80 px-3 py-1 text-sm font-medium text-cyan-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? '...' : 'Send'}
        </button>
      </form>
    </section>
  );
}
