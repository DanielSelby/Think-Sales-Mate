import "server-only";
import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
export const GEMINI_OUTPUT_TOKENS = 1_024;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function safeCurrencyLabel(currency: string): string {
  return /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "unspecified";
}

export function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Gemini is not configured.");
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 45_000 },
  });
}

export function geminiErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const status = "status" in error ? Number(error.status) : 0;
    if (status === 429) return "provider_rate_limit";
    if (status === 408) return "provider_timeout";
    if (status >= 500) return "provider_unavailable";
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("abort")) return "provider_timeout";
  return "provider_error";
}

export function userFacingGeminiError(errorCode: string): string {
  if (errorCode === "provider_rate_limit") return "The AI service is busy right now. Please wait a moment and try again.";
  if (errorCode === "provider_timeout" || errorCode === "provider_unavailable") {
    return "The AI service is temporarily unavailable. Please try again shortly.";
  }
  return "The assistant couldn't complete that request. Please try again.";
}
