"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { THEMES } from "@/store/useAppStore";
import { PLATFORM_THEME_KEYS, type PlatformThemeKey } from "@/lib/platform-theme";
import { saveProductHubSystemTheme, type ProductHubAppearanceActionResult } from "./actions";

export function ProductHubThemeManager({
  initialTheme,
  canManage,
}: {
  initialTheme: PlatformThemeKey;
  canManage: boolean;
}) {
  const router = useRouter();
  const [themeKey, setThemeKey] = useState(initialTheme);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ProductHubAppearanceActionResult | null>(null);

  function saveTheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const formData = new FormData();
    formData.set("themeKey", themeKey);
    startTransition(async () => {
      try {
        const actionResult = await saveProductHubSystemTheme(formData);
        setResult(actionResult);
        if (actionResult.ok) router.refresh();
      } catch (error) {
        setResult({
          ok: false,
          error: error instanceof Error ? error.message : "Could not save the Product Hub theme.",
        });
      }
    });
  }

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Product Hub System Theme</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Choose one of the system themes. Its colors will be used for Product Hub buttons, navigation accents, and highlights.
      </p>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`mt-4 rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
      <form onSubmit={saveTheme}>
        <fieldset disabled={!canManage || isPending} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="sr-only">Select the Product Hub system theme</legend>
          {PLATFORM_THEME_KEYS.map((key) => {
            const theme = THEMES[key];
            const selected = themeKey === key;
            return (
              <label
                key={key}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition ${
                  selected ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <input
                    type="radio"
                    name="product-hub-theme"
                    value={key}
                    checked={selected}
                    onChange={() => setThemeKey(key)}
                    className="h-4 w-4 shrink-0 accent-blue-700"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">{theme.name}</span>
                    <span className="mt-1 flex gap-1.5" aria-label={`${theme.name} color palette`}>
                      {[theme.colors.primary, theme.colors.accent, theme.colors.primaryPale].map((color) => (
                        <span key={color} aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                      ))}
                    </span>
                  </span>
                </span>
                {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-700" />}
              </label>
            );
          })}
        </fieldset>
        <button type="submit" disabled={!canManage || isPending} className="mt-4 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {isPending ? "Saving..." : "Save Product Hub theme"}
        </button>
      </form>
    </section>
  );
}
