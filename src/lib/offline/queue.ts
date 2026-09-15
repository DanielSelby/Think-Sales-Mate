"use client";

export type OfflineSyncMode = "automatic" | "approval" | "manual";
export type OfflineOperationType = "sale";

export interface OfflineOperation {
  id: string;
  type: OfflineOperationType;
  payload: unknown;
  createdAt: string;
  status: "queued" | "syncing" | "failed";
  error?: string;
}

const STORAGE_KEY = "thinksales-offline-queue";
const CHANGE_EVENT = "thinksales-offline-queue-changed";

function readQueue(): OfflineOperation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as OfflineOperation[];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineOperation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getOfflineQueue() {
  return readQueue();
}

export function enqueueOfflineOperation(type: OfflineOperationType, payload: unknown) {
  const operation: OfflineOperation = {
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    status: "queued",
  };
  writeQueue([...readQueue(), operation]);
  return operation;
}

export function subscribeOfflineQueue(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export async function syncOfflineQueue() {
  const queue = readQueue();
  const remaining: OfflineOperation[] = [];

  for (const operation of queue) {
    try {
      const response = await fetch("/api/offline/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        remaining.push({ ...operation, status: "failed", error: result.error ?? "Sync failed." });
      }
    } catch {
      remaining.push({ ...operation, status: "failed", error: "Connection lost while syncing." });
    }
  }

  writeQueue(remaining);
  return { synced: queue.length - remaining.length, failed: remaining.length };
}
