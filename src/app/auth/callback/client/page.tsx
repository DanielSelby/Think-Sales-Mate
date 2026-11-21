"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSafeAuthCallbackNext } from "@/lib/education/portal-auth";

export default function ClientAuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const next = getSafeAuthCallbackNext(
      new URLSearchParams(window.location.search).get("next"),
      window.location.origin,
      "/reset-password",
    );
    const portalPath = ["/student-education-portal", "/education-portal", "/teacher-education-portal"]
      .includes(next) ? next : null;

    function handleCallbackError(message: string) {
      if (portalPath) {
        router.replace(`${portalPath}?signin=expired`);
        return;
      }
      if (!cancelled) setError(message);
    }

    async function completeCallback() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        handleCallbackError(sessionError.message);
        return;
      }

      if (data.session) {
        router.replace(next);
        return;
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (!accessToken || !refreshToken) {
        handleCallbackError("This sign-in link is invalid or has expired.");
        return;
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (setSessionError) {
        handleCallbackError(setSessionError.message);
        return;
      }
      router.replace(next);
    }

    void completeCallback();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] px-5">
      <p className="text-sm text-[#536052]">{error || "Verifying your invitation..."}</p>
    </main>
  );
}
