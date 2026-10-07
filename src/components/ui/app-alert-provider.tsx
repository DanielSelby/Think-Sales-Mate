"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type AlertTone = "error" | "success" | "info";
type AlertOptions = { title?: string; tone?: AlertTone };
type AlertRequest = { message: string; title: string; tone: AlertTone; resolve: () => void };

const AppAlertContext = React.createContext<((message: string, options?: AlertOptions) => Promise<void>) | null>(null);

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<AlertRequest[]>([]);
  const queueRef = React.useRef<AlertRequest[]>([]);

  const showAlert = React.useCallback((message: string, options: AlertOptions = {}) => {
    return new Promise<void>((resolve) => {
      const tone = options.tone ?? "error";
      queueRef.current.push({
        message,
        title: options.title ?? (tone === "error" ? "Something went wrong" : tone === "success" ? "Completed" : "Notice"),
        tone,
        resolve,
      });
      setQueue([...queueRef.current]);
    });
  }, []);

  const dismiss = React.useCallback(() => {
    queueRef.current.shift()?.resolve();
    setQueue([...queueRef.current]);
  }, []);

  const current = queue[0];
  const Icon = current?.tone === "success" ? CheckCircle2 : current?.tone === "info" ? Info : AlertCircle;
  const toneClasses = current?.tone === "success"
    ? { header: "from-emerald-500 to-emerald-700", button: "bg-emerald-600 hover:bg-emerald-700" }
    : current?.tone === "info"
      ? { header: "from-blue-500 to-blue-700", button: "bg-blue-600 hover:bg-blue-700" }
      : { header: "from-rose-500 to-rose-700", button: "bg-rose-600 hover:bg-rose-700" };

  React.useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, dismiss]);

  return (
    <AppAlertContext.Provider value={showAlert}>
      {children}
      {current && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/65 p-4 backdrop-blur-sm [perspective:1200px]" role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-alert-title"
            aria-describedby="app-alert-message"
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white text-ink-900 shadow-[0_32px_90px_-20px_rgba(0,0,0,0.72),0_12px_30px_-14px_rgba(0,0,0,0.4)] [transform:rotateX(2deg)] dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <div className={`bg-gradient-to-br ${toneClasses.header} px-6 py-6 text-center text-white`}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/20 shadow-inner">
                <Icon className="h-8 w-8" aria-hidden="true" />
              </div>
              <h2 id="app-alert-title" className="mt-3 font-display text-xl font-bold">{current.title}</h2>
            </div>
            <div className="p-6">
              <p id="app-alert-message" className="whitespace-pre-wrap text-center text-sm leading-6 text-ledger-700 dark:text-ledger-200">
                {current.message}
              </p>
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  autoFocus
                  onClick={dismiss}
                  className={`rounded-xl ${toneClasses.button} px-7 py-2.5 text-sm font-semibold text-white shadow-lg transition active:translate-y-px`}
                >
                  OK
                </button>
              </div>
            </div>
            <button type="button" onClick={dismiss} aria-label="Close alert" className="absolute right-3 top-3 rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </section>
        </div>
      )}
    </AppAlertContext.Provider>
  );
}

export function useAppAlert() {
  const showAlert = React.useContext(AppAlertContext);
  if (!showAlert) throw new Error("useAppAlert must be used within AppAlertProvider.");
  return showAlert;
}
