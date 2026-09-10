"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPlatformClient } from "@/lib/supabase/platform-client";

export default function PlatformResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const client = createPlatformClient();
    client.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmation) return setError("Passwords do not match.");
    setSaving(true);
    const { error: updateError } = await createPlatformClient().auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    router.replace("/platform-admin/login?reset=success");
  }

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-white">This reset link is invalid or expired.</main>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-slate-950">Set a new platform password</h1>
        <p className="mt-2 text-sm text-slate-500">This password is only for the System Administration Platform.</p>
        <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="mt-6 h-11 w-full rounded-lg border border-slate-200 px-3" />
        <input required minLength={8} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirm password" className="mt-3 h-11 w-full rounded-lg border border-slate-200 px-3" />
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={saving} className="mt-6 h-11 w-full rounded-lg bg-blue-600 font-semibold text-white disabled:opacity-50">{saving ? "Updating..." : "Update password"}</button>
      </form>
    </main>
  );
}
