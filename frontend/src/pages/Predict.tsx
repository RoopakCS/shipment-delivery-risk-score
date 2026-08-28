import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Sparkles } from "lucide-react";
import { api } from "../api";
import type { Mode, PredictRequest, PredictResult } from "../types";
import {
  BandPill, Button, Card, DriverBars, PageHeader, RiskScore, Skeleton,
} from "../components/ui";
import { num, pct } from "../lib/format";

const DEFAULTS: PredictRequest = {
  mode: "AIR", origin_code: "ORD", dest_code: "DEN", service_level: "STANDARD",
  planned_transit_hours: 18, buffer_hours: 3, value_usd: 42000, weight_kg: 80,
  carrier_reliability: 0.72, scheduled_dep_hour: 12, handoff_count: 2,
};

export default function Predict() {
  const [form, setForm] = useState<PredictRequest>(DEFAULTS);
  const [locations, setLocations] = useState<{ code: string; name: string }[]>([]);
  const [result, setResult] = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api.locations().then(setLocations).catch(() => undefined); }, []);

  const set = <K extends keyof PredictRequest>(k: K, v: PredictRequest[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.predict(form)); }
    catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  const onTime = result?.verdict === "ON_TIME";

  return (
    <>
      <PageHeader
        title="New Shipment"
        lede="Score a shipment that does not exist yet. We fetch live weather for both ends of
              the route, run the same model that scores the fleet, and show which decisions
              would change the outcome." />

      <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start">
        <Card title="Shipment details">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className="eyebrow mb-1.5">Mode</p>
              <div className="grid grid-cols-3 gap-1">
                {(["AIR", "OCEAN", "GROUND"] as Mode[]).map((m) => (
                  <button key={m} type="button" onClick={() => set("mode", m)}
                    aria-pressed={form.mode === m}
                    className={"text-[11.5px] font-semibold py-2 rounded-[3px] border cursor-pointer " +
                      "transition-colors duration-200 " +
                      (form.mode === m
                        ? "bg-ups-brown-800 text-white border-ups-brown-800"
                        : "bg-surface border-border-strong text-text-muted hover:bg-surface-alt")}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select label="Origin" value={form.origin_code}
                onChange={(v) => set("origin_code", v)}
                options={locations.map((l) => [l.code, `${l.code} — ${l.name}`])} />
              <Select label="Destination" value={form.dest_code}
                onChange={(v) => set("dest_code", v)}
                options={locations.map((l) => [l.code, `${l.code} — ${l.name}`])} />
            </div>

            <Select label="Service level" value={form.service_level}
              onChange={(v) => set("service_level", v)}
              options={[["STANDARD", "Standard"], ["EXPRESS", "Express"], ["ECONOMY", "Economy"]]} />

            <div className="grid grid-cols-2 gap-3">
              <Num label="Transit (h)" value={form.planned_transit_hours}
                onChange={(v) => set("planned_transit_hours", v)} />
              <Num label="Buffer (h)" value={form.buffer_hours}
                onChange={(v) => set("buffer_hours", v)} />
              <Num label="Value (USD)" value={form.value_usd}
                onChange={(v) => set("value_usd", v)} />
              <Num label="Weight (kg)" value={form.weight_kg}
                onChange={(v) => set("weight_kg", v)} />
              <Num label="Departure hour" value={form.scheduled_dep_hour}
                onChange={(v) => set("scheduled_dep_hour", v)} min={0} max={23} />
              <Num label="Handoffs" value={form.handoff_count}
                onChange={(v) => set("handoff_count", v)} min={0} max={8} />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <p className="eyebrow">Carrier reliability</p>
                <span className="text-[12.5px] font-bold tabular-nums text-ups-brown-800">
                  {pct(form.carrier_reliability)}
                </span>
              </div>
              <input type="range" min={0.5} max={0.95} step={0.01}
                value={form.carrier_reliability}
                aria-label="Carrier reliability"
                onChange={(e) => set("carrier_reliability", Number(e.target.value))}
                className="w-full mt-2 accent-ups-gold cursor-pointer" />
              <p className="text-[11px] text-text-muted mt-1">
                the carrier&rsquo;s historical on-time rate
              </p>
            </div>

            <Button type="submit" disabled={loading}>
              <Sparkles size={14} aria-hidden="true" />
              {loading ? "Scoring against live weather…" : "Predict"}
            </Button>
          </form>
        </Card>

        <div className="space-y-5">
          {error && (
            <div className="bg-surface border border-border-warm border-l-[3px] border-l-risk-critical
                            rounded-[6px] p-4 text-[13px] text-risk-critical">
              {error}
            </div>
          )}

          {!result && !loading && !error && (
            <Card>
              <p className="text-[13px] text-text-muted py-12 text-center max-w-md mx-auto leading-relaxed">
                Fill in a shipment and press Predict. You&rsquo;ll get a verdict, the reasons
                behind it, and a ranked list of the decisions that would actually change it.
              </p>
            </Card>
          )}

          {loading && <Card><Skeleton rows={6} /></Card>}

          {result && (
            <>
              <section className={`bg-surface border border-border-warm border-l-[3px] rounded-[6px] p-5
                ${onTime ? "border-l-risk-low" : "border-l-risk-critical"}`}>
                <div className="flex items-center gap-6 flex-wrap">
                  <div>
                    <p className="eyebrow">Verdict</p>
                    <h2 className={`text-[1.5rem] font-bold tracking-tight mt-1.5 leading-none
                      ${onTime ? "text-risk-low" : "text-risk-critical"}`}>
                      {onTime ? "Will deliver on time" : "At risk of late delivery"}
                    </h2>
                    <p className="text-[12.5px] text-text-muted mt-2">{result.verdict_detail}</p>
                  </div>
                  <div className="ml-auto flex items-end gap-3">
                    <RiskScore score={result.risk.score} band={result.risk.band} size="lg" />
                    <div className="pb-1.5"><BandPill band={result.risk.band} /></div>
                  </div>
                </div>
              </section>

              <div className="grid lg:grid-cols-2 gap-5 items-start">
                <Card title="Why" subtitle="What is driving this prediction">
                  <DriverBars drivers={result.drivers} />
                </Card>

                <Card title="What would change the outcome?"
                      subtitle="Each option re-scored by the same model">
                  <ul className="divide-y divide-border-warm -my-1">
                    {result.what_if.map((w) => (
                      <li key={w.action} className="flex items-center gap-3 py-2.5">
                        <span className="text-[12.5px] flex-1 text-ups-brown-800">{w.label}</span>
                        <span className="text-[13px] font-bold tabular-nums text-ups-brown-800">
                          {num(w.new_score)}
                        </span>
                        <span className={"text-[11px] font-bold figure px-1.5 py-1 rounded-[2px] " +
                          "inline-flex items-center gap-1 leading-none " +
                          (w.helps ? "bg-risk-low/10 text-risk-low"
                            : w.delta > 0 ? "bg-risk-high/10 text-risk-high"
                            : "bg-surface-sunk text-text-faint")}
                          title={w.helps ? "Lowers the risk score"
                            : w.delta > 0 ? "Raises the risk score"
                            : "No measurable effect"}>
                          {w.helps
                            ? <ArrowDown size={10} strokeWidth={3} aria-hidden="true" />
                            : w.delta > 0
                              ? <ArrowUp size={10} strokeWidth={3} aria-hidden="true" />
                              : <Minus size={10} strokeWidth={3} aria-hidden="true" />}
                          {w.delta > 0 ? "+" : ""}{w.delta.toFixed(1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-text-muted mt-4 pt-3 border-t border-border-warm leading-relaxed">
                    These are the model&rsquo;s actual predictions for each altered shipment, not
                    fixed advice. A zero delta means the model does not think that action helps here.
                  </p>
                </Card>
              </div>

              <div className="bg-surface border border-border-warm border-l-[3px] border-l-ups-gold
                              rounded-[6px] p-5">
                <p className="eyebrow">Recommended action</p>
                <p className="text-[1.125rem] font-bold text-ups-brown-900 mt-2 tracking-tight">
                  {result.recommendation.action.replace(/_/g, " ")}
                </p>
                <p className="text-[13px] font-semibold text-ups-brown-800 mt-1.5">
                  {result.recommendation.headline}
                </p>
                <p className="text-[12.5px] text-text-muted mt-2 leading-relaxed">
                  {result.recommendation.detail}
                </p>
                <p className="text-[10.5px] text-text-faint mt-3 pt-3 border-t border-border-warm">
                  generated by {result.recommendation.generated_by}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1.5 border border-border-strong rounded-[3px] px-2 py-1.5
                   text-[12.5px] bg-surface cursor-pointer">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Num({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1.5 border border-border-strong rounded-[3px] px-2 py-1.5
                   text-[12.5px] tabular-nums" />
    </label>
  );
}
