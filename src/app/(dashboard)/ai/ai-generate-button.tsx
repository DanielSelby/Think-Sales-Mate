"use client";

import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AiGenerateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Sparkles className="h-4 w-4 text-[var(--theme-primary)]" />
      {pending ? "Generating…" : "Generate insights"}
    </Button>
  );
}
