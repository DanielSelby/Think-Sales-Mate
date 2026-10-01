"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Eye, Globe2, ImagePlus, Monitor, Pencil, Plus, ShieldCheck, Smartphone, Tablet, Upload, Users } from "lucide-react";
import { ModernGreenLogin } from "@/app/(auth)/login/modern-green-login";
import {
  duplicateLoginTheme,
  setGlobalLoginTheme,
  setLoginThemeActive,
  setOrganizationLoginTheme,
  updateLoginTheme,
} from "./actions";

type LoginTheme = {
  id: string;
  name: string;
  description: string;
  preview_image: string | null;
  theme_type: string;
  is_active: boolean;
  created_at: string;
};
type ThemeOrganization = {
  organization_id: string;
  name: string;
  slug: string | null;
  use_global_login_theme: boolean;
  login_theme_id: string | null;
};
type LoginAudit = {
  id: string;
  organization_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  admin_name: string;
};

function LegacyLoginPreview() {
  return (
    <div className="flex min-h-[520px] w-full items-center justify-center bg-[#f7f8f6] p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-2">
        <div className="hidden bg-[#172517] p-8 text-white md:block">
          <p className="text-xl font-semibold">ThinkSales <span className="text-emerald-300">Pro</span></p>
          <p className="mt-1 text-xs text-white/60">Sales Management System</p>
          <h3 className="mt-14 text-3xl font-semibold leading-tight">Smart Sales.<br />Stronger Business.<br />Better Growth.</h3>
          <p className="mt-5 max-w-xs text-sm text-white/65">Manage sales, inventory, customers and reports in one powerful platform.</p>
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/75">Dashboard · Sales · Inventory · Customers</div>
        </div>
        <div className="flex flex-col justify-center p-8">
          <div className="mx-auto h-11 w-11 rounded-xl bg-[#203822]" />
          <h3 className="mt-4 text-center text-2xl font-semibold text-slate-900">Welcome back!</h3>
          <p className="mt-2 text-center text-sm text-slate-400">Sign in to continue to Think-SalesMate ERP</p>
          <div className="mt-7 space-y-4">
            <div><p className="mb-1 text-xs font-medium text-slate-600">Email or username</p><div className="h-10 rounded-lg border border-slate-200" /></div>
            <div><p className="mb-1 text-xs font-medium text-slate-600">Password</p><div className="h-10 rounded-lg border border-slate-200" /></div>
            <div className="h-10 rounded-lg bg-[#203822]" />
            <div className="grid grid-cols-2 gap-2"><div className="h-9 rounded-lg border border-slate-200" /><div className="h-9 rounded-lg border border-slate-200" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginExperienceManager({
  themes,
  organizations,
  globalThemeId,
  auditLogs,
}: {
  themes: LoginTheme[];
  organizations: ThemeOrganization[];
  globalThemeId: string;
  auditLogs: LoginAudit[];
}) {
  const router = useRouter();
  const activeThemes = useMemo(() => themes.filter((theme) => theme.is_active), [themes]);
  const [selectedGlobal, setSelectedGlobal] = useState(globalThemeId);
  const [assignments, setAssignments] = useState<Record<string, string>>(
    Object.fromEntries(organizations.map((org) => [org.organization_id, org.use_global_login_theme ? "" : org.login_theme_id ?? ""])),
  );
  const [preview, setPreview] = useState<LoginTheme | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [editing, setEditing] = useState<LoginTheme | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<LoginTheme | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [uploadingThemeId, setUploadingThemeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadArtwork(themeId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadingThemeId(themeId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/platform-admin/upload-theme-artwork", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const responseText = await response.text();
      let result: { error?: string };
      try {
        result = JSON.parse(responseText) as { error?: string };
      } catch {
        throw new Error(
          response.redirected
            ? "Your session was redirected. Sign in to Platform Administration again, then retry the upload."
            : `The upload endpoint returned an unexpected response (HTTP ${response.status}).`,
        );
      }
      if (!response.ok) throw new Error(result.error ?? "Artwork upload failed.");
      setNotice("Login artwork uploaded and applied.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Artwork upload failed.");
    } finally {
      setUploadingThemeId(null);
    }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login theme operation failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEditor(theme: LoginTheme) {
    setEditing(theme);
    setForm({ name: theme.name, description: theme.description });
  }

  function closeDialogs() {
    setEditing(null);
    setDuplicateSource(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-600"><ShieldCheck className="h-4 w-4" /> Secure &amp; Unified</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Login Experience</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Choose the platform default, assign an organization-specific design, and preview changes without activating them.</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900 sm:max-w-sm">
          All themes use the same authentication system, database, users, sessions, and security controls.
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.9fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-semibold text-slate-950">Login Theme Library</h3><p className="mt-1 text-xs text-slate-500">Available sign-in presentations</p></div>
            <button type="button" disabled={busy} onClick={() => { setDuplicateSource(themes[0] ?? null); setForm({ name: "", description: "" }); }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Add New Theme</button>
          </div>
          <div className="space-y-4">
            {themes.map((theme) => {
              const isGlobal = selectedGlobal === theme.id;
              const assignedCount = organizations.filter((org) =>
                (!org.use_global_login_theme && org.login_theme_id === theme.id)
                || (isGlobal && org.use_global_login_theme),
              ).length;
              return (
                <article key={theme.id} className="grid gap-4 rounded-xl border border-slate-200 p-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-4">
                  <div className="min-w-0">
                    <button type="button" onClick={() => { setPreview(theme); setPreviewDevice("desktop"); }} className="group relative block h-36 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left">
                    {theme.theme_type === "modern-green" ? (
                      <img src={theme.preview_image ?? "/login/modern-green-artwork.jpeg"} alt="Modern login left-side artwork preview" className="h-full w-full object-cover object-left" />
                    ) : (
                      <div className="flex h-full">
                        <div className="w-1/2 bg-[#172517] p-3 text-[8px] font-semibold text-white"><span>ThinkSales Pro</span><p className="mt-3 text-sm leading-tight">Smart Sales.<br />Stronger Business.</p><div className="mt-4 h-10 rounded bg-white/10" /></div>
                        <div className="flex w-1/2 flex-col items-center justify-center gap-2 bg-white p-2"><span className="h-5 w-5 rounded-md bg-[#203822]" /><span className="h-2 w-16 rounded bg-slate-200" /><span className="h-4 w-full rounded border border-slate-200" /><span className="h-4 w-full rounded border border-slate-200" /><span className="h-4 w-full rounded bg-[#203822]" /></div>
                      </div>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-xs font-semibold text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100"><Eye className="mr-1.5 h-4 w-4" /> Preview</span>
                    </button>
                    {theme.theme_type === "modern-green" && (
                      <form onSubmit={(event) => void uploadArtwork(theme.id, event)} className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                        <input type="hidden" name="themeId" value={theme.id} />
                        <label htmlFor={`artwork-${theme.id}`} className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <ImagePlus className="h-4 w-4 text-emerald-700" /> Left-side artwork
                        </label>
                        <input
                          id={`artwork-${theme.id}`}
                          name="file"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          required
                          disabled={uploadingThemeId !== null}
                          className="block w-full cursor-pointer text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2.5 file:py-2 file:text-xs file:font-semibold file:text-slate-700 file:shadow-sm hover:file:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <p className="mt-2 text-[11px] leading-4 text-slate-500">JPG, PNG, or WebP · up to 20MB · preferred 2560 × 2880 px; minimum 1600 × 1800 px. Original image quality is preserved.</p>
                        <button
                          type="submit"
                          disabled={uploadingThemeId !== null}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {uploadingThemeId === theme.id ? "Uploading artwork…" : "Upload artwork"}
                        </button>
                      </form>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-900">{theme.name}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${theme.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{theme.is_active ? "Active" : "Inactive"}</span>
                        {isGlobal && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Global</span>}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{theme.description}</p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Used by {assignedCount} organizations</span>
                        <span>Created {new Date(theme.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setPreview(theme); setPreviewDevice("desktop"); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"><Eye className="h-3.5 w-3.5" /> Preview</button>
                      <button type="button" disabled={!theme.is_active || isGlobal || busy} onClick={() => void run(() => setGlobalLoginTheme(theme.id), "Global login theme saved.")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-40"><Globe2 className="h-3.5 w-3.5" /> Set as Global</button>
                      <button type="button" onClick={() => document.getElementById("organization-login-themes")?.scrollIntoView({ behavior: "smooth" })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"><Users className="h-3.5 w-3.5" /> Assign to Organizations</button>
                      <button type="button" onClick={() => openEditor(theme)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button type="button" disabled={busy} onClick={() => { setDuplicateSource(theme); setForm({ name: `${theme.name} Copy`, description: theme.description }); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"><ChevronDown className="h-3.5 w-3.5" /> Duplicate</button>
                      <button type="button" disabled={busy || theme.id === "default-thinksales-login"} onClick={() => void run(() => setLoginThemeActive(theme.id, !theme.is_active), theme.is_active ? "Theme deactivated." : "Theme activated.")} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-40">{theme.is_active ? "Deactivate" : "Activate"}</button>
                    </div>
                  </div>
                </article>
              );
            })}
            {themes.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No login themes are loaded. Apply the platform login experience migration, then refresh this page.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2"><Monitor className="h-4 w-4 text-slate-600" /><h3 className="font-semibold text-slate-950">Live Preview</h3></div>
          <p className="mt-1 text-xs text-slate-500">Preview a login design without changing the active theme.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["desktop", "tablet", "mobile"] as const).map((device) => {
              const Icon = device === "desktop" ? Monitor : device === "tablet" ? Tablet : Smartphone;
              return <button key={device} type="button" onClick={() => { setPreviewDevice(device); if (!preview) setPreview(activeThemes[0] ?? null); }} className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold capitalize ${previewDevice === device ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600"}`}><Icon className="h-3.5 w-3.5" />{device}</button>;
            })}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {preview?.theme_type === "modern-green" ? (
              <div className="max-h-[460px] overflow-auto">
                <ModernGreenLogin preview device={previewDevice} artworkUrl={preview.preview_image} />
              </div>
            ) : preview ? (
              <div className="max-h-[460px] overflow-auto"><LegacyLoginPreview /></div>
            ) : (
              <div className="flex min-h-[280px] items-center justify-center p-8 text-center text-sm text-slate-500">Choose Preview on a theme to see the login experience.</div>
            )}
          </div>
          <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-800">This is a preview only. A theme is applied only after you explicitly set it globally or assign it to an organization.</p>
        </section>
      </div>

      <section id="organization-login-themes" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /><div><h3 className="font-semibold text-slate-950">Theme Configuration</h3><p className="mt-1 text-xs text-slate-500">Choose the platform default and manage organization-specific overrides.</p></div></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-start gap-2"><Globe2 className="mt-0.5 h-4 w-4 text-blue-600" /><div className="min-w-0 flex-1"><h4 className="text-sm font-semibold">Global Login Theme</h4><p className="mt-1 text-xs text-slate-500">Used by organizations that do not have a custom theme.</p></div></div>
            <div className="mt-3 flex gap-2">
              <select value={selectedGlobal} onChange={(event) => setSelectedGlobal(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm">
                {activeThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
              </select>
              <button type="button" disabled={busy || selectedGlobal === globalThemeId} onClick={() => { const theme = activeThemes.find((item) => item.id === selectedGlobal); void run(() => setGlobalLoginTheme(selectedGlobal), `${theme?.name ?? "Global theme"} saved.`); }} className="inline-flex h-10 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-40"><Check className="h-3.5 w-3.5" /> Save</button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 text-blue-600" /><div><h4 className="text-sm font-semibold">Organization Login Theme</h4><p className="mt-1 text-xs text-slate-500">Choose Global or a custom theme for each organization.</p></div></div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {organizations.map((organization) => {
                const draft = assignments[organization.organization_id] ?? "";
                const current = organization.use_global_login_theme ? "" : organization.login_theme_id ?? "";
                return (
                  <div key={organization.organization_id} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(150px,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-800" title={organization.organization_id}>{organization.name}</span>
                      {organization.slug && <a href={`/login?org=${encodeURIComponent(organization.slug)}`} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-[10px] text-blue-600 hover:underline">Preview organization login</a>}
                    </div>
                    <select value={draft} onChange={(event) => setAssignments((state) => ({ ...state, [organization.organization_id]: event.target.value }))} className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs">
                      <option value="">Use Global Theme</option>
                      {activeThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
                    </select>
                    <button type="button" disabled={busy || draft === current} onClick={() => void run(() => setOrganizationLoginTheme(organization.organization_id, draft || null), `${organization.name} login theme saved.`)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40">Save</button>
                  </div>
                );
              })}
              {organizations.length === 0 && <p className="text-xs text-slate-500">No organizations are available.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="font-semibold text-slate-950">Change History</h3>
        <p className="mt-1 text-xs text-slate-500">Theme assignments and global theme changes, recorded by Platform Administration.</p>
        <div className="mt-3 divide-y divide-slate-100">
          {auditLogs.map((entry) => (
            <div key={entry.id} className="grid gap-1 py-3 text-xs sm:grid-cols-[1fr_1.4fr_1fr_1.2fr]">
              <span className="font-medium text-slate-800">{String(entry.metadata.organizationName ?? (entry.organization_id ? organizations.find((org) => org.organization_id === entry.organization_id)?.name : "Platform-wide") ?? "Platform-wide")}</span>
              <span className="text-slate-600">{String(entry.metadata.previousThemeName ?? "—")} <span className="px-1 text-slate-400">→</span> {String(entry.metadata.newThemeName ?? entry.metadata.themeName ?? "Theme updated")}</span>
              <span className="text-slate-500">Changed by {entry.admin_name}</span>
              <time className="text-slate-400">{new Date(entry.created_at).toLocaleString()}</time>
            </div>
          ))}
          {auditLogs.length === 0 && <p className="py-4 text-xs text-slate-500">No login theme changes have been recorded yet.</p>}
        </div>
      </section>

      {(editing || duplicateSource) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="login-theme-dialog-title">
          <form
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              if (editing) void run(() => updateLoginTheme(editing.id, form.name, form.description), "Login theme updated.").then((saved) => { if (saved) closeDialogs(); });
              else if (duplicateSource) void run(() => duplicateLoginTheme(duplicateSource.id, form.name), "Login theme duplicated as an inactive theme.").then((saved) => { if (saved) closeDialogs(); });
            }}
          >
            <div className="flex items-center justify-between"><h3 id="login-theme-dialog-title" className="text-lg font-bold text-slate-900">{editing ? "Edit login theme" : "Add login theme"}</h3><button type="button" onClick={closeDialogs} className="text-xl text-slate-400" aria-label="Close">×</button></div>
            <label className="block text-xs font-semibold text-slate-700">Theme name<input required maxLength={80} value={form.name} onChange={(event) => setForm((state) => ({ ...state, name: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
            <label className="block text-xs font-semibold text-slate-700">Description<textarea maxLength={300} rows={3} value={form.description} onChange={(event) => setForm((state) => ({ ...state, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal" /></label>
            {!editing && <p className="text-xs text-slate-500">New themes start inactive and inherit the selected visual renderer. You can activate them after review.</p>}
            <div className="flex justify-end gap-2"><button type="button" onClick={closeDialogs} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : editing ? "Save changes" : "Create theme"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
