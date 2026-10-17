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
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (error && typeof error === "object") {
    const status = "status" in error ? Number(error.status) : 0;
    if (
      message.includes("api key")
      && (message.includes("invalid") || message.includes("not valid") || message.includes("expired"))
    ) return "provider_auth";
    if (status === 401 || status === 403) return "provider_auth";
    if (status === 404 || message.includes("model not found")) return "provider_model";
    if (status === 400) return "provider_request";
    if (status === 429) return "provider_rate_limit";
    if (status === 408) return "provider_timeout";
    if (status >= 500) return "provider_unavailable";
  }
  if (message.includes("timeout") || message.includes("abort")) return "provider_timeout";
  return "provider_error";
}

export function userFacingGeminiError(errorCode: string): string {
  if (errorCode === "provider_auth") {
    return "Gemini rejected the server API key. Ask an administrator to verify GEMINI_API_KEY in the deployment environment.";
  }
  if (errorCode === "provider_model") {
    return "The configured Gemini model could not be found. Ask an administrator to check GEMINI_MODEL.";
  }
  if (errorCode === "provider_request") {
    return "Gemini rejected this request. Ask an administrator to verify the configured model and Gemini API settings.";
  }
  if (errorCode === "provider_rate_limit") return "The AI service is busy right now. Please wait a moment and try again.";
  if (errorCode === "provider_timeout" || errorCode === "provider_unavailable") {
    return "The AI service is temporarily unavailable. Please try again shortly.";
  }
  return "The assistant couldn't complete that request. Please try again.";
}
