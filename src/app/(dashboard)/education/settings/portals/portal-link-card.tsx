"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

export function PortalLinkCard({
  title,
  description,
  url,
}: {
  title: string;
  description: string;
  url: string;
}) {
  const [copyStatus, setCopyStatus] = useState("");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("Link copied.");
    } catch {
      setCopyStatus("Could not copy automatically. Select and copy the link.");
    }
  }

  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="font-semibold text-slate-950">{title}</h2>
    <p className="mt-1 text-sm text-slate-600">{description}</p>
    <label className="mt-4 block text-xs font-medium text-slate-600">
      Shareable link
      <input readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-800" />
    </label>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">
        {copyStatus === "Link copied." ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        Copy link
      </button>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        Open portal <ExternalLink className="h-4 w-4" />
      </a>
      {copyStatus && <span role={copyStatus === "Link copied." ? "status" : "alert"} className="text-xs text-slate-600">{copyStatus}</span>}
    </div>
  </article>;
}
