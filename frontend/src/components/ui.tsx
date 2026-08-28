import type { ReactNode } from "react";
import type { Band, Driver } from "../types";
import { bandBg, bandText, num } from "../lib/format";

/** Large colour-coded risk score. */
export function RiskScore({ score, band, size = "md" }:
  { score: number; band: Band; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "text-xl", md: "text-3xl", lg: "text-6xl" }[size];
  return (
    <span className={`${s} font-bold tabular-nums ${bandText[band]}`}>
      {num(score)}
    </span>
  );
}

export function BandPill({ band }: { band: Band }) {
  return (
    <span className={`${bandBg[band]} text-white text-[11px] font-semibold
      tracking-wide px-2 py-0.5 rounded uppercase`}>
      {band}
    </span>
  );
}

/** A number with a plain-English caption, so the figure means something. */
export function StatCard({ label, value, caption, accent }:
  { label: string; value: ReactNode; caption?: string; accent?: string }) {
  return (
    <div className="bg-surface border border-border-warm rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted font-semibold">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${accent ?? "text-ups-brown-800"}`}>
        {value}
      </div>
      {caption && <div className="text-xs text-text-muted mt-1 leading-snug">{caption}</div>}
    </div>
  );
}

export function Card({ title, subtitle, children, right }:
  { title?: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="bg-surface border border-border-warm rounded-lg shadow-sm">
      {title && (
        <header className="px-5 py-3 border-b border-border-warm flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ups-brown-800">{title}</h2>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Horizontal SHAP contribution bars - the "why this score" panel. */
export function DriverBars({ drivers }: { drivers: Driver[] }) {
  if (!drivers?.length) return <Empty>No driver data available.</Empty>;
  const max = Math.max(...drivers.map(d => Math.abs(d.contribution)), 0.01);

  return (
    <ul className="space-y-4">
      {drivers.map(d => {
        const up = d.direction === "increases";
        const width = (Math.abs(d.contribution) / max) * 100;
        return (
          <li key={d.feature}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="font-medium text-sm text-ups-brown-800">{d.label}</span>
              <span className={`text-xs font-semibold tabular-nums ${up ? "text-risk-high" : "text-risk-low"}`}>
                {up ? "+" : "-"}{Math.abs(d.contribution).toFixed(2)}
              </span>
            </div>
            <div className="h-2 bg-surface-alt rounded overflow-hidden">
              <div className={`h-full rounded ${up ? "bg-risk-high" : "bg-risk-low"}`}
                   style={{ width: `${width}%` }} />
            </div>
            <p className="text-xs text-text-muted mt-1">{d.explanation}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-muted italic py-6 text-center">{children}</p>;
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-border-warm/50 rounded" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="border border-risk-critical/30 bg-risk-critical/5 rounded-lg p-6 text-center">
      <p className="font-semibold text-risk-critical">Could not reach the backend</p>
      <p className="text-sm text-text-muted mt-1">{error}</p>
      <p className="text-xs text-text-muted mt-2">
        Start it with: python -m uvicorn backend.main:app --port 8000
      </p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-4 bg-ups-gold hover:bg-ups-gold-dark text-ups-brown-900
                     font-semibold px-4 py-2 rounded text-sm">
          Retry
        </button>
      )}
    </div>
  );
}

export function LiveBadge({ live, source }: { live?: boolean; source?: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide
      ${live ? "bg-risk-low text-white" : "bg-ups-brown-400 text-white"}`}>
      {live ? "Live" : "Simulated"}{source ? ` · ${source}` : ""}
    </span>
  );
}
