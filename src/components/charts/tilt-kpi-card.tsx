"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";

const ACCENT_COLORS: Record<string, string> = {
  blue:   "#2563eb",
  green:  "#16a34a",
  purple: "#7c3aed",
  amber:  "#d97706",
  teal:   "#0d9488",
  red:    "#dc2626",
  indigo: "#4f46e5",
  pink:   "#db2777",
};

export type TiltCardColor = keyof typeof ACCENT_COLORS;

interface Props {
  color:        TiltCardColor;
  label:        string;
  value:        string;
  note:         string;
  icon:         React.ReactNode;
  trend?:       number;
  sub?:         string;
  backDetails?: { label: string; value: string }[];
  solid?:       boolean;
}

export function TiltKpiCard({ color, label, value, note, icon, trend, sub, backDetails, solid }: Props) {
  const [flipped, setFlipped] = useState(false);
  const { activeTheme } = useAppStore();
  const theme  = THEMES[activeTheme];
  const accent = ACCENT_COLORS[color] ?? theme.colors.primary;
  const hasBack = backDetails && backDetails.length > 0;
  const isUp = trend !== undefined ? trend >= 0 : null;

  // ── Front face — white card with colored top border ──────────
  const frontFace = (
    <div
      style={{
        position: "absolute", inset: 0,
        borderRadius: 16,
        background: solid ? theme.colors.primary : "#ffffff",
        border: solid ? "none" : "1px solid #e8edf2",
        boxShadow: solid
          ? `0 8px 24px ${theme.colors.primary}44`
          : "0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 16,
      }}
    >
      {/* Colored top border — hidden when solid */}
      {!solid && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          borderRadius: "16px 16px 0 0",
          background: accent,
        }} />
      )}
      {/* Decorative circles for solid cards */}
      {solid && <>
        <div style={{ position: "absolute", top: -32, right: -32, width: 112, height: 112, borderRadius: "50%", background: "rgba(255,255,255,0.09)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -16, right: -16, width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
      </>}

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.1em", color: solid ? "rgba(255,255,255,0.65)" : "#64748b", lineHeight: 1.3,
        }}>
          {label}
        </p>
        <div style={{
          width: 30, height: 30, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: solid ? "rgba(255,255,255,0.18)" : accent + "18",
        }}>
          <div style={{ width: 15, height: 15, color: solid ? "#fff" : accent }}>{icon}</div>
        </div>
      </div>

      {/* Value */}
      <div>
        <p style={{
          fontSize: value.length > 12 ? 15 : value.length > 9 ? 18 : 22,
          fontWeight: 700,
          color: solid ? "#ffffff" : accent,
          lineHeight: 1.1,
          letterSpacing: "-0.01em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: 5,
        }}>
          {value}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: solid ? "rgba(255,255,255,0.65)" : "#64748b" }}>{note}</span>
          {trend !== undefined && trend !== 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 2,
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 99,
              background: isUp ? "#dcfce7" : "#fee2e2",
              color: isUp ? "#166534" : "#991b1b",
            }}>
              {isUp ? <TrendingUp style={{ width: 10, height: 10 }} /> : <TrendingDown style={{ width: 10, height: 10 }} />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        {sub && <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{sub}</p>}
      </div>

      {hasBack && (
        <p style={{ fontSize: 9, color: solid ? "rgba(255,255,255,0.3)" : "#cbd5e1" }}>Hover to flip ↻</p>
      )}
    </div>
  );

  // ── Back face — also white with colored top border ───────────
  const backFace = (
    <div
      style={{
        position: "absolute", inset: 0,
        borderRadius: 16,
        background: "#ffffff",
        border: "1px solid #e8edf2",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: "rotateY(180deg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: 16,
        gap: 4,
      }}
    >
      {/* Colored top border */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        borderRadius: "16px 16px 0 0",
        background: accent,
      }} />

      <p style={{
        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.1em", color: "#64748b", marginTop: 4,
      }}>
        {label} — Detail
      </p>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 0 }}>
        {(backDetails ?? []).map(({ label: bl, value: bv }, i) => (
          <div key={bl} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "5px 0",
            borderBottom: i < (backDetails ?? []).length - 1 ? "1px solid #f1f5f9" : "none",
          }}>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{bl}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{bv}</span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 9, color: "#cbd5e1" }}>Hover away to flip back ↻</p>
    </div>
  );

  return (
    <>
      {/* Desktop — flip on hover */}
      <div
        className="hidden sm:block"
        style={{ perspective: 900, height: 148 }}
        onMouseEnter={() => hasBack && setFlipped(true)}
        onMouseLeave={() => setFlipped(false)}
      >
        <div style={{
          position: "relative", width: "100%", height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.52s cubic-bezier(0.4,0.2,0.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}>
          {frontFace}
          {backFace}
        </div>
      </div>

      {/* Mobile — flip on tap */}
      <div
        className="sm:hidden"
        style={{ perspective: 900, height: 148 }}
        onClick={() => hasBack && setFlipped(v => !v)}
      >
        <div style={{
          position: "relative", width: "100%", height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.52s cubic-bezier(0.4,0.2,0.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}>
          {frontFace}
          {backFace}
        </div>
      </div>
    </>
  );
}