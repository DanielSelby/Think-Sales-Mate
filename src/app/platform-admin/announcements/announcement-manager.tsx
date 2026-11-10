"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarDays, Megaphone, Pencil, Plus, Send } from "lucide-react";
import { saveHubAnnouncement, setHubAnnouncementStatus } from "./actions";
import type { PlatformHubAnnouncement } from "@/lib/supabase/platform-admin";
import { isPlatformProductSlug, PLATFORM_PRODUCT_LABELS, type PlatformProductSlug } from "@/types/platform-database";

interface ProductOption {
  slug: PlatformProductSlug;
  name: string;
}

interface AnnouncementInput {
  id?: string;
  title: string;
  summary: string;
  linkUrl: string;
  productSlugs: string[];
  status: "draft" | "published";
  expiresOn: string;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The announcement could not be saved.";
}

function AnnouncementForm({
  announcement,
  products,
  busy,
  onSave,
  onCancel,
}: {
  announcement?: PlatformHubAnnouncement;
  products: ProductOption[];
  busy: boolean;
  onSave: (input: AnnouncementInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [summary, setSummary] = useState(announcement?.summary ?? "");
  const [linkUrl, setLinkUrl] = useState(announcement?.link_url ?? "");
  const [productSlugs, setProductSlugs] = useState<string[]>(announcement?.product_slugs ?? []);
  const [status, setStatus] = useState<"draft" | "published">(
    announcement?.status === "published" ? "published" : "draft",
  );
  const [expiresOn, setExpiresOn] = useState(announcement?.expires_at?.slice(0, 10) ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave({
      id: announcement?.id,
      title,
      summary,
      linkUrl,
      productSlugs,
      status,
      expiresOn,
    }).then((saved) => {
      if (saved && !announcement) {
        setTitle("");
        setSummary("");
        setLinkUrl("");
        setProductSlugs([]);
        setStatus("draft");
        setExpiresOn("");
      }
    });
  }

  function toggleProduct(slug: string) {
    setProductSlugs((current) =>
      current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug]
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        {announcement ? <Pencil aria-hidden="true" className="h-4 w-4 text-blue-700" /> : <Plus aria-hidden="true" className="h-4 w-4 text-blue-700" />}
        <h2 className="font-semibold text-slate-900">{announcement ? "Edit announcement" : "Create announcement"}</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Title
          <input
            required
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Learn-more link <span className="font-normal text-slate-500">(optional)</span>
          <input
            type="text"
            maxLength={2048}
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://... or /support"
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Short summary
        <textarea
          required
          maxLength={500}
          rows={3}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <span className="mt-1 block text-right text-xs font-normal text-slate-500">{summary.length}/500</span>
      </label>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Affected products</legend>
        <p className="mt-1 text-xs text-slate-500">Leave all unchecked to show this announcement to everyone.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {products.map((product) => (
            <label key={product.slug} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={productSlugs.includes(product.slug)}
                onChange={() => toggleProduct(product.slug)}
                className="h-4 w-4 accent-blue-700"
              />
              {product.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "draft" | "published")}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="draft">Save as draft</option>
            <option value="published">Publish now</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Expiry date <span className="font-normal text-slate-500">(optional)</span>
          <input
            type="date"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send aria-hidden="true" className="h-4 w-4" />
          {busy ? "Saving..." : status === "published" ? "Save & publish" : "Save draft"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default function AnnouncementManager({
  announcements,
  products,
  canManage,
}: {
  announcements: PlatformHubAnnouncement[];
  products: ProductOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(input: AnnouncementInput): Promise<boolean> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveHubAnnouncement(input);
      setNotice(input.status === "published" ? "Announcement published." : "Draft saved.");
      if (input.id) setEditingId(null);
      router.refresh();
      return true;
    } catch (saveError) {
      setError(errorText(saveError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(announcement: PlatformHubAnnouncement, status: "draft" | "published" | "archived") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await setHubAnnouncementStatus(announcement.id, status);
      setNotice(status === "published" ? "Announcement published." : status === "archived" ? "Announcement archived." : "Announcement returned to draft.");
      router.refresh();
    } catch (statusError) {
      setError(errorText(statusError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {canManage && <AnnouncementForm products={products} busy={busy} onSave={save} />}

      <section aria-labelledby="announcements-list-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="announcements-list-title" className="text-lg font-bold text-slate-950">Announcements</h2>
            <p className="text-sm text-slate-600">Showing the 100 most recent items.</p>
          </div>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{announcements.length}</span>
        </div>
        {announcements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
            <Megaphone aria-hidden="true" className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 font-semibold text-slate-800">No announcements yet</p>
            <p className="mt-1 text-sm text-slate-500">Create an announcement to share it in the Product Hub.</p>
          </div>
        ) : announcements.map((announcement) => (
          <article key={announcement.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {editingId === announcement.id && canManage ? (
              <AnnouncementForm
                announcement={announcement}
                products={products}
                busy={busy}
                onSave={save}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-950">{announcement.title}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                        announcement.status === "published" ? "bg-emerald-100 text-emerald-800"
                          : announcement.status === "draft" ? "bg-amber-100 text-amber-800"
                            : "bg-slate-200 text-slate-700"
                      }`}>{announcement.status}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{announcement.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5" /> Created {new Date(announcement.created_at).toLocaleDateString("en", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</span>
                      {announcement.expires_at && <span>Expires {new Date(announcement.expires_at).toLocaleDateString("en", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</span>}
                      {announcement.product_slugs.length === 0
                        ? <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">All Product Hub users</span>
                        : announcement.product_slugs.map((slug) => (
                          <span key={slug} className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">
                            {products.find((product) => product.slug === slug)?.name
                              ?? (isPlatformProductSlug(slug) ? PLATFORM_PRODUCT_LABELS[slug] : slug)}
                          </span>
                        ))}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => setEditingId(announcement.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" /> Edit
                      </button>
                      {announcement.status !== "archived" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void updateStatus(announcement, announcement.status === "published" ? "draft" : "published")}
                          className="h-9 rounded-lg border border-blue-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          {announcement.status === "published" ? "Unpublish" : "Publish"}
                        </button>
                      )}
                      {announcement.status !== "archived" ? (
                        <button type="button" disabled={busy} onClick={() => void updateStatus(announcement, "archived")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                          <Archive aria-hidden="true" className="h-3.5 w-3.5" /> Archive
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void updateStatus(announcement, "draft")} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                          Restore draft
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
