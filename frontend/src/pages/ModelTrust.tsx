import { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import type { Metrics } from "../types";
import { Card, ErrorState, PageHeader, Skeleton, StatCard } from "../components/ui";

const AXIS = { fontSize: 11, fill: "#6A625A" };
const TOOLTIP_STYLE = {
  border: "1px solid #E2DCD4", borderRadius: 4, fontSize: 12,
  boxShadow: "none", background: "#FFFFFF",
};

export default function ModelTrust() {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api.metrics().then(setM).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!m) return <Skeleton rows={10} />;

  const cal = m.air_calibration ?? {};
  const calData = (cal.prob_pred ?? []).map((p: number, i: number) => ({
    predicted: Number((p * 100).toFixed(1)),
    observed: Number(((cal.prob_true?.[i] ?? 0) * 100).toFixed(1)),
    ideal: Number((p * 100).toFixed(1)),
  }));

  const shap = Object.entries(m.air_shap_importance ?? {})
    .map(([feature, value]) => ({ feature: feature.replace(/_/g, " "), value: Number(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  return (
    <>
      <PageHeader
        title="Model Trust"
        lede="How well the model performs, how honest its probabilities are, and exactly what
              it was built on." />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="ROC-AUC" value={Number(m.air_roc_auc ?? 0).toFixed(3)}
          caption="0.5 is guessing. Higher is better." />
        <StatCard label="Lift over baseline" value={`+${Number(m.air_lift_roc_auc ?? 0).toFixed(3)}`}
          caption="better than assuming all on time" />
        <StatCard label="Brier score" value={Number(m.air_brier ?? 0).toFixed(3)}
          caption="probability error. Lower is better." />
        <StatCard label="Delay error" value={`${Number(m.air_reg_mae ?? 0).toFixed(1)} min`}
          caption="average miss on predicted lateness" />
        <StatCard label="Actual late rate" value={`${((m.air_breach_rate ?? 0) * 100).toFixed(1)}%`}
          caption="share of flights that really were late" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <Card title="Calibration"
              subtitle="Of the shipments we scored 7, about 70% should actually breach">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calData} margin={{ top: 4, right: 8, bottom: 16, left: 0 }}>
                <CartesianGrid stroke="#EFEBE6" vertical={false} />
                <XAxis dataKey="predicted" tick={AXIS} tickLine={false} axisLine={{ stroke: "#E2DCD4" }}
                  label={{ value: "Predicted %", position: "insideBottom", offset: -10, ...AXIS }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="ideal" stroke="#C9B49F" strokeDasharray="4 4"
                  dot={false} name="Ideal" />
                <Line type="monotone" dataKey="observed" stroke="#351C15" strokeWidth={2}
                  dot={{ r: 2.5, fill: "#351C15" }} name="Our model" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11.5px] text-text-muted mt-3 pt-3 border-t border-border-warm leading-relaxed">
            The dashed line is perfect calibration. The closer our line sits to it, the more
            trustworthy the probabilities are.
          </p>
        </Card>

        <Card title="What the model relies on"
              subtitle="Average SHAP importance across all predictions">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shap} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#EFEBE6" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: "#E2DCD4" }} />
                <YAxis type="category" dataKey="feature" width={140}
                  tick={{ fontSize: 10.5, fill: "#6A625A" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#F6F4F1" }} />
                <Bar dataKey="value" fill="#5F3C1E" radius={[0, 2, 2, 0]} barSize={11} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Data provenance" subtitle="What is real and what is simulated">
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <p className="eyebrow text-risk-low mb-3">Real data</p>
            <ul className="space-y-1.5 text-[12.5px] text-text-main">
              {[
                "Recorded weather — Open-Meteo archive, Jan–Feb 2024",
                "Live weather forecasts, fetched at runtime",
                "Live traffic — TomTom",
                "Live flight status — AviationStack",
                "Live news and geopolitical signals — GDELT",
                "Airports, routes and distances",
                "The storms the model learned from: Chicago 9 Jan, Boston 7 Jan, Newark 13 Feb 2024",
              ].map((t) => (
                <li key={t} className="pl-3 border-l-2 border-risk-low/30 leading-snug">{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow text-ups-brown-600 mb-3">Simulated data</p>
            <ul className="space-y-1.5 text-[12.5px] text-text-main">
              {[
                "Individual flight records — delays generated from the real recorded weather, not invented",
                "Shipment records — per-shipment carrier data is not public",
                "Ocean and ground delay labels — no free public dataset exists",
              ].map((t) => (
                <li key={t} className="pl-3 border-l-2 border-ups-brown-200 leading-snug">{t}</li>
              ))}
            </ul>
            <p className="mt-4 text-[12.5px] text-text-muted leading-relaxed">
              Swap in real historical shipments and retrain. The pipeline does not change.
            </p>
          </div>
        </div>
        <p className="text-[11px] text-text-faint mt-5 pt-3 border-t border-border-warm leading-relaxed">
          Trained on {Number(m.air_n_train ?? 0).toLocaleString()} flights, tested on{" "}
          {Number(m.air_n_test ?? 0).toLocaleString()} held out by date — a time-based split,
          because predicting the future from a random split would leak.
        </p>
      </Card>
    </>
  );
}
