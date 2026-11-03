"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { savePlatformWatermark } from "./actions";
import type { PlatformWatermarkConfiguration, WatermarkPosition } from "@/lib/platform-watermark";

const positions: { value: WatermarkPosition; label: string }[] = [
  { value: "center", label: "Center" },
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

export function WatermarkManager({ initialConfiguration }: { initialConfiguration: PlatformWatermarkConfiguration }) {
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [enabled, setEnabled] = useState(initialConfiguration.enabled);
  const [opacity, setOpacity] = useState(Math.round(initialConfiguration.opacity * 100));
  const [position, setPosition] = useState(initialConfiguration.position);
  const [displayStyle, setDisplayStyle] = useState(initialConfiguration.displayStyle);
  const [desktopSize, setDesktopSize] = useState(initialConfiguration.desktopSize);
  const [mobileSize, setMobileSize] = useState(initialConfiguration.mobileSize);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const save = async (removeImage = false) => {
    setBusy(true);
    setMessage(null);
    const formData = new FormData();
    formData.set("enabled", String(removeImage ? false : enabled));
    formData.set("opacity", String(opacity / 100));
    formData.set("position", position);
    formData.set("displayStyle", displayStyle);
    formData.set("desktopSize", String(desktopSize));
    formData.set("mobileSize", String(mobileSize));
    if (removeImage) {
      formData.set("removeImage", "true");
    } else if (file) {
      formData.set("watermark", file);
    }
    try {
      const saved = await savePlatformWatermark(formData);
      setConfiguration(saved);
      setEnabled(saved.enabled);
      setOpacity(Math.round(saved.opacity * 100));
      setPosition(saved.position);
      setDisplayStyle(saved.displayStyle);
      setDesktopSize(saved.desktopSize);
      setMobileSize(saved.mobileSize);
      setFile(null);
      setMessageIsError(false);
      setMessage(removeImage ? "The global watermark image was removed." : "Watermark settings saved.");
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "Watermark settings could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const imageUrl = previewUrl ?? configuration.imageUrl;

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Branding &amp; Watermark Management</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Manage the platform watermark shown behind authenticated ERP screens for every organization.
            It is separate from system, login, and organization logos, and is excluded from printing.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={!configuration.imageUrl && !file}
            className="h-4 w-4 rounded border-slate-300"
          />
          Enable global watermark
        </label>
      </div>

      {message && (
        <p role={messageIsError ? "alert" : "status"} className={`mt-4 rounded-lg p-3 text-sm ${messageIsError ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
          {message}
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div>
            <label htmlFor="watermark-image" className="block text-sm font-semibold text-slate-800">Dedicated watermark image</label>
            <p className="mt-1 text-xs text-slate-500">PNG, SVG, or WebP; maximum 2 MB. Transparent PNG or SVG is recommended.</p>
            <input
              id="watermark-image"
              type="file"
              accept=".png,.svg,.webp,image/png,image/svg+xml,image/webp"
              onChange={(event) => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                const selectedFile = event.target.files?.[0] ?? null;
                setFile(selectedFile);
                setPreviewUrl(selectedFile ? URL.createObjectURL(selectedFile) : null);
              }}
              className="mt-2 block w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-blue-700"
            />
          </div>

          <label className="block">
            <span className="flex justify-between text-sm font-medium text-slate-700"><span>Opacity</span><span>{opacity}%</span></span>
            <input type="range" min="1" max="50" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} className="mt-2 w-full" />
            <span className="text-xs text-slate-500">Default is 4%; lower values are less prominent.</span>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Position
            <select value={position} onChange={(event) => setPosition(event.target.value as WatermarkPosition)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              {positions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Image display
            <select value={displayStyle} onChange={(event) => setDisplayStyle(event.target.value as "normal" | "3d")} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="normal">Normal</option>
              <option value="3d">3D perspective</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">The 3D style adds a subtle perspective tilt and shadow.</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Desktop size ({desktopSize}px)
              <input type="range" min="100" max="800" step="10" value={desktopSize} onChange={(event) => setDesktopSize(Number(event.target.value))} className="mt-2 block w-full" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Mobile size ({mobileSize}px)
              <input type="range" min="60" max="400" step="10" value={mobileSize} onChange={(event) => setMobileSize(Number(event.target.value))} className="mt-2 block w-full" />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Saving..." : "Save watermark settings"}
            </button>
            {configuration.imageUrl && (
              <button type="button" disabled={busy} onClick={() => void save(true)} className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50">
                Remove current watermark
              </button>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-800">Image preview</h3>
          <div className="mt-2 flex min-h-56 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
            {imageUrl
              ? <Image
                src={imageUrl}
                alt="Watermark preview"
                unoptimized
                width={320}
                height={192}
                className={`max-h-48 max-w-full object-contain ${displayStyle === "3d" ? "drop-shadow-[10px_12px_5px_rgba(15,23,42,0.35)] [transform:perspective(900px)_rotateX(10deg)_rotateY(-8deg)]" : ""}`}
                style={{ opacity: opacity / 100 }}
              />
              : <p className="text-center text-sm text-slate-500">Choose an image to preview the watermark.</p>}
          </div>
          {configuration.updatedAt && (
            <p className="mt-3 text-xs text-slate-500">
              Last updated {new Date(configuration.updatedAt).toLocaleString()}
              {configuration.updatedBy ? " by a Platform Admin" : ""}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
