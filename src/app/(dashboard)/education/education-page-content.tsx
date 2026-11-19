"use client";

import type { KeyboardEvent, ReactNode } from "react";

function preventImplicitFormSubmit(event: KeyboardEvent<HTMLDivElement>) {
  if (
    event.key !== "Enter"
    || event.nativeEvent.isComposing
    || event.shiftKey
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || !(event.target instanceof HTMLInputElement)
  ) return;

  const inputType = event.target.type;
  if (["button", "checkbox", "file", "image", "radio", "reset", "submit"].includes(inputType)) return;

  const form = event.target.form;
  if (!form || form.getAttribute("method")?.toLowerCase() === "get") return;

  event.preventDefault();
}

export function EducationPageContent({ children }: { children: ReactNode }) {
  return <div className="education-page-content" onKeyDownCapture={preventImplicitFormSubmit}>{children}</div>;
}
