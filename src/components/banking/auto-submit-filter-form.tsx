"use client";

import { useEffect, useRef, type ChangeEvent, type ReactNode } from "react";

export function AutoSubmitFilterForm({
  action,
  className,
  children,
  searchDelay = 350,
}: {
  action: string;
  className?: string;
  children: ReactNode;
  searchDelay?: number;
}) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  function submitOnChange(event: ChangeEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (field instanceof HTMLInputElement && field.type === "search") {
      timeoutRef.current = setTimeout(() => form.requestSubmit(), searchDelay);
      return;
    }

    if (field instanceof HTMLInputElement && field.name === "from") {
      const toField = form.elements.namedItem("to");
      if (toField instanceof HTMLInputElement && toField.type === "date") {
        toField.min = field.value;
        if (field.value && toField.value && toField.value < field.value) toField.value = "";
      }
    }

    form.requestSubmit();
  }

  function submitImmediately() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  return (
    <form action={action} method="get" className={className} onChange={submitOnChange} onSubmit={submitImmediately}>
      {children}
    </form>
  );
}
