import type { ReactNode } from "react";
import type { Band, Driver } from "../types";
import { num } from "../lib/format";

/*
  Shared primitives. The visual system in one file so nothing drifts:
  hairline borders, 4px radius, one shadow, risk colour used sparingly.
*/

export const bandText: Record<Band, string> = {
  LOW: "text-risk-low", MEDIUM: "text-risk-medium",
  HIGH: "text-risk-high", CRITICAL: "text-risk-critical",
};

export const bandBg: Record<Band, string> = {
  LOW: "bg-risk-low", MEDIUM: "bg-risk-medium",
  HIGH: "bg-risk-high", CRITICAL: "bg-risk-critical",
};

export const bandBorder: Record<Band, string> = {
  LOW: "border-risk-low", MEDIUM: "border-risk-medium",
  HIGH: "border-risk-high", CRITICAL: "border-risk-critical",
};

/** The loudest element on any row. Everything else recedes around it. */
export function RiskScore({ score, band, size = "md" }:
  { score: number; band: Band; size?: "sm" | "md" | "lg" }) {
  const cls = {
    sm: "text-[1.375rem]",
    md: "text-3xl",
    lg: "text-[3.5rem] leading-[0.9]",
  }[size];
  return (
    <span className={`${cls} figure-mono font-bold ${bandText[band]}`}>
      {num(score)}
    </span>
  );
}

export function BandPill({ band }: { band: Band }) {
  return (
    <span className={`${bandBg[band]} text-white text-[10px] font-bold
      tracking-[0.08em] px-1.5 py-[3px] rounded-[2px] uppercase leading-none`}>
      {band}
    </span>
  );
}

/**
 * A figure with a caption saying what it means. Numbers without captions are
 * decoration - every KPI in this product explains itself.
 */
export function StatCard({ label, value, caption, accent }:
  { label: string; value: ReactNode; caption?: string; accent?: string }) {
  return (
    <div className="bg-surface border border-border-warm rounded-[6px] px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className={`text-[1.75rem] leading-tight font-bold figure mt-1.5
        ${accent ?? "text-ups-brown-800"}`}>
        {value}
      </div>
      {caption && (
        <div className="caption leading-snug mt-1">{caption}</div>
      )}
    </div>
  );
}

export function Card({ title, subtitle, children, right, flush }:
  { title?: string; subtitle?: string; children: ReactNode;
    right?: ReactNode; flush?: boolean }) {
  return (
    <section className="bg-surface border border-border-warm rounded-[6px]">
      {title && (
        <header className="px-5 py-3.5 border-b border-border-warm flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[13px] font-semibold text-ups-brown-800 tracking-tight">{title}</h2>
            {subtitle && <p className="text-xs text-text-muted mt-1 max-w-2xl">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

/** Page title block. One per screen, always in the same place. */
export function PageHeader({ title, lede, action }:
  { title: string; lede?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 flex-wrap">
      <div>
        <h1 className="text-[1.5rem] font-bold text-ups-brown-900 tracking-tight leading-none">
          {title}
        </h1>
        {lede && <p className="text-[13px] text-text-muted mt-2 max-w-3xl leading-relaxed">{lede}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, type = "button" }: {
  children: ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary"; disabled?: boolean;
  type?: "button" | "submit";
}) {
  const base = "pressable inline-flex items-center justify-center gap-2 px-3.5 py-2 " +
    "rounded-[3px] text-[13px] font-semibold cursor-pointer " +
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
  const styles = variant === "primary"
    ? "bg-ups-gold hover:bg-ups-gold-dark text-ups-brown-900"
    : "bg-surface border border-border-strong text-ups-brown-800 hover:bg-surface-alt";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

/**
 * SHAP contribution bars - the "why this score" panel.
 * Bars diverge from a shared baseline so magnitude is comparable at a glance.
 */
export function DriverBars({ drivers }: { drivers: Driver[] }) {
  if (!drivers?.length) return <Empty>No driver data available.</Empty>;
  const max = Math.max(...drivers.map((d) => Math.abs(d.contribution)), 0.01);

  return (
    <ol className="space-y-3.5">
      {drivers.map((d, i) => {
        const up = d.direction === "increases";
        const width = (Math.abs(d.contribution) / max) * 100;
        return (
          <li key={d.feature} className="grid grid-cols-[1.25rem_1fr] gap-3">
            <span className="text-[11px] font-bold text-text-faint figure-mono pt-0.5">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold text-ups-brown-800">{d.label}</span>
                <span className={`text-[11px] font-bold figure-mono ${up ? "text-risk-high" : "text-risk-low"}`}>
                  {up ? "+" : "−"}{Math.abs(d.contribution).toFixed(2)}
                </span>
              </div>
              <div className="h-[6px] bg-surface-sunk rounded-[1px] overflow-hidden mt-1.5">
                <div className={`h-full ${up ? "bg-risk-high" : "bg-risk-low"}`}
                     style={{ width: `${width}%` }} />
              </div>
              <p className="text-[11.5px] text-text-muted mt-1.5 leading-snug">{d.explanation}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-[13px] text-text-muted py-8 text-center border border-dashed
                  border-border-warm rounded-[3px]">
      {children}
    </p>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 bg-surface-sunk rounded-[3px]" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="bg-surface border border-border-warm border-l-[3px] border-l-risk-critical
                    rounded-[6px] p-6 max-w-xl">
      <p className="text-[15px] font-semibold text-risk-critical">Could not reach the backend</p>
      <p className="text-[13px] text-text-muted mt-1.5">{error}</p>
      <code className="block text-[11.5px] bg-surface-sunk text-ups-brown-800 rounded-[3px]
                       px-3 py-2 mt-3 font-mono">
        python -m uvicorn backend.main:app --port 8000
      </code>
      {onRetry && <div className="mt-4"><Button onClick={onRetry}>Retry</Button></div>}
    </div>
  );
}

/** Provenance marker. Never gold - gold is brand, not status. */
export function LiveBadge({ live, source }: { live?: boolean; source?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase
                     tracking-[0.06em] text-text-muted">
      <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-risk-low" : "bg-ups-brown-200"}`}
            aria-hidden="true" />
      {live ? "Live" : "Simulated"}{source ? ` · ${source}` : ""}
    </span>
  );
}
