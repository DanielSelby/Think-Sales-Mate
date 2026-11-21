"use client";

import { useEffect, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { TransactionFeedback } from "@/components/transactions/transaction-feedback";

type EducationNotice = {
  kind: "success" | "error" | "warning";
  message: string;
  pathname: string;
  actionHref?: string;
  actionLabel?: string;
};

function preventImplicitFormSubmit(event: KeyboardEvent<HTMLDivElement>) {
  if (
    event.key !== "Enter"
    || event.nativeEvent.isComposing
    || event.shiftKey
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || !(event.target instanceof HTMLInputElement)
  ) return;

  const inputType = event.target.type;
  if (["button", "checkbox", "file", "image", "radio", "reset", "submit"].includes(inputType)) return;

  const form = event.target.form;
  if (!form || form.getAttribute("method")?.toLowerCase() === "get") return;

  event.preventDefault();
}

export function EducationPageContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pendingChildren, setPendingChildren] = useState<ReactNode>(null);
  const isPending = children !== null && pendingChildren === children;
  const [notice, setNotice] = useState<EducationNotice | null>(null);

  useEffect(() => {
    const root = document.querySelector(".education-page-content");
    if (!root) return;

    const convertPageFeedback = () => {
      const messages = Array.from(root.querySelectorAll<HTMLParagraphElement>('p[role="alert"], p[role="status"]'))
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true")
        .map((element) => ({
          element,
          message: element.textContent?.trim() ?? "",
          actionHref: element.querySelector<HTMLAnchorElement>("a[href]")?.href,
          actionLabel: element.querySelector<HTMLAnchorElement>("a[href]")?.textContent?.trim(),
          kind: element.getAttribute("role") === "alert" ? "error" as const : "success" as const,
        }))
        .filter((item) => item.message.length > 0);

      if (!messages.length) return;

      const kind = messages.some((item) => item.kind === "error")
        ? "error"
        : messages.some((item) => item.element.className.includes("amber")
          || /\b(warning|invalid|ignored|rejected|resubmission|outside|unauthorized|restricted|blocked)\b/i.test(item.message))
          ? "warning"
          : "success";
      const message = messages.map((item) => item.message).join(" ");
      const action = messages.find((item) => item.actionHref && item.actionLabel);
      for (const { element } of messages) {
        element.classList.add("hidden");
        element.setAttribute("aria-hidden", "true");
      }
      setNotice({
        kind,
        message,
        pathname,
        actionHref: action?.actionHref,
        actionLabel: action?.actionLabel,
      });
    };

    convertPageFeedback();
    const observer = new MutationObserver(convertPageFeedback);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [children, pathname]);

  useEffect(() => {
    const start = () => setPendingChildren(children);
    const finish = () => setPendingChildren(null);
    window.addEventListener("education:action-start", start);
    window.addEventListener("education:action-complete", finish);
    return () => {
      window.removeEventListener("education:action-start", start);
      window.removeEventListener("education:action-complete", finish);
    };
  }, [children, pathname]);

  function showNavigationFeedback(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || !(event.target instanceof Element)
    ) return;

    const link = event.target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin === window.location.origin
      && `${destination.pathname}${destination.search}` !== `${window.location.pathname}${window.location.search}`) {
      setPendingChildren(children);
    }
  }

  const noticeActionHref = notice?.actionHref;

  return (
    <div
      className="education-page-content"
      onKeyDownCapture={preventImplicitFormSubmit}
      onClickCapture={showNavigationFeedback}
      onSubmitCapture={() => setPendingChildren(children)}
    >
      {isPending && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex justify-center" role="status" aria-live="polite">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/95 px-4 py-2 text-sm font-medium text-slate-700 shadow-lg backdrop-blur">
            <Loader2 className="h-4 w-4 animate-spin text-blue-700" aria-hidden="true" />
            Loading Think Education…
          </span>
        </div>
      )}
      {notice?.pathname === pathname && (
        <TransactionFeedback
          kind={notice.kind}
          message={notice.message}
          onClose={() => setNotice(null)}
          actionLabel={notice.actionLabel}
          onAction={noticeActionHref ? () => window.location.assign(noticeActionHref) : undefined}
        />
      )}
      {children}
    </div>
  );
}
