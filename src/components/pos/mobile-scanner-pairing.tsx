"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  createMobileScannerSession,
  disconnectMobileScannerSession,
  pollMobileScannerScans,
} from "@/app/(dashboard)/pos/mobile-scanner-actions";

type SourceModule = "pos" | "sales";

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
    token: string;
    url: string;
    expiresAt: string;
    locationId: string;
  } | null>(null);
  const [qr, setQr] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [lastScanned, setLastScanned] = useState("");
  const cursor = useRef(0);
  const onBarcodeRef = useRef(onBarcode);

  useEffect(() => {
    onBarcodeRef.current = onBarcode;
  }, [onBarcode]);

  async function connect() {
    if (!locationId) {
      setError("Select a branch before connecting the phone scanner.");
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
        token: result.data.token,
        url: url.toString(),
        expiresAt: result.data.expiresAt,
        locationId,
      });
      setQr(qrData);
      setLastScanned("");
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
  }

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await pollMobileScannerScans(session.id, cursor.current);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      for (const scan of result.data) {
        cursor.current = Math.max(cursor.current, scan.sequenceId);
        if (session.locationId !== locationId) {
          setError("The selected branch changed. Disconnect and pair the phone again for the new branch.");
          continue;
        }
        const message = onBarcodeRef.current(scan.barcode);
        if (message) {
          setError(message);
          setLastScanned("");
        } else {
          setError("");
          setLastScanned(scan.barcode);
        }
      }
      timer = setTimeout(() => void poll(), 1200);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, locationId]);

  if (!enabled) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 shrink-0 px-2 sm:px-3"
        disabled={disabled || pending}
        onClick={() => void connect()}
        title={disabled ? "Open a POS register before connecting a phone" : "Connect a phone camera to scan items into this sale"}
      >
        <Smartphone className="h-4 w-4" />
        <span className="hidden sm:inline">{pending ? "Connecting…" : "Phone scan"}</span>
      </Button>

      <Dialog open={Boolean(session)} onClose={() => void disconnect()} title="Connect phone scanner" className="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-ledger-600 dark:text-ledger-300">
            Sign in on your phone to this same SalesMate organization, then scan this QR code. Keep this page open.
          </p>
          {qr && <Image src={qr} alt="QR code to connect the phone barcode scanner" width={224} height={224} unoptimized className="mx-auto h-56 w-56 rounded-lg border border-ledger-200 bg-white p-2" />}
          {session && <p className="text-center text-xs text-ledger-500">Branch: {locationName} · Expires {new Date(session.expiresAt).toLocaleTimeString()}</p>}
          {session && <p className="break-all rounded-lg bg-ledger-50 p-2 text-[11px] text-ledger-500 dark:bg-white/[0.04]">{session.url}</p>}
          {lastScanned && <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">Received barcode {lastScanned}.</p>}
          {error && <p role="alert" className="rounded-md bg-alert-soft p-3 text-sm text-alert">{error}</p>}
          <p className="text-center text-xs text-ledger-500">Phone scans are added to this sale automatically. Camera images are not stored.</p>
          <Button variant="outline" className="w-full" onClick={() => void disconnect()}>Disconnect phone</Button>
        </div>
      </Dialog>
    </>
  );
}
