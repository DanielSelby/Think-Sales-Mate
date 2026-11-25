"use client";

import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Send, Sparkles } from "lucide-react";
import {
  MAX_CHAT_CONTEXT_CHARS,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_MESSAGES,
  type ChatMessage,
} from "@/lib/ai/chat-validation";

const suggestions = [
  "Help me plan a lesson for one of my classes",
  "What classes do I teach today?",
  "Summarize my upcoming assignments",
];

function trimConversation(messages: ChatMessage[]) {
  const trimmed = [...messages];
  const characterCount = () => trimmed.reduce((total, message) => total + message.content.length, 0);
  while (trimmed.length > MAX_CHAT_MESSAGES || characterCount() > MAX_CHAT_CONTEXT_CHARS) {
    trimmed.splice(0, 2);
  }
  return trimmed;
}

export function TeacherAiAssistant({
  orgId,
  schoolName,
}: {
  orgId: string;
  schoolName: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function sendMessage(messageText: string) {
    const content = messageText.trim();
    if (!content || isPending || content.length > MAX_CHAT_MESSAGE_CHARS) return;

    const nextMessages = trimConversation([...messages, { role: "user", content }]);
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/education/teacher-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, messages: nextMessages }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : "The assistant could not respond. Please try again.";
        setError(message);
        setMessages(messages);
        setInput(content);
        return;
      }
      if (!result || typeof result !== "object" || !("reply" in result) || typeof result.reply !== "string" || !result.reply.trim()) {
        setError("The assistant returned an invalid response. Please try again.");
        setMessages(messages);
        setInput(content);
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: result.reply }]);
    } catch {
      setError("The assistant could not be reached. Check your connection and try again.");
      setMessages(messages);
      setInput(content);
    } finally {
      setIsPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">Teacher AI Assistant</h2>
          <p className="text-xs text-slate-500">School-aware teaching support for {schoolName}</p>
        </div>
      </header>

      <div className="min-h-48 space-y-4 p-5" aria-live="polite">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
          I can help with teaching ideas using your assigned classes, timetable, attendance summary, and upcoming assignments. I cannot change school records.
        </div>
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
              message.role === "user"
                ? "ml-auto rounded-tr-sm bg-emerald-700 text-white"
                : "rounded-tl-sm bg-slate-100 text-slate-700"
            }`}
          >
            {message.content}
          </div>
        ))}
        {isPending && <p className="text-sm text-slate-500">Checking your school context…</p>}
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => setInput(suggestion)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700">
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <form onSubmit={handleSubmit} className="border-t border-slate-100 p-4">
        <label htmlFor={`teacher-ai-message-${orgId}`} className="sr-only">Ask the Teacher AI Assistant</label>
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-emerald-400">
          <textarea
            id={`teacher-ai-message-${orgId}`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_CHAT_MESSAGE_CHARS}
            rows={2}
            placeholder="Ask about your teaching context…"
            className="max-h-32 min-h-12 flex-1 resize-y bg-transparent px-2 py-1.5 text-sm outline-none"
            disabled={isPending}
          />
          <button type="submit" disabled={isPending || !input.trim()} aria-label="Send message" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-right text-[11px] text-slate-400">{input.length}/{MAX_CHAT_MESSAGE_CHARS} · Enter to send, Shift+Enter for a new line</p>
      </form>
    </section>
  );
}
