import { useEffect, useState } from "react";
import { ArrowDown, Minus, Sparkles } from "lucide-react";
import { api } from "../api";
import type { Mode, PredictRequest, PredictResult } from "../types";
import { BandPill, Card, DriverBars, RiskScore, Skeleton } from "../components/ui";
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
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-ups-brown-800">New Shipment</h2>
        <p className="text-sm text-text-muted mt-0.5">
          Enter a shipment that does not exist yet. The model scores it against live
          weather and shows which decisions would change the outcome.
        </p>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
        <Card title="Shipment details">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Mode</Label>
              <div className="flex gap-1 mt-1">
                {(["AIR", "OCEAN", "GROUND"] as Mode[]).map((m) => (
                  <button key={m} type="button" onClick={() => set("mode", m)}
                    className={"flex-1 text-xs font-semibold py-2 rounded border transition-colors " +
                      (form.mode === m
                        ? "bg-ups-brown-800 text-white border-ups-brown-800"
                        : "bg-surface border-border-warm hover:bg-surface-alt")}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select label="Origin" value={form.origin_code}
                onChange={(v) => set("origin_code", v)}
                options={locations.map((l) => [l.code, l.code + " - " + l.name])} />
              <Select label="Destination" value={form.dest_code}
                onChange={(v) => set("dest_code", v)}
                options={locations.map((l) => [l.code, l.code + " - " + l.name])} />
            </div>

            <Select label="Service level" value={form.service_level}
              onChange={(v) => set("service_level", v)}
              options={[["STANDARD", "Standard"], ["EXPRESS", "Express"], ["ECONOMY", "Economy"]]} />

            <div className="grid grid-cols-2 gap-3">
              <Num label="Planned transit (h)" value={form.planned_transit_hours}
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
              <Label>Carrier reliability &mdash; {pct(form.carrier_reliability)}</Label>
              <input type="range" min={0.5} max={0.95} step={0.01}
                value={form.carrier_reliability}
                onChange={(e) => set("carrier_reliability", Number(e.target.value))}
                className="w-full mt-1 accent-ups-gold" />
              <p className="text-xs text-text-muted">
                the carrier&rsquo;s historical on-time rate
              </p>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-ups-gold hover:bg-ups-gold-dark disabled:opacity-60 text-ups-brown-900 font-semibold py-2.5 rounded flex items-center justify-center gap-2">
              <Sparkles size={16} />
              {loading ? "Scoring against live weather..." : "Predict"}
            </button>
          </form>
        </Card>

        <div className="space-y-5">
          {error && (
            <div className="border border-risk-critical/30 bg-risk-critical/5 rounded-lg p-4 text-sm text-risk-critical">
              {error}
            </div>
          )}

          {!result && !loading && !error && (
            <Card>
              <p className="text-sm text-text-muted py-10 text-center max-w-md mx-auto">
                Fill in a shipment and press Predict. We fetch live weather for both
                ends of the route, score it with the same model that runs the fleet,
                and show what would change the outcome.
              </p>
            </Card>
          )}

          {loading && <Card><Skeleton rows={6} /></Card>}

          {result && (
            <>
              <div className={"rounded-lg p-5 border-l-4 " +
                (onTime
                  ? "bg-risk-low/5 border-risk-low border border-risk-low/30"
                  : "bg-risk-critical/5 border-risk-critical border border-risk-critical/30")}>
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <h3 className={"text-xl font-bold " + (onTime ? "text-risk-low" : "text-risk-critical")}>
                      {onTime ? "WILL DELIVER ON TIME" : "AT RISK OF LATE DELIVERY"}
                    </h3>
                    <p className="text-sm text-text-main mt-1">{result.verdict_detail}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <RiskScore score={result.risk.score} band={result.risk.band} size="lg" />
                    <BandPill band={result.risk.band} />
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <Card title="Why" subtitle="What is driving this prediction">
                  <DriverBars drivers={result.drivers} />
                </Card>

                <Card title="What would change the outcome?"
                      subtitle="Each option was re-scored by the same model">
                  <ul className="space-y-2">
                    {result.what_if.map((w) => (
                      <li key={w.action}
                        className="flex items-center gap-3 border border-border-warm rounded px-3 py-2.5">
                        <span className="text-sm flex-1">{w.label}</span>
                        <span className="text-sm font-bold tabular-nums text-ups-brown-800">
                          {num(w.new_score)}
                        </span>
                        <span className={"text-xs font-semibold tabular-nums px-2 py-0.5 rounded flex items-center gap-1 " +
                          (w.helps ? "bg-risk-low/10 text-risk-low" : "bg-surface-alt text-text-muted")}>
                          {w.helps ? <ArrowDown size={11} /> : <Minus size={11} />}
                          {w.delta.toFixed(1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-text-muted mt-3">
                    These are the model&rsquo;s actual predictions for each altered
                    shipment, not fixed advice. A zero delta means the model does not
                    think that action helps here.
                  </p>
                </Card>
              </div>

              <div className="bg-ups-gold-soft border border-border-warm border-l-4 border-l-ups-gold rounded-lg p-5">
                <span className="font-bold text-ups-brown-900">
                  {result.recommendation.action.replace(/_/g, " ")}
                </span>
                <p className="font-semibold mt-1.5 text-ups-brown-800">
                  {result.recommendation.headline}
                </p>
                <p className="text-sm mt-1.5 leading-relaxed">{result.recommendation.detail}</p>
                <p className="text-[11px] text-text-muted mt-3">
                  generated by: {result.recommendation.generated_by}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-xs uppercase tracking-wide text-text-muted font-semibold">{children}</span>
);

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 border border-border-warm rounded px-2 py-1.5 text-sm bg-surface">
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
      <Label>{label}</Label>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1 border border-border-warm rounded px-2 py-1.5 text-sm tabular-nums" />
    </label>
  );
}
