"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { getMobileScannerSession, submitMobileBarcode } from "@/app/(dashboard)/pos/mobile-scanner-actions";

export default function MobileScannerClient({ token }: { token: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const processedScanRef = useRef(false);
  const [loading, setLoading] = useState(Boolean(token));
  const [locationName, setLocationName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastScanned, setLastScanned] = useState("");
  const [error, setError] = useState(token ? "" : "The scanner link is missing its pairing code. Create a new connection from desktop Sales or POS.");

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    void getMobileScannerSession(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setLocationName(result.data.locationName);
        setExpiresAt(result.data.expiresAt);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => controlsRef.current?.stop(), []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || scanning || sending) return;
    setError("");
    setLastScanned("");
    try {
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [BarcodeFormat.CODE_128];
      processedScanRef.current = false;
      setScanning(true);
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, async (result) => {
        if (!result || processedScanRef.current) return;
        const barcode = result.getText().trim();
        if (!barcode) return;
        processedScanRef.current = true;
        stopCamera();
        setSending(true);
        try {
          const response = await submitMobileBarcode(token, barcode);
          if (response.ok) setLastScanned(barcode);
          else setError(response.error);
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "The scan could not be sent to the desktop.");
        } finally {
          setSending(false);
        }
      });
    } catch (cameraError) {
      setScanning(false);
      setError(cameraError instanceof Error
        ? `Could not start the camera: ${cameraError.message}. Allow camera access and make sure this page is open over HTTPS.`
        : "Could not start the camera. Allow camera access and make sure this page is open over HTTPS.");
    }
  }, [scanning, sending, stopCamera, token]);

  if (loading) {
    return <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center p-5 text-sm text-slate-600">Connecting to desktop sale…</main>;
  }

  if (error && !locationName) {
    const next = `/mobile-scan?token=${encodeURIComponent(token)}`;
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center p-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Phone barcode scanner</h1>
          <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>
          {error.toLowerCase().includes("sign in") && (
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
              Sign in to SalesMate
            </Link>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 bg-slate-50 p-4 text-slate-900">
      <header className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">SalesMate ERP · Mobile Scanner</p>
        <h1 className="mt-1 text-xl font-bold">Phone barcode scanner</h1>
        <p className="mt-2 text-sm text-slate-600">Connected to branch: <strong>{locationName}</strong></p>
        {expiresAt && <p className="mt-1 text-xs text-slate-500">Connection expires {new Date(expiresAt).toLocaleTimeString()}.</p>}
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          {!scanning && !sending && !lastScanned && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded bg-black/60 px-3 py-1 text-xs text-white">Camera preview appears here</span>
            </div>
          )}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {sending && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">Sending scan to desktop…</p>}
        {lastScanned && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Scanned {lastScanned}. Check the desktop sale, then scan the next item.</p>}
        {!scanning && !sending && (
          <button type="button" onClick={() => void startCamera()} className="mt-4 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">
            {lastScanned ? "Scan next item" : "Start camera"}
          </button>
        )}
        {scanning && <button type="button" onClick={stopCamera} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold">Stop camera</button>}
      </section>
      <p className="px-1 text-center text-xs text-slate-500">Keep this page open while scanning. Barcode values are sent to the paired desktop and no camera images are saved.</p>
    </main>
  );
}
