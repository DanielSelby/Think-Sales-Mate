"use client";

import { useEffect, useState } from "react";
import { Download, WifiOff, X } from "lucide-react";
import { syncOfflineQueue } from "@/lib/offline/queue";
import { getOfflineDataLoadMode, getOfflineSyncMode, loadOfflineData } from "@/lib/offline/cache";
import { getOfflineQueue } from "@/lib/offline/queue";

export function PwaProvider() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [offline, setOffline] = useState(false);
  const [approvals, setApprovals] = useState<Array<"sync" | "data">>([]);
  const [working, setWorking] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[pwa] Service worker registration failed:", error);
      });
    }
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    const updateConnection = async () => {
      const isOnline = navigator.onLine;
      setOffline(!isOnline);
      const path = window.location.pathname;
      const isOperationalApp = !path.startsWith("/platform-admin") && !path.startsWith("/order/");
      if (isOnline && isOperationalApp) {
        try {
          const settingsResponse = await fetch("/api/offline/settings", { cache: "no-store" });
          if (settingsResponse.ok) {
            const settings = await settingsResponse.json() as {
              enabled: boolean;
              syncMode: "automatic" | "approval" | "manual";
              dataLoadMode: "automatic" | "approval" | "manual";
            };
            window.localStorage.setItem("thinksales-offline-enabled", String(settings.enabled));
            window.localStorage.setItem("thinksales-offline-sync-mode", settings.syncMode);
            window.localStorage.setItem("thinksales-offline-data-load-mode", settings.dataLoadMode);
          } else {
            console.error("[pwa] Could not refresh offline settings:", settingsResponse.status);
          }
        } catch (error) {
          console.error("[pwa] Could not refresh offline settings:", error);
        }

        const enabled = window.localStorage.getItem("thinksales-offline-enabled") === "true";
        const mode = getOfflineDataLoadMode();
        const pending: Array<"sync" | "data"> = [];
        if (mode === "automatic" && enabled) {
          await loadOfflineData();
        } else if (mode === "approval" && enabled) {
          pending.push("data");
        }
        if (getOfflineSyncMode() === "automatic" && getOfflineQueue().length > 0) {
          void syncOfflineQueue();
        } else if (getOfflineSyncMode() === "approval" && getOfflineQueue().length > 0) {
          pending.unshift("sync");
        }
        setApprovals(pending);
      }
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    updateConnection();
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
    setShowInstall(false);
  }

  async function approveOfflineAction() {
    const approval = approvals[0];
    if (!approval) return;
    setWorking(true);
    setApprovalMessage(null);
    try {
      if (approval === "sync") {
        const result = await syncOfflineQueue();
        setApprovalMessage(`${result.synced} transaction(s) synced${result.failed ? `; ${result.failed} need attention` : ""}.`);
      } else {
        const data = await loadOfflineData();
        setApprovalMessage(data
          ? `Offline data loaded: ${data.products.length} products and ${data.customers.length} customers.`
          : "Offline data could not be loaded. Check the connection and try again.");
      }
      setApprovals((current) => current.slice(1));
      setApprovalMessage(null);
    } catch (error) {
      console.error("[pwa] Approved offline action failed:", error);
      setApprovalMessage(error instanceof Error ? error.message : "The offline action failed. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      {approvals.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-[85] flex w-[min(92vw,30rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl dark:border-blue-900 dark:bg-ink-900">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink-900 dark:text-white">
              {approvals[0] === "sync" ? "Offline transactions are ready" : "Load data for offline use?"}
            </p>
            <p className="mt-1 text-xs text-ledger-500">
              {approvalMessage ?? (approvals[0] === "sync"
                ? `${getOfflineQueue().length} queued transaction(s) can be synced now.`
                : "This refreshes a reference-data snapshot. Keep a Sales/POS screen open or previously loaded to create sales offline.") }
            </p>
          </div>
          <button type="button" disabled={working} onClick={() => void approveOfflineAction()} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {working ? "Working…" : approvals[0] === "sync" ? "Sync now" : "Load data"}
          </button>
          <button type="button" disabled={working} onClick={() => { setApprovals((current) => current.slice(1)); setApprovalMessage(null); }} className="rounded-xl border border-ledger-200 px-3 py-2 text-xs font-semibold text-ledger-600 dark:border-ledger-700 dark:text-ledger-300">
            Later
          </button>
        </div>
      )}
      {offline && (
        <div className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xl">
          <WifiOff className="h-4 w-4" /> You are offline. Changes will resume when connected.
        </div>
      )}
      {showInstall && (
        <div className="fixed bottom-4 right-4 z-[80] flex max-w-sm items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-2xl dark:border-blue-900 dark:bg-ink-900">
          <Download className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-ink-900 dark:text-white">Install ThinkSales</p>
            <p className="text-xs text-ledger-500">Use ThinkSales like a native app.</p>
          </div>
          <button type="button" onClick={() => void install()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Install</button>
          <button type="button" onClick={() => setShowInstall(false)} aria-label="Dismiss install prompt" className="text-ledger-400 hover:text-ink-900"><X className="h-4 w-4" /></button>
        </div>
      )}
    </>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
