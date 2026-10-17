"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileBarChart,
  LoaderCircle,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
  UsersRound,
} from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
};

type ChatTurn = Pick<ChatMessage, "role" | "content">;
type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};
type RetryRequest = {
  conversationId: string;
  prompt: string;
  priorMessages: ChatTurn[];
};

const QUICK_QUESTIONS = [
  { label: "Today's sales summary", prompt: "Summarize today's sales performance.", icon: BarChart3, color: "text-sky-600 bg-sky-50" },
  { label: "Low stock products", prompt: "Which products are low in stock at my authorized branches?", icon: Boxes, color: "text-violet-600 bg-violet-50" },
  { label: "Top-selling products", prompt: "What are my top-selling products in the last 30 days?", icon: TrendingUp, color: "text-emerald-600 bg-emerald-50" },
  { label: "Branch performance", prompt: "Compare sales performance across the branches I can access for the last 30 days.", icon: Building2, color: "text-amber-600 bg-amber-50" },
];

const QUICK_ACTIONS = [
  { label: "Ask about sales", prompt: "Summarize my sales performance for the last 30 days.", icon: BarChart3, color: "bg-sky-500" },
  { label: "Check inventory", prompt: "Show my low-stock and out-of-stock products.", icon: Boxes, color: "bg-emerald-500" },
  { label: "View reports", href: "/reports", icon: FileBarChart, color: "bg-violet-500" },
  { label: "Analyze performance", prompt: "Analyze sales and approved expenses for the last 30 days. Separate retrieved facts from recommendations.", icon: TrendingUp, color: "bg-amber-500" },
  { label: "Find customer balances", prompt: "Summarize outstanding customer invoices where I have permission to view them.", icon: UsersRound, color: "bg-cyan-600" },
];

const POPULAR_QUESTIONS = [
  "What are my total sales for this month?",
  "Which branch has the highest sales?",
  "Show me low-stock products.",
  "How much is outstanding from customers?",
  "What are the top-selling products?",
];

function boundedContext(messages: ChatTurn[]): ChatTurn[] {
  const result = messages.slice(-20);
  while (result.length && result[0].role !== "user") result.shift();
  let total = result.reduce((sum, message) => sum + message.content.length, 0);
  const requestBytes = () => new TextEncoder().encode(JSON.stringify({ messages: result })).byteLength;
  while (result.length > 1 && (total > 18_000 || requestBytes() > 18_000)) {
    total -= result.shift()?.content.length ?? 0;
    if (result.length && result[0].role === "assistant") {
      total -= result.shift()?.content.length ?? 0;
    }
  }
  return result;
}

