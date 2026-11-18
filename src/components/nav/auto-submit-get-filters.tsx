"use client";

import { useEffect } from "react";

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "number", "tel", "url"]);
const SEARCH_DELAY_MS = 350;

export function AutoSubmitGetFilters() {
  useEffect(() => {
    const timers = new WeakMap<HTMLFormElement, number>();

    function getFilterForm(target: EventTarget | null): HTMLFormElement | null {
      if (!(target instanceof Element)) return null;
      const field = target instanceof HTMLInputElement
        || target instanceof HTMLSelectElement
        || target instanceof HTMLTextAreaElement
        ? target
        : null;
      const form = field?.form ?? target.closest("form");
      if (!form || form.method.toLowerCase() !== "get" || form.dataset.autoFilter === "false") return null;
      return form;
    }

    function clearTimer(form: HTMLFormElement) {
      const timer = timers.get(form);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timers.delete(form);
      }
    }

    function handleInput(event: Event) {
      const target = event.target;
      const form = getFilterForm(target);
      if (!form || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      if (target instanceof HTMLInputElement && !TEXT_INPUT_TYPES.has(target.type)) return;

      clearTimer(form);
      const timer = window.setTimeout(() => {
        timers.delete(form);
        form.requestSubmit();
      }, SEARCH_DELAY_MS);
      timers.set(form, timer);
    }

    function handleChange(event: Event) {
      const form = getFilterForm(event.target);
      if (!form) return;
      clearTimer(form);
      form.requestSubmit();
    }

    function handleSubmit(event: Event) {
      const target = event.target;
      if (target instanceof HTMLFormElement) clearTimer(target);
    }

    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("submit", handleSubmit, true);

    return () => {
      document.removeEventListener("input", handleInput);
      document.removeEventListener("change", handleChange);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  return null;
}
