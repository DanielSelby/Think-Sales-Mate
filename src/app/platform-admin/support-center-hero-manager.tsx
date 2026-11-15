"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadSupportCenterHeroImage, type ProductHubAppearanceActionResult } from "./actions";

export function SupportCenterHeroManager({ initialImageUrl }: { initialImageUrl: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProductHubAppearanceActionResult | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setResult({ ok: false, error: "Choose an image to upload." });
      return;
    }

    setBusy(true);
    setResult(null);
    const formData = new FormData();
    formData.set("image", file);
    try {
      const uploadResult = await uploadSupportCenterHeroImage(formData);
      setResult(uploadResult);
      if (uploadResult.ok) {
        setFile(null);
        setPreviewUrl(null);
        router.refresh();
      }
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Could not upload the Support Center image.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Support Center Hero Image</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Upload the background image displayed at the top of the Support Center. JPG, PNG, SVG, or WebP up to 2 MB.
      </p>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`mt-4 rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={upload} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-800">
            Choose hero image
            <input
              type="file"
              accept="image/jpeg,image/png,image/svg+xml,image/webp"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null;
                setFile(selectedFile);
                setPreviewUrl(selectedFile ? URL.createObjectURL(selectedFile) : null);
                setResult(null);
              }}
              className="mt-2 block w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-blue-700"
            />
          </label>
          <button type="submit" disabled={!file || busy} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Uploading..." : "Upload hero image"}
          </button>
        </form>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Preview</h3>
          <div className="relative mt-2 aspect-[16/5] overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
            <Image
              src={previewUrl ?? initialImageUrl}
              alt={previewUrl ? "Selected Support Center hero preview" : "Current Support Center hero image"}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
