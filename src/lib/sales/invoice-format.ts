"use client";

import * as React from "react";

export type InvoiceFormat = "a4" | "thermal-80mm" | "thermal-58mm";

const DEFAULT_FORMAT: InvoiceFormat = "a4";
const values = new Map<string, InvoiceFormat>();
const subscribers = new Map<string, Set<() => void>>();

function storageKey(userId: string) {
  return `salesmate-invoice-format:${userId}`;
}

function isInvoiceFormat(value: string | null): value is InvoiceFormat {
  return value === "a4" || value === "thermal-80mm" || value === "thermal-58mm";
}

function readFormat(key: string): InvoiceFormat {
  const inMemory = values.get(key);
  if (inMemory) return inMemory;
  if (typeof window === "undefined") return DEFAULT_FORMAT;
  try {
    const stored = window.localStorage.getItem(key);
    if (isInvoiceFormat(stored)) {
    values.set(key, stored);
    return stored;
    }
  } catch {
    return DEFAULT_FORMAT;
  }
  return DEFAULT_FORMAT;
}

function subscribe(key: string, listener: () => void) {
  let listeners = subscribers.get(key);
  if (!listeners) {
    listeners = new Set();
    subscribers.set(key, listeners);
  }
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) {
    try {
      if (isInvoiceFormat(event.newValue)) values.set(key, event.newValue);
      else values.delete(key);
    } catch {
      values.delete(key);
    }
    listener();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) subscribers.delete(key);
    window.removeEventListener("storage", handleStorage);
  };
}

function writeFormat(key: string, format: InvoiceFormat) {
  values.set(key, format);
  try {
    window.localStorage.setItem(key, format);
  } catch {
    // Keep the preference for this page when browser storage is unavailable.
  }
  subscribers.get(key)?.forEach((listener) => listener());
}

export function useInvoiceFormat(userId: string) {
  const key = storageKey(userId);
  const format = React.useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => readFormat(key),
    () => DEFAULT_FORMAT
  );
  return [format, (value: InvoiceFormat) => writeFormat(key, value)] as const;
}
