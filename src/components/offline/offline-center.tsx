"use client";

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import {
  getOfflineQueue,
  removeOfflineOperation,
  subscribeOfflineQueue,
  syncOfflineQueue,
  type OfflineOperation,
} from "@/lib/offline/queue";
import { loadOfflineData, readOfflineCache } from "@/lib/offline/cache";

export function OfflineCenter() {
  const [queue, setQueue] = useState<OfflineOperation[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cacheSnapshot, setCacheSnapshot] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setQueue(getOfflineQueue());
      const cache = readOfflineCache();
      setCacheSnapshot(cache ? `Cached ${cache.products.length} products · ${cache.customers.length} customers` : "No cached data yet.");
    };
    const connection = () => setOnline(navigator.onLine);
    refresh();
    connection();
    const unsubscribe = subscribeOfflineQueue(refresh);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      unsubscribe();
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);

  async function sync() {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await syncOfflineQueue();
      setMessage(`${result.synced} transaction(s) synced${result.failed ? `, ${result.failed} need attention` : ""}.`);
      setQueue(getOfflineQueue());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed. Your queued transactions are still saved.");
    } finally {
      setSyncing(false);
    }
  }

  async function loadData() {
    setLoadingData(true);
    setMessage(null);
    const result = await loadOfflineData();
    if (result) {
      setCacheSnapshot(`Cached ${result.products.length} products · ${result.customers.length} customers`);
      setMessage("Offline data refreshed and stored on this device.");
    } else {
      setMessage("No data could be loaded right now. Please reconnect and try again.");
    }
    setLoadingData(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Offline Center</h1>
        <p className="mt-1 text-sm text-ledger-500">Review and sync queued sales. To create a sale offline, keep a Sales/POS screen that was opened online available on this device.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <WifiOff className={`h-5 w-5 ${online ? "text-emerald-600" : "text-amber-600"}`} />
          <p className="mt-3 text-xs text-ledger-500">Connection</p>
          <p className="font-semibold text-ink-900 dark:text-white">{online ? "Online" : "Offline"}</p>
        </div>
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <RefreshCw className="h-5 w-5 text-blue-600" />
          <p className="mt-3 text-xs text-ledger-500">Queued transactions</p>
          <p className="font-semibold text-ink-900 dark:text-white">{queue.length}</p>
        </div>
        <button onClick={() => void sync()} disabled={!online || syncing || queue.length === 0} className="rounded-2xl bg-blue-600 p-5 text-left text-white shadow-card disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`} />
          <p className="mt-3 text-xs text-blue-100">Sync now</p>
          <p className="font-semibold">{syncing ? "Syncing…" : "Sync queued work"}</p>
        </button>
      </div>
      <div className="rounded-2xl border border-ledger-100 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-ledger-500">Reference-data snapshot (not a substitute for an offline-ready Sales/POS screen)</p>
            <p className="text-sm font-semibold text-ink-900 dark:text-white">{cacheSnapshot ?? "No cached data yet."}</p>
          </div>
          <button onClick={() => void loadData()} disabled={loadingData || !online} className="inline-flex items-center gap-2 rounded-xl border border-ledger-200 bg-white px-3 py-2 text-xs font-semibold text-ink-900 hover:bg-ledger-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-white dark:hover:bg-white/[0.04]">
            <Download className={`h-3.5 w-3.5 ${loadingData ? "animate-pulse" : ""}`} />
            {loadingData ? "Loading…" : "Load data"}
          </button>
        </div>
      </div>
      {message && <p className="text-sm text-ledger-600">{message}</p>}
      <div className="rounded-2xl border border-ledger-100 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
        {queue.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> No pending offline transactions.</div>
        ) : queue.map((operation) => (
          <div key={operation.id} className="flex items-center justify-between border-b border-ledger-100 py-3 last:border-0 dark:border-ledger-700">
            <div><p className="text-sm font-semibold text-ink-900 dark:text-white">Sales transaction</p><p className="text-xs text-ledger-500">{new Date(operation.createdAt).toLocaleString()}</p>{operation.status === "failed" && <span className="mt-1 flex items-center gap-1 text-xs text-alert"><AlertTriangle className="h-4 w-4" /> {operation.error}</span>}</div>
            <button type="button" onClick={() => { if (confirm("Remove this queued transaction from this device? It will not be synced.")) removeOfflineOperation(operation.id); }} className="rounded-lg border border-ledger-200 px-2.5 py-1.5 text-xs font-semibold text-alert dark:border-ledger-700">Discard</button>
          </div>
        ))}
      </div>
    </div>
  );
}
