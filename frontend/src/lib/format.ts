import type { Band } from "../types";

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n ?? 0);

export const pct = (n: number, digits = 0) => `${((n ?? 0) * 100).toFixed(digits)}%`;

export const num = (n: number, digits = 1) => (n ?? 0).toFixed(digits);

export const when = (iso?: string) => {
  if (!iso) return "--";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "--"
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const hoursBetween = (a?: string, b?: string) => {
  if (!a || !b) return 0;
  return (new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;
};

/** Tailwind text colour for a risk band. */
export const bandText: Record<Band, string> = {
  LOW: "text-risk-low", MEDIUM: "text-risk-medium",
  HIGH: "text-risk-high", CRITICAL: "text-risk-critical",
};

/** Tailwind background colour for a risk band. */
export const bandBg: Record<Band, string> = {
  LOW: "bg-risk-low", MEDIUM: "bg-risk-medium",
  HIGH: "bg-risk-high", CRITICAL: "bg-risk-critical",
};

export const bandOf = (score: number): Band =>
  score >= 8 ? "CRITICAL" : score >= 6 ? "HIGH" : score >= 3.5 ? "MEDIUM" : "LOW";
