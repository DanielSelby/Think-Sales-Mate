"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TIMEOUT_MS  = 30 * 60 * 1000; // 30 minutes
const WARNING_MS  = 28 * 60 * 1000; // warn at 28 minutes
const EVENTS      = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

interface Props {
  children: React.ReactNode;
}

export function SessionTimeout({ children }: Props) {
  const router                = useRouter();
  const timerRef              = useRef<NodeJS.Timeout | null>(null);
  const warningRef            = useRef<NodeJS.Timeout | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const clearTimers = useCallback(() => {
    if (timerRef.current)   clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const handleLogout = useCallback(async () => {
    clearTimers();
    setShowWarning(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login?error=Session+expired+due+to+inactivity");
    router.refresh();
  }, [clearTimers, router]);

  const resetTimer = useCallback(() => {
    clearTimers();
    setShowWarning(false);

    // Show warning at 28 minutes
    warningRef.current = setTimeout(() => {
      setShowWarning(true);
    }, WARNING_MS);

    // Auto logout at 30 minutes
    timerRef.current = setTimeout(() => {
      handleLogout();
    }, TIMEOUT_MS);
  }, [clearTimers, handleLogout]);

  const stayLoggedIn = useCallback(() => {
    setShowWarning(false);
    resetTimer();
  }, [resetTimer]);

  // Start timer and attach activity listeners
  useEffect(() => {
    resetTimer();

    const onActivity = () => resetTimer();
    EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }));

    return () => {
      clearTimers();
      EVENTS.forEach(evt => window.removeEventListener(evt, onActivity));
    };
  }, [resetTimer, clearTimers]);

  return (
    <>
      {children}

      {/* Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
            style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 mb-4">
                <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-slate-900">Session About to Expire</h2>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
                Your session is about to expire due to inactivity. You will be automatically logged out in <strong className="text-slate-700">2 minutes</strong>.
              </p>
            </div>

            {/* Countdown bar */}
            <div className="px-6 pb-4">
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full animate-[shrink_120s_linear_forwards]"
                  style={{ animation: "session-shrink 120s linear forwards" }} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={handleLogout}
                className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Log Out
              </button>
              <button
                onClick={stayLoggedIn}
                className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #203421, #2a432b)" }}>
                Stay Logged In
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes session-shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </>
  );
}