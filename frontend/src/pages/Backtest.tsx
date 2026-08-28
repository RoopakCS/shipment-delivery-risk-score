import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../api";
import type { BacktestEvent } from "../types";
import { BandPill, ErrorState, PageHeader, RiskScore, Skeleton } from "../components/ui";
import { num, pct } from "../lib/format";

export default function Backtest() {
  const [events, setEvents] = useState<BacktestEvent[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api.backtests().then(setEvents).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Backtest — we called it"
        lede="Real disruption days replayed through the model using only the information
              available beforehand, set against what was actually recorded on the day." />

      {!events ? <Skeleton rows={6} /> : events.map((e) => {
        const p = e.prediction;
        const a = e.actual_outcome;
        const hit = e.verdict.startsWith("TRUE");
        return (
          <article key={e.id} className="bg-surface border border-border-warm rounded-[4px]">
            <header className="px-5 py-3 border-b border-border-warm flex items-center gap-3 flex-wrap">
              <h2 className="text-[13px] font-semibold text-ups-brown-800">
                {e.airport_name} <span className="text-text-muted font-normal">({e.airport})</span>
              </h2>
              <span className="text-[12px] text-text-muted tabular-nums">{e.date}</span>
              <span className={`ml-auto inline-flex items-center gap-1.5 text-[10px] font-bold
                uppercase tracking-[0.06em] px-2 py-1 rounded-[2px] leading-none
                ${hit ? "bg-risk-low text-white" : "bg-ups-brown-400 text-white"}`}>
                {hit && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                {e.verdict.replace(/_/g, " ")}
              </span>
            </header>

            <div className="grid md:grid-cols-[1fr_auto_1fr]">
              {/* Prediction */}
              <div className="p-5">
                <p className="eyebrow">What the model predicted</p>
                <div className="flex items-end gap-3 mt-3">
                  <RiskScore score={p.risk_score} band={p.band} size="lg" />
                  <BandPill band={p.band} />
                </div>
                <p className="text-[12.5px] text-text-muted mt-2 tabular-nums">
                  <strong className="text-ups-brown-800">{pct(p.breach_probability)}</strong>{" "}
                  probability of breach
                </p>
                <ul className="mt-4 space-y-1.5 border-t border-border-warm pt-3">
                  {(p.drivers ?? []).slice(0, 3).map((d) => (
                    <li key={d.feature} className="text-[11.5px] text-text-muted leading-snug
                                                   pl-3 border-l border-border-strong">
                      {d.explanation}
                    </li>
                  ))}
                </ul>
                <p className="text-[10.5px] text-text-faint mt-3 italic">
                  Using only what was knowable before this day.
                </p>
              </div>

              <div className="hidden md:flex flex-col items-center px-2">
                <div className="flex-1 w-px bg-border-warm" />
                <span className="eyebrow py-2">vs</span>
                <div className="flex-1 w-px bg-border-warm" />
              </div>

              {/* Actual */}
              <div className="p-5 bg-surface-alt border-t md:border-t-0 md:border-l border-border-warm">
                <p className="eyebrow">What actually happened</p>
                <div className="text-[3.5rem] leading-[0.9] font-bold tabular-nums tracking-tight
                                text-risk-critical mt-3">
                  {pct(a.delay_rate)}
                </div>
                <p className="text-[12.5px] text-text-muted mt-2">of flights were actually delayed</p>
                <ul className="mt-4 space-y-1.5 border-t border-border-warm pt-3
                               text-[11.5px] text-text-muted tabular-nums">
                  <li>{a.delayed_flights} of {a.total_flights} flights late</li>
                  <li>mean delay {num(a.mean_delay_minutes)} minutes</li>
                  {a.max_delay_minutes != null && (
                    <li>worst delay {num(a.max_delay_minutes)} minutes</li>
                  )}
                </ul>
                <p className="text-[10.5px] text-text-faint mt-3 italic">Recorded outcome.</p>
              </div>
            </div>
          </article>
        );
      })}
    </>
  );
}
