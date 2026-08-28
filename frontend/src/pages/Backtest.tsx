import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { BacktestEvent } from "../types";
import { BandPill, Card, ErrorState, RiskScore, Skeleton } from "../components/ui";
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
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-ups-brown-800">Backtest &mdash; we called it</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-3xl">
          We replayed real disruption days through the model using only the
          information that was available beforehand, then compared its prediction
          against what was actually recorded on the day.
        </p>
      </div>

      {!events ? <Skeleton rows={6} /> : events.map((e) => {
        const p = e.prediction;
        const a = e.actual_outcome;
        return (
          <Card key={e.id}>
            <div className="flex items-center gap-3 flex-wrap mb-4 pb-3 border-b border-border-warm">
              <h3 className="font-bold text-ups-brown-800">
                {e.airport_name} ({e.airport})
              </h3>
              <span className="text-sm text-text-muted">{e.date}</span>
              <span className="ml-auto text-[11px] font-bold uppercase tracking-wide bg-risk-low text-white px-2 py-1 rounded">
                {e.verdict.replace(/_/g, " ")}
              </span>
            </div>

            <div className="grid md:grid-cols-[1fr_auto_1fr] gap-6 items-start">
              {/* Prediction */}
              <div>
                <h4 className="text-xs uppercase tracking-wide font-semibold text-text-muted mb-3">
                  What the model predicted
                </h4>
                <div className="flex items-center gap-3">
                  <RiskScore score={p.risk_score} band={p.band} size="lg" />
                  <BandPill band={p.band} />
                </div>
                <p className="text-sm mt-2">
                  <strong className="tabular-nums">{pct(p.breach_probability)}</strong>{" "}
                  probability of breach
                </p>
                <ul className="mt-3 space-y-1">
                  {(p.drivers ?? []).slice(0, 3).map((d) => (
                    <li key={d.feature} className="text-xs text-text-muted">
                      &bull; {d.explanation}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-text-muted mt-3 italic">
                  Using only what was knowable before this day.
                </p>
              </div>

              <div className="hidden md:flex flex-col items-center self-stretch">
                <div className="flex-1 w-px bg-border-warm" />
                <span className="text-xs font-bold text-text-muted py-2">vs</span>
                <div className="flex-1 w-px bg-border-warm" />
              </div>

              {/* Actual */}
              <div>
                <h4 className="text-xs uppercase tracking-wide font-semibold text-text-muted mb-3">
                  What actually happened
                </h4>
                <div className="text-6xl font-bold tabular-nums text-risk-critical">
                  {pct(a.delay_rate)}
                </div>
                <p className="text-sm mt-1">of flights were actually delayed</p>
                <ul className="mt-3 space-y-1 text-xs text-text-muted">
                  <li>&bull; {a.delayed_flights} of {a.total_flights} flights late</li>
                  <li>&bull; mean delay {num(a.mean_delay_minutes)} minutes</li>
                  {a.max_delay_minutes != null && (
                    <li>&bull; worst delay {num(a.max_delay_minutes)} minutes</li>
                  )}
                </ul>
                <p className="text-[11px] text-text-muted mt-3 italic">Recorded outcome.</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
