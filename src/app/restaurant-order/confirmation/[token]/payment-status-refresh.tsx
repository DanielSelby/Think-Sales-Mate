"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const refreshIntervalMs = 2_000;
const maxRefreshes = 12;

export default function PaymentStatusRefresh() {
  const router = useRouter();
  const refreshCount = useRef(0);
  const [timedOut, setTimedOut] = useState(false);
  const [pollRun, setPollRun] = useState(0);

  useEffect(() => {
    refreshCount.current = 0;
    const interval = window.setInterval(() => {
      refreshCount.current += 1;
      router.refresh();
      if (refreshCount.current >= maxRefreshes) {
        window.clearInterval(interval);
        setTimedOut(true);
      }
    }, refreshIntervalMs);
    return () => window.clearInterval(interval);
  }, [router, pollRun]);

  return <div aria-live="polite" className="mt-4 text-sm text-slate-500">
    {timedOut
      ? <button type="button" onClick={() => { setTimedOut(false); setPollRun((current) => current + 1); router.refresh(); }} className="underline">Still waiting? Check payment status again.</button>
      : <p>Checking payment status…</p>}
  </div>;
}
