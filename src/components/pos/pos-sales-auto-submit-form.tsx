"use client";

import Form from "next/form";
import { useEffect, useRef, type FormEvent, type FormHTMLAttributes } from "react";

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method">;

export function PosSalesAutoSubmitForm({ children, onChange, ...props }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  function handleChange(event: FormEvent<HTMLFormElement>) {
    onChange?.(event);
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.name === "search" || target.type === "hidden") return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => formRef.current?.requestSubmit(), 250);
  }

  return (
    <Form ref={formRef} action="/pos/list" onChange={handleChange} {...props}>
      {children}
    </Form>
  );
}
