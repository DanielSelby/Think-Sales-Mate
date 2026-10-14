"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function PosSalesSearchInput({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timeout = window.setTimeout(() => inputRef.current?.form?.requestSubmit(), 250);
    return () => window.clearTimeout(timeout);
  }, [value]);

  return (
    <label className="relative sm:col-span-2">
      <span className="sr-only">Search receipt, transaction, customer or phone</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
      <Input
        ref={inputRef}
        name="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Receipt, transaction, customer or phone"
        className="pl-9"
      />
    </label>
  );
}