function inlineMarkdown(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-semibold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] dark:bg-slate-800">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (
      line.startsWith("|")
      && index + 1 < lines.length
      && /^\|?\s*:?-{3,}/.test(lines[index + 1].trim())
    ) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(lines[index].trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
        index += 1;
      }
      const headings = rows[0] ?? [];
      const body = rows.slice(2);
      blocks.push(
        <div key={`table-${index}`} className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-700">
            <thead className="bg-sky-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>{headings.map((heading, cell) => <th key={cell} className="whitespace-nowrap px-3 py-2 font-semibold">{inlineMarkdown(heading, `head-${index}-${cell}`)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {body.map((row, rowIndex) => (
                <tr key={rowIndex} className="bg-white dark:bg-slate-900">
                  {headings.map((_, cell) => <td key={cell} className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{inlineMarkdown(row[cell] ?? "", `cell-${index}-${rowIndex}-${cell}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      const heading = line.replace(/^#{1,3}\s+/, "");
      blocks.push(<h3 key={`heading-${index}`} className="mt-4 text-sm font-semibold text-slate-900 first:mt-0 dark:text-white">{inlineMarkdown(heading, `heading-${index}`)}</h3>);
      index += 1;
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`} className="my-2 list-disc space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item, `list-${index}-${itemIndex}`)}</li>)}</ul>);
      continue;
    }

    if (/^\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push(<ol key={`ordered-${index}`} className="my-2 list-decimal space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item, `ordered-${index}-${itemIndex}`)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (
        !current
        || current.startsWith("|")
        || /^#{1,3}\s/.test(current)
        || /^[-*]\s/.test(current)
        || /^\d+[.)]\s/.test(current)
      ) break;
      paragraph.push(current);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`} className="my-2 whitespace-pre-wrap leading-6 first:mt-0 last:mb-0">{paragraph.map((part) => inlineMarkdown(part, `paragraph-${index}-${part}`)).reduce<React.ReactNode[]>((result, part, partIndex) => partIndex ? [...result, " ", part] : [part], [])}</p>);
  }

  return <div className="break-words text-[13px] text-slate-700 dark:text-slate-300">{blocks}</div>;
}

function formatConversationTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(timestamp);
}

export function AiChat({ userLabel }: { userLabel: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const inFlight = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const messages = useMemo(() => activeConversation?.messages ?? [], [activeConversation]);
  const recentConversations = useMemo(
    () => [...conversations].filter((conversation) => conversation.messages.length > 0).sort((left, right) => right.updatedAt - left.updatedAt),
    [conversations]
  );
  const recentToShow = showAllRecent ? recentConversations : recentConversations.slice(0, 4);
  const userInitials = userLabel.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "ME";

  useEffect(() => {
    let active = true;
    fetch("/api/ai/config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Your session may have expired. Refresh the page and sign in again.");
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not check AI configuration.");
        if (active) setConfigured(result.configured === true);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not check AI configuration.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    setShowScrollButton(distanceFromBottom > 120);
  }, [messages]);

  function startNewConversation() {
    if (loading) return;
    setActiveConversationId(null);
    setDraft("");
    setError(null);
    setRetryRequest(null);
  }

  async function requestAnswer(prompt: string, previousMessages: ChatTurn[], requestedConversationId?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    const boundedMessages = boundedContext([...previousMessages, { role: "user" as const, content: prompt }]);
    const priorMessages = boundedMessages.slice(0, -1);
    const submittedMessages = boundedMessages;
    const conversationId = requestedConversationId ?? crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: boundedMessages[boundedMessages.length - 1]?.content ?? prompt,
    };
    const assistantId = crypto.randomUUID();
    const nextMessages: ChatMessage[] = [
      ...priorMessages.map((message) => ({ ...message, id: crypto.randomUUID() })),
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ];
    const title = prompt.trim().replace(/\s+/g, " ").slice(0, 58) || "New conversation";
    setActiveConversationId(conversationId);
    setConversations((current) => {
      const found = current.some((conversation) => conversation.id === conversationId);
      if (!found) return [{ id: conversationId, title, updatedAt: Date.now(), messages: nextMessages }, ...current];
      return current.map((conversation) => conversation.id === conversationId
        ? { ...conversation, title: conversation.title === "New conversation" ? title : conversation.title, updatedAt: Date.now(), messages: nextMessages }
        : conversation);
    });
    setError(null);
    setRetryRequest(null);
    setLoading(true);

    const appendText = (text: string) => {
      setConversations((current) => current.map((conversation) => conversation.id === conversationId
        ? {
            ...conversation,
            updatedAt: Date.now(),
            messages: conversation.messages.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + text } : message
            ),
          }
        : conversation));
    };
    const fail = (message: string) => {
      setConversations((current) => current.map((conversation) => conversation.id === conversationId
        ? {
            ...conversation,
            messages: conversation.messages.map((entry) =>
              entry.id === assistantId ? { ...entry, failed: true } : entry
            ),
          }
        : conversation));
      setError(message);
      setRetryRequest({ conversationId, prompt, priorMessages });
    };

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: submittedMessages }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === "string" ? result.error : "The assistant could not complete your request.");
      }
      if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
        throw new Error("Your session may have expired. Refresh the page and sign in again.");
      }
      if (!response.body) throw new Error("The assistant response stream was unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      const processLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as { type?: string; text?: string; error?: string };
        if (event.type === "delta" && typeof event.text === "string") appendText(event.text);
        if (event.type === "error") throw new Error(event.error || "The assistant could not complete your request.");
        if (event.type === "done") done = true;
      };

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          processLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) processLine(buffer);
      if (!done) throw new Error("The assistant response ended unexpectedly. Please try again.");
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "The assistant could not complete your request.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  function sendPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || loading || configured !== true) return;
    const previousMessages = messages
      .filter((message) => !message.failed)
      .map(({ role, content }) => ({ role, content }))
      .filter((message) => message.content.length > 0);
    setDraft("");
    void requestAnswer(trimmed, previousMessages, activeConversationId ?? undefined);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendPrompt(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendPrompt(draft);
    }
  }

  function retry() {
    if (!retryRequest) return;
    void requestAnswer(retryRequest.prompt, retryRequest.priorMessages, retryRequest.conversationId);
  }

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-ink-900">
        {messages.length === 0 ? (
          <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50 via-blue-50/70 to-indigo-50/70 px-5 py-5 sm:px-7 sm:py-6 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Hi, I&apos;m your AI Assistant</h2>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600 dark:text-slate-300">
                  Ask about your business. I can help with the ThinkSales Pro data you&apos;re authorized to view.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              {QUICK_QUESTIONS.map(({ label, prompt, icon: Icon, color }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => sendPrompt(prompt)}
                  disabled={loading || configured !== true}
                  className="group flex min-h-12 items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white/90 px-3 py-2 text-left text-xs font-medium leading-4 text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-sky-700"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon className="h-4 w-4" /></span>
                  <span className="flex-1">{label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-500" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{activeConversation?.title ?? "AI conversation"}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Answers grounded in your authorized business data</p>
              </div>
            </div>
            <button
              type="button"
              onClick={startNewConversation}
              disabled={loading}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              <Plus className="h-3.5 w-3.5" /> New chat
            </button>
          </div>
        )}

        <div ref={messageListRef} className="relative flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
          {messages.length === 0 && (
            <div className="flex min-h-36 flex-col items-center justify-center px-3 text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-slate-800 dark:text-sky-300">
                <CircleHelp className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">What would you like to know?</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
                Try a suggested question, or ask in your own words. Results are limited to your organization and access.
              </p>
            </div>
          )}

          {messages.map((message) => message.role === "user" ? (
            <div key={message.id} className="flex items-end justify-end gap-2.5">
              <div className="max-w-[88%]">
                <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 to-sky-600 px-4 py-3 text-sm leading-6 text-white shadow-sm shadow-blue-500/15">
                  {message.content}
                </div>
                <p className="mt-1.5 text-right text-[10px] text-slate-400">You · {activeConversation ? formatConversationTime(activeConversation.updatedAt) : "Earlier"}</p>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white" aria-label={userLabel}>
                {userInitials}
              </span>
            </div>
          ) : (
            <div key={message.id} className="flex items-start gap-2.5 sm:gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0 max-w-[94%] flex-1 sm:max-w-[90%]">
                <div className="rounded-2xl rounded-tl-md border border-slate-200/90 bg-slate-50/90 px-4 py-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/70">
                  {message.content
                    ? <MarkdownContent content={message.content} />
                    : loading
                      ? <div className="flex items-center gap-2 py-1 text-xs text-slate-500 dark:text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin text-sky-500" />Checking authorized business data…</div>
                      : <p className="text-xs text-slate-500 dark:text-slate-400">{message.failed ? "I couldn’t prepare a reply. See the error details below." : "No response was received."}</p>}
                  {message.failed && message.content && <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-amber-700 dark:border-slate-700 dark:text-amber-300">The response was interrupted and may be incomplete.</p>}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">ThinkSales AI · Gemini</p>
              </div>
            </div>
          ))}

          {error && (
            <div className="ml-10 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-gradient-to-br from-white via-rose-50 to-rose-100 px-3.5 py-3 text-xs text-rose-900 shadow-[0_7px_0_0_rgba(190,24,93,0.12),0_14px_28px_-12px_rgba(190,24,93,0.25)] ring-1 ring-white/80 dark:border-rose-900 dark:from-rose-950 dark:via-rose-950/80 dark:to-slate-950 dark:text-rose-100 dark:ring-rose-900/50" role="alert">
              <span className="flex min-w-0 flex-1 items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-[0_3px_0_0_rgba(159,18,57,0.65)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <span>
                  <span className="block font-semibold">The request didn&apos;t finish</span>
                  <span className="mt-0.5 block leading-5 text-rose-800 dark:text-rose-200">{error}</span>
                </span>
              </span>
              {retryRequest && (
                <button type="button" onClick={retry} disabled={loading} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white/80 px-2.5 font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950">
                  <RotateCcw className="h-3.5 w-3.5" /> Try again
                </button>
              )}
            </div>
          )}

          {showScrollButton && (
            <button type="button" aria-label="Scroll to latest message" onClick={() => messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" })} className="sticky bottom-0 left-1/2 mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>

        {configured === false && (
          <p className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:mx-6 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Gemini isn&apos;t configured yet. Ask an administrator to add the server-side API key.
          </p>
        )}
        <form onSubmit={onSubmit} className="border-t border-slate-100 bg-white px-3 py-3 sm:px-5 sm:py-4 dark:border-slate-800 dark:bg-ink-900">
          <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:ring-sky-950">
            <label className="sr-only" htmlFor="ai-chat-message">Ask a business question</label>
            <textarea
              id="ai-chat-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              maxLength={3_000}
              rows={2}
              disabled={loading || configured !== true}
              placeholder={configured === false ? "Gemini is not configured" : "Ask me anything about your business…"}
              className="max-h-36 min-h-10 flex-1 resize-y bg-transparent px-2 py-1 text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-white"
            />
            <button type="submit" aria-label="Send message" disabled={loading || configured !== true || !draft.trim()} className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 px-1 pt-2 text-[10px] text-slate-400">
            <span>{configured === null ? "Checking assistant configuration…" : "Enter to send · Shift + Enter for a new line"}</span>
            <span>{draft.length}/3000</span>
          </div>
        </form>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-300"><Sparkles className="h-4 w-4" /></span>
            Quick Actions
          </div>
          <div className="space-y-1.5">
            {QUICK_ACTIONS.map(({ label, prompt, href, icon: Icon, color }) => href ? (
              <a key={label} href={href} className="group flex min-h-10 items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50/60 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                <span className={`flex h-6 w-6 items-center justify-center rounded-md text-white ${color}`}><Icon className="h-3.5 w-3.5" /></span>
                <span className="flex-1">{label}</span><ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-sky-500" />
              </a>
            ) : (
              <button key={label} type="button" onClick={() => sendPrompt(prompt ?? "")} disabled={loading || configured !== true} className="group flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                <span className={`flex h-6 w-6 items-center justify-center rounded-md text-white ${color}`}><Icon className="h-3.5 w-3.5" /></span>
                <span className="flex-1">{label}</span><ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-sky-500" />
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-slate-800 dark:text-amber-300"><CircleHelp className="h-4 w-4" /></span>
            Popular Questions
          </div>
          <div className="space-y-1.5">
            {POPULAR_QUESTIONS.map((question) => (
              <button key={question} type="button" onClick={() => sendPrompt(question)} disabled={loading || configured !== true} className="flex w-full items-start gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-left text-[11px] leading-4 text-slate-600 transition hover:border-sky-200 hover:bg-sky-50/60 hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-200">
                <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" />
                {question}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-slate-800 dark:text-indigo-300"><Clock3 className="h-4 w-4" /></span>
              Recent Conversations
            </div>
            {recentConversations.length > 4 && (
              <button type="button" onClick={() => setShowAllRecent((value) => !value)} className="text-[10px] font-semibold text-blue-600 hover:underline dark:text-blue-300">
                {showAllRecent ? "Show less" : "View all"}
              </button>
            )}
          </div>
          {recentToShow.length > 0 ? (
            <div className="space-y-1">
              {recentToShow.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => { setActiveConversationId(conversation.id); setError(null); setRetryRequest(null); }}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-sky-50/70 dark:hover:bg-slate-800 ${conversation.id === activeConversationId ? "bg-sky-50 dark:bg-slate-800" : ""}`}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-slate-700 dark:text-sky-300"><MessageCircle className="h-3 w-3" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">{conversation.title}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">{formatConversationTime(conversation.updatedAt)}</span>
                  </span>
                  {conversation.id === activeConversationId && <Check className="mt-1 h-3 w-3 shrink-0 text-sky-600" />}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center dark:border-slate-700">
              <MessageCircle className="mx-auto h-5 w-5 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">Your conversations will appear here</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">Start a chat to see it in this session.</p>
            </div>
          )}
          <p className="mt-3 border-t border-slate-100 pt-2.5 text-[10px] leading-4 text-slate-400 dark:border-slate-800">
            Conversations stay in this page session and aren&apos;t stored on the server.
          </p>
        </section>
      </aside>
    </div>
  );
}
