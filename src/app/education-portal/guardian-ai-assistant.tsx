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
  "Summarize attendance and recent results",
  "What homework is due soon?",
  "Explain the current fee balance",
];

function trimConversation(messages: ChatMessage[]) {
  const trimmed = [...messages];
  const characterCount = () => trimmed.reduce((total, message) => total + message.content.length, 0);
  while (trimmed.length > MAX_CHAT_MESSAGES || characterCount() > MAX_CHAT_CONTEXT_CHARS) {
    trimmed.splice(0, 2);
  }
  return trimmed;
}

export function GuardianAiAssistant({ studentId, childName }: { studentId: string; childName: string }) {
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
      const response = await fetch("/api/education/guardian-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, messages: nextMessages }),
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
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h4 className="font-semibold text-slate-900">AI School Assistant</h4>
          <p className="text-xs text-slate-500">School information for {childName}; not a substitute for school staff</p>
        </div>
      </header>

      <div className="min-h-40 space-y-4 p-5" aria-live="polite">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
          I can help explain this child’s attendance summary, published results, recent homework, and fee balance using the information shown in the parent portal.
        </div>
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
              message.role === "user"
                ? "ml-auto rounded-tr-sm bg-indigo-700 text-white"
                : "rounded-tl-sm bg-slate-100 text-slate-700"
            }`}
          >
            {message.content}
          </div>
        ))}
        {isPending && <p className="text-sm text-slate-500">Checking the school information…</p>}
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => setInput(suggestion)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <form onSubmit={handleSubmit} className="border-t border-slate-100 p-4">
        <label htmlFor={`guardian-ai-message-${studentId}`} className="sr-only">Ask about {childName}'s school information</label>
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-indigo-400">
          <textarea
            id={`guardian-ai-message-${studentId}`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_CHAT_MESSAGE_CHARS}
            rows={2}
            placeholder="Ask about attendance, homework, results, or fees…"
            className="max-h-32 min-h-12 flex-1 resize-y bg-transparent px-2 py-1.5 text-sm outline-none"
            disabled={isPending}
          />
          <button type="submit" disabled={isPending || !input.trim()} aria-label="Send message" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-700 text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-right text-[11px] text-slate-400">{input.length}/{MAX_CHAT_MESSAGE_CHARS} · Enter to send, Shift+Enter for a new line</p>
      </form>
    </section>
  );
}
