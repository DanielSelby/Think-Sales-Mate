"use client";

import { useState } from "react";

export function SubmissionConfirmationModal({ open }: { open: boolean }) {
  const [visible, setVisible] = useState(open);
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-success-title"
        className="w-full max-w-md animate-[registration-pop_450ms_cubic-bezier(.2,.8,.2,1)] rounded-3xl border border-white/70 bg-gradient-to-br from-white via-emerald-50 to-blue-100 p-8 text-center shadow-[0_35px_90px_-25px_rgba(15,23,42,0.75),inset_0_2px_4px_rgba(255,255,255,0.95)]"
      >
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-emerald-200 bg-gradient-to-br from-emerald-300 to-emerald-600 text-4xl font-black text-white shadow-[0_12px_24px_-8px_rgba(5,150,105,0.8),inset_0_2px_5px_rgba(255,255,255,0.65)]">
          ✓
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Submission received</p>
        <h2 id="registration-success-title" className="mt-2 rounded-2xl border border-amber-300 bg-gradient-to-b from-amber-100 via-amber-50 to-white px-4 py-4 text-xl font-black leading-tight text-amber-950 shadow-[0_7px_0_0_rgb(217,119,6),0_14px_24px_-10px_rgba(180,83,9,0.65),inset_0_2px_4px_rgba(255,255,255,0.95)] sm:text-2xl">
          Account Is Under Review - Pending Approval
        </h2>
        <p className="mt-4 text-sm leading-6 text-slate-700">
          Your organization is awaiting approval. Workspace access will be enabled after the review is complete.
        </p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="mt-7 rounded-xl border border-emerald-800/20 bg-gradient-to-b from-emerald-600 to-emerald-800 px-6 py-3 text-sm font-bold text-white shadow-[0_7px_0_0_rgb(4,90,66),0_12px_20px_-8px_rgba(4,120,87,0.8)] transition hover:-translate-y-0.5 hover:shadow-[0_9px_0_0_rgb(4,90,66),0_16px_24px_-8px_rgba(4,120,87,0.8)] active:translate-y-1 active:shadow-[0_3px_0_0_rgb(4,90,66)]"
        >
          View registration status
        </button>
      </section>
      <style jsx>{`
        @keyframes registration-pop {
          from { opacity: 0; transform: translateY(22px) rotateX(12deg) scale(0.88); }
          to { opacity: 1; transform: translateY(0) rotateX(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
