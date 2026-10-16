"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { AlertTriangle, ChevronRight, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { playBarcodeScanSound, prepareBarcodeScanSound } from "@/lib/sales/barcode-scan-sound";
import {
  createMobileScannerSession,
  disconnectMobileScannerSession,
  pollMobileScannerScans,
} from "@/app/(dashboard)/pos/mobile-scanner-actions";

type SourceModule = "pos" | "sales" | "inventory" | "transfers" | "stock_adjustment" | "purchases";

interface Props {
  enabled: boolean;
  sourceModule: SourceModule;
  locationId: string;
  locationName: string;
  disabled?: boolean;
  onBarcode: (barcode: string) => string | null;
}

export function MobileScannerPairing({
  enabled,
  sourceModule,
  locationId,
  locationName,
  disabled = false,
  onBarcode,
}: Props) {
  const [session, setSession] = useState<{
    id: string;
    url: string;
    locationId: string;
  } | null>(null);
  const [qr, setQr] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [scanWarning, setScanWarning] = useState("");
  const [lastScanned, setLastScanned] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const cursor = useRef(0);
  const onBarcodeRef = useRef(onBarcode);

  useEffect(() => {
    onBarcodeRef.current = onBarcode;
  }, [onBarcode]);

  useEffect(() => {
    const setOnline = () => {
      setIsOnline(true);
      setError("");
    };
    const setOffline = () => {
      setIsOnline(false);
      setError("Internet connection lost. The scanner will reconnect when you are back online.");
    };
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, []);

  async function connect() {
    prepareBarcodeScanSound();
    if (!locationId) {
      setError("Select a branch before connecting the phone scanner.");
      return;
    }
    if (session) {
      setMinimized(false);
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await createMobileScannerSession(locationId, sourceModule);
      if (!result.ok) throw new Error(result.error);
      const url = new URL("/mobile-scan/pair", window.location.origin);
      url.searchParams.set("token", result.data.token);
      const qrData = await QRCode.toDataURL(url.toString(), { width: 280, margin: 2, errorCorrectionLevel: "M" });
      cursor.current = 0;
      setSession({
        id: result.data.sessionId,
        url: url.toString(),
        locationId,
      });
      setQr(qrData);
      setLastScanned("");
      setMinimized(false);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not connect the phone scanner.");
    } finally {
      setPending(false);
    }
  }

  async function disconnect() {
    if (session) {
      const result = await disconnectMobileScannerSession(session.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
    }
    setSession(null);
    setQr("");
    setLastScanned("");
    setMinimized(false);
  }

  useEffect(() => {
    if (!session || !isOnline) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await pollMobileScannerScans(session.id, cursor.current);
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
        } else {
          for (const scan of result.data) {
            cursor.current = Math.max(cursor.current, scan.sequenceId);
            if (session.locationId !== locationId) {
              setError("The selected branch changed. Disconnect and pair the phone again for the new branch.");
              playBarcodeScanSound(false);
              continue;
            }
            const message = onBarcodeRef.current(scan.barcode);
            if (message) {
              setError(message);
              setScanWarning(message);
              setLastScanned("");
              playBarcodeScanSound(false);
            } else {
              setError("");
              setLastScanned(scan.barcode);
              playBarcodeScanSound(true);
            }
          }
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "Could not reach the phone scanner. Retrying…");
      } finally {
        if (!cancelled) timer = setTimeout(() => void poll(), 1500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, locationId, isOnline]);

  if (!enabled) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 shrink-0 gap-2 border-violet-200 bg-white px-2 text-violet-800 shadow-sm transition hover:border-fuchsia-300 hover:bg-violet-50 sm:px-3 dark:border-violet-800 dark:bg-ink-900 dark:text-violet-200 dark:hover:bg-violet-950/30"
        disabled={disabled || pending}
        onClick={() => void connect()}
        title={disabled ? "Open a POS register before connecting a phone" : "Connect a phone camera to scan items into this sale"}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-sky-500 text-white shadow-sm shadow-fuchsia-500/25">
          <Smartphone className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <span>{pending ? "Connecting…" : session ? "Phone scan · Connected" : "Phone scan"}</span>
      </Button>

      {session && minimized && (
        <button
          type="button"
          aria-label="Show phone scanner"
          title="Show phone scanner"
          onClick={() => setMinimized(false)}
          className="fixed right-3 top-1/2 z-40 flex h-11 w-8 -translate-y-1/2 items-center justify-center rounded-l-xl border border-violet-200 bg-gradient-to-b from-violet-600 via-fuchsia-600 to-sky-600 text-white shadow-lg shadow-violet-900/20 transition hover:w-10 dark:border-violet-800"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <Dialog open={Boolean(session) && !minimized} onClose={() => setMinimized(true)} title="Connect phone scanner" className="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-ledger-600 dark:text-ledger-300">
            Scan this QR code with your phone camera and sign in to the same SalesMate account. Hide this panel to keep scanning while you use the sale.
          </p>
          {qr && <Image src={qr} alt="QR code to connect the phone barcode scanner" width={224} height={224} unoptimized className="mx-auto h-56 w-56 rounded-lg border border-ledger-200 bg-white p-2" />}
          {session && <p className="text-center text-xs text-ledger-500">Branch: {locationName} · Stays connected until disconnected.</p>}
          {session && <p className="break-all rounded-lg bg-ledger-50 p-2 text-[11px] text-ledger-500 dark:bg-white/[0.04]">{session.url}</p>}
          {lastScanned && <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">Received barcode {lastScanned}.</p>}
          {!isOnline && <p role="status" className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">Internet connection lost. Scanning will resume when connection returns.</p>}
          {error && <p role="alert" className="rounded-md bg-alert-soft p-3 text-sm text-alert">{error}</p>}
          <p className="text-center text-xs text-ledger-500">Phone scans are added to this sale automatically. Camera images are not stored.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setMinimized(true)}>Hide scanner</Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => void disconnect()}>Disconnect phone</Button>
          </div>
        </div>
      </Dialog>
      {scanWarning && (
        <div
          className="fixed inset-0 z-[115] grid place-items-center bg-ink-950/65 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="mobile-scan-warning-title"
          aria-describedby="mobile-scan-warning-description"
        >
          <section className="animate-[stock-limit-pop_420ms_cubic-bezier(0.16,1,0.3,1)_both] relative w-full max-w-md rounded-3xl border border-red-200 bg-white p-7 text-center shadow-[0_32px_100px_rgba(127,29,29,0.42)] dark:border-red-800 dark:bg-ink-900">
            <button
              type="button"
              onClick={() => {
                setScanWarning("");
                setError("");
              }}
              aria-label="Close scan warning"
              className="absolute right-3 top-3 rounded-full p-2 text-ledger-500 transition hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.75rem] bg-red-50 text-red-600 shadow-[inset_0_2px_8px_rgba(127,29,29,0.12),0_12px_24px_rgba(127,29,29,0.2)] dark:bg-red-950/60 dark:text-red-300">
              <AlertTriangle className="h-10 w-10" strokeWidth={1.8} />
            </div>
            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-red-600 dark:text-red-300">Scan not added</p>
            <h2 id="mobile-scan-warning-title" className="mt-2 text-2xl font-bold text-ink-900 dark:text-white">Check this product</h2>
            <p id="mobile-scan-warning-description" className="mt-3 text-sm leading-6 text-ledger-600 dark:text-ledger-200">{scanWarning}</p>
            <Button
              type="button"
              className="mt-5 h-10 w-full rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
              onClick={() => {
                setScanWarning("");
                setError("");
              }}
            >
              Okay
            </Button>
          </section>
        </div>
      )}
    </>
  );
}
