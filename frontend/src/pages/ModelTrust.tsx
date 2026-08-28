import { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import type { Metrics } from "../types";
import { Card, ErrorState, Skeleton, StatCard } from "../components/ui";

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
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-ups-brown-800">Model Trust</h2>
        <p className="text-sm text-text-muted mt-0.5">
          How well the model performs, and what it is built on.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="ROC-AUC" value={Number(m.air_roc_auc ?? 0).toFixed(3)}
          caption="0.5 is guessing. Higher is better." />
        <StatCard label="Lift over baseline" value={"+" + Number(m.air_lift_roc_auc ?? 0).toFixed(3)}
          caption="how much better than assuming all on time" />
        <StatCard label="Brier score" value={Number(m.air_brier ?? 0).toFixed(3)}
          caption="probability error. Lower is better." />
        <StatCard label="Delay error" value={Number(m.air_reg_mae ?? 0).toFixed(1) + " min"}
          caption="average miss on predicted lateness" />
        <StatCard label="Actual late rate" value={((m.air_breach_rate ?? 0) * 100).toFixed(1) + "%"}
          caption="share of flights that really were late" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Calibration"
              subtitle="Of the shipments we scored 7, about 70% should actually breach">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3DED8" />
                <XAxis dataKey="predicted" tick={{ fontSize: 11 }}
                  label={{ value: "Predicted %", position: "insideBottom", offset: -4, fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }}
                  label={{ value: "Observed %", angle: -90, position: "insideLeft", fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="ideal" stroke="#8B6A4F" strokeDasharray="5 5"
                  dot={false} name="Ideal" />
                <Line type="monotone" dataKey="observed" stroke="#351C15" strokeWidth={2}
                  dot={{ r: 3 }} name="Our model" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-text-muted mt-2">
            The dashed line is perfect calibration. The closer our line sits to it,
            the more trustworthy the probabilities are.
          </p>
        </Card>

        <Card title="What the model relies on"
              subtitle="Average SHAP importance across all predictions">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shap} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3DED8" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="feature" width={130} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#5F3C1E" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Data provenance" subtitle="What is real and what is simulated">
        <div className="grid md:grid-cols-2 gap-5 text-sm">
          <div>
            <h4 className="font-semibold text-risk-low mb-2">Real data</h4>
            <ul className="space-y-1 text-text-main">
              <li>&bull; Recorded weather &mdash; Open-Meteo archive, Jan&ndash;Feb 2024</li>
              <li>&bull; Live weather forecasts &mdash; fetched at runtime</li>
              <li>&bull; Live traffic &mdash; TomTom</li>
              <li>&bull; Live flight status &mdash; AviationStack</li>
              <li>&bull; Live news and geopolitical signals &mdash; GDELT</li>
              <li>&bull; Airports, routes and distances</li>
              <li>&bull; The storms the model learned from: Chicago 9 Jan,
                  Boston 7 Jan, Newark 13 Feb 2024</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-ups-brown-600 mb-2">Simulated data</h4>
            <ul className="space-y-1 text-text-main">
              <li>&bull; Individual flight records &mdash; delays are generated
                  <em> from the real recorded weather</em>, not invented</li>
              <li>&bull; Shipment records &mdash; per-shipment carrier data is not public</li>
              <li>&bull; Ocean and ground delay labels &mdash; no free public dataset exists</li>
            </ul>
            <p className="mt-3 text-text-muted">
              Swap in real historical shipments and retrain. The pipeline does not change.
            </p>
          </div>
        </div>
        <p className="text-xs text-text-muted mt-4 pt-3 border-t border-border-warm">
          Trained on {Number(m.air_n_train ?? 0).toLocaleString()} flights, tested on{" "}
          {Number(m.air_n_test ?? 0).toLocaleString()} held out by date &mdash; a
          time-based split, because predicting the future from a random split would leak.
        </p>
      </Card>
    </div>
  );
}
