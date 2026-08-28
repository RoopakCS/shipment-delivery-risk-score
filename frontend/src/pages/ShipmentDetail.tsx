import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api";
import type { ShipmentDetail as Detail } from "../types";
import {
  BandPill, Card, DriverBars, Empty, ErrorState, LiveBadge, RiskScore, Skeleton, bandBorder,
} from "../components/ui";
import { hoursBetween, num, pct, usd, when } from "../lib/format";

const VALIDATION_COPY: Record<string, string> = {
  real_weather_simulated_flights:
    "Trained on real recorded weather. Flight records are simulated.",
  simulated: "Trained on simulated data pending client history.",
};

export default function ShipmentDetail() {
  const { id = "" } = useParams();
  const [s, setS] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api.shipment(id).then(setS).catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!s) return <Skeleton rows={10} />;

  const risk = s.risk;
  const band = risk?.band ?? "LOW";
  const slip = hoursBetween(s.predicted_delivery, s.promised_delivery);
  const signals = s.signals ?? {};
  const signalKeys = Object.keys(signals);

  return (
    <>
      <Link to="/"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-muted
                   hover:text-ups-brown-800 transition-colors duration-200">
        <ArrowLeft size={14} aria-hidden="true" /> Back to risk queue
      </Link>

      {/* Hero: score dominates, supporting figures sit in a measured row */}
      <section className={`bg-surface border border-border-warm border-l-[3px] ${bandBorder[band]}
                          rounded-[4px] px-6 py-5`}>
        <div className="flex flex-wrap items-start gap-x-12 gap-y-6">
          <div className="min-w-[16rem]">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[1.5rem] font-bold text-ups-brown-900 tracking-tight leading-none">
                {s.id}
              </h1>
              <BandPill band={band} />
            </div>
            <p className="text-[12.5px] text-text-muted mt-2">
              {s.mode} · {s.carrier} · {s.service_level}
            </p>
            <p className="text-[13px] font-semibold text-ups-brown-800 mt-2.5">
              {s.origin.name} ({s.origin.code}) → {s.destination.name} ({s.destination.code})
            </p>
            {risk && (
              <p className="text-[11px] text-text-faint mt-3 max-w-sm leading-relaxed">
                Model <strong className="text-text-muted">{risk.model_used}</strong> ·{" "}
                {VALIDATION_COPY[risk.validation_status] ?? risk.validation_status}
              </p>
            )}
          </div>

          <div className="flex items-start gap-10 ml-auto flex-wrap">
            <div>
              <RiskScore score={risk?.score ?? 0} band={band} size="lg" />
              <p className="eyebrow mt-2">out of 10</p>
            </div>
            <Figure value={pct(risk?.breach_probability ?? 0)} label="Breach risk"
              caption="chance of missing the promised date" />
            <Figure value={`${num(risk?.predicted_delay_hours ?? 0)}h`} label="Expected slip"
              caption="how late, if it slips" />
            <Figure value={pct(risk?.confidence ?? 0)} label="Confidence"
              caption="how sure the model is here" />
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5 items-start">
        <Card title="Why this score"
              subtitle="The factors moving this score the most, largest first">
          <DriverBars drivers={s.drivers} />
        </Card>

        <div className="space-y-5">
          {s.recommendation ? (
            <div className="bg-surface border border-border-warm border-l-[3px] border-l-ups-gold
                            rounded-[4px] p-5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="eyebrow">Recommended action</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.06em]
                                 bg-ups-brown-800 text-white px-1.5 py-[3px] rounded-[2px] leading-none">
                  {s.recommendation.urgency}
                </span>
              </div>
              <p className="text-[1.125rem] font-bold text-ups-brown-900 mt-2 tracking-tight">
                {s.recommendation.action.replace(/_/g, " ")}
              </p>
              <p className="text-[13px] font-semibold text-ups-brown-800 mt-1.5">
                {s.recommendation.headline}
              </p>
              <p className="text-[12.5px] text-text-muted mt-2 leading-relaxed">
                {s.recommendation.detail}
              </p>
              <p className="text-[10.5px] text-text-faint mt-3 pt-3 border-t border-border-warm">
                generated by {s.recommendation.generated_by}
              </p>
            </div>
          ) : (
            <Card title="Recommended action"><Empty>No recommendation available.</Empty></Card>
          )}

          <Card title="Delivery timeline">
            <div className="grid grid-cols-3 gap-4">
              <Field label="Departed" value={when(s.departed_at)} />
              <Field label="Promised" value={when(s.promised_delivery)} />
              <Field label="Predicted" value={when(s.predicted_delivery)} danger={slip > 0} />
            </div>
            {slip > 0 && (
              <p className="mt-4 text-[12.5px] font-semibold text-risk-high">
                Predicted slip: {num(slip)} hours past the promise
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-border-warm">
              <div className="h-[6px] bg-surface-sunk rounded-[1px] overflow-hidden">
                <div className="h-full bg-ups-brown-600" style={{ width: `${s.progress_pct}%` }} />
              </div>
              <p className="text-[11px] text-text-muted mt-2 tabular-nums">
                {Math.round(s.progress_pct)}% of journey complete · {usd(s.value_usd)} of goods ·{" "}
                {s.weight_kg} kg
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Live risk signals"
            subtitle="External data feeding this score, each labelled live or simulated">
        {signalKeys.length === 0 ? (
          <Empty>No live signal data yet. Run “Refresh live signals” on the risk queue.</Empty>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {signalKeys.map((k) => {
              const sig = signals[k] ?? {};
              return (
                <div key={k} className="border border-border-warm rounded-[4px] px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="eyebrow">{k.replace(/_/g, " ")}</span>
                    <LiveBadge live={sig.is_live} />
                  </div>
                  <div className="text-[1.75rem] font-bold tabular-nums tracking-tight
                                  text-ups-brown-800 mt-1.5 leading-none">
                    {sig.severity != null ? num(sig.severity, 2) : "—"}
                  </div>
                  <p className="text-[10.5px] text-text-faint mt-1">severity · 0 to 1</p>
                  {sig.detail && (
                    <p className="text-[11.5px] text-text-muted mt-2 leading-snug">{sig.detail}</p>
                  )}
                  {sig.source && (
                    <p className="text-[10.5px] text-text-faint mt-2">source: {sig.source}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

function Figure({ value, label, caption }:
  { value: string; label: string; caption: string }) {
  return (
    <div className="max-w-[8rem]">
      <p className="eyebrow">{label}</p>
      <div className="text-[1.75rem] font-bold tabular-nums tracking-tight
                      text-ups-brown-800 mt-1.5 leading-none">
        {value}
      </div>
      <p className="text-[11px] text-text-muted leading-snug mt-1.5">{caption}</p>
    </div>
  );
}

function Field({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={`text-[13px] font-semibold mt-1.5 tabular-nums
        ${danger ? "text-risk-high" : "text-ups-brown-800"}`}>
        {value}
      </p>
    </div>
  );
}
