import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plane, Ship, Truck, RefreshCw } from "lucide-react";
import { api } from "../api";
import type { Band, Health, ShipmentSummary, Stats } from "../types";
import { BandPill, Card, ErrorState, RiskScore, Skeleton, StatCard } from "../components/ui";
import { num, pct, usd } from "../lib/format";

const MODE_ICON: Record<string, typeof Plane> = { AIR: Plane, OCEAN: Ship, GROUND: Truck };
const BANDS = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const BORDER: Record<Band, string> = {
  CRITICAL: "border-risk-critical", HIGH: "border-risk-high",
  MEDIUM: "border-risk-medium", LOW: "border-risk-low",
};

export default function RiskQueue() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [rows, setRows] = useState<ShipmentSummary[] | null>(null);
  const [error, setError] = useState("");
  const [band, setBand] = useState("");
  const [mode, setMode] = useState("");
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const load = useCallback(() => {
    setError("");
    Promise.all([api.stats(), api.shipments({ band, mode, limit: 100 })])
      .then(([s, r]) => { setStats(s); setRows(r); })
      .catch((e) => setError(e.message));
    api.health().then(setHealth).catch(() => undefined);
  }, [band, mode]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!refreshing) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [refreshing]);

  const refresh = async () => {
    setRefreshing(true);
    setElapsed(0);
    try {
      await api.refresh();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const visible = (rows ?? []).filter(
    (r) => !q || r.id.toLowerCase().includes(q.toLowerCase()));
  const flight = health?.providers.find((p) => p.name === "flight");

  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-ups-brown-800">Risk Queue</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {stats
              ? stats.total_active.toLocaleString() + " active shipments. " +
                (stats.high + stats.critical) + " need you today."
              : "Loading fleet..."}
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="bg-ups-gold hover:bg-ups-gold-dark disabled:opacity-60 text-ups-brown-900 font-semibold px-4 py-2 rounded text-sm flex items-center gap-2">
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Pulling live signals... " + elapsed + "s" : "Refresh live signals"}
        </button>
      </div>

      {refreshing && (
        <div className="bg-ups-gold-soft border border-ups-gold rounded-lg px-4 py-3 text-sm">
          Re-pulling live weather, news, traffic and flight data for every route on
          every shipment. This normally takes 60&ndash;140 seconds.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Active" value={stats?.total_active ?? "--"} caption="shipments in transit" />
        <StatCard label="Critical" value={stats?.critical ?? "--"} accent="text-risk-critical" caption="escalate now" />
        <StatCard label="High" value={stats?.high ?? "--"} accent="text-risk-high" caption="intervene today" />
        <StatCard label="Medium" value={stats?.medium ?? "--"} accent="text-risk-medium" caption="monitor only" />
        <StatCard label="Value at risk" value={stats ? usd(stats.at_risk_value_usd) : "--"} caption="in high + critical" />
        <StatCard label="Flight API" value={flight?.calls_remaining ?? "--"}
          caption={"live calls left of " + (flight?.hard_cap ?? 60) + "/month"} />
      </div>

      <Card title="Shipments" subtitle="Sorted by risk score, highest first">
        <div className="flex gap-3 flex-wrap mb-4">
          <select value={band} onChange={(e) => setBand(e.target.value)} aria-label="Filter by risk band"
            className="border border-border-warm rounded px-3 py-1.5 text-sm bg-surface">
            {BANDS.map((b) => <option key={b} value={b}>{b || "All bands"}</option>)}
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Filter by mode"
            className="border border-border-warm rounded px-3 py-1.5 text-sm bg-surface">
            {["", "AIR", "OCEAN", "GROUND"].map((m) => <option key={m} value={m}>{m || "All modes"}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by ID"
            aria-label="Search by shipment ID"
            className="border border-border-warm rounded px-3 py-1.5 text-sm flex-1 min-w-40" />
        </div>

        {!rows ? <Skeleton rows={8} /> : visible.length === 0 ? (
          <p className="text-sm text-text-muted py-8 text-center">No shipments match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-text-muted border-b border-border-warm">
                  <th className="py-2 pr-3">Risk</th>
                  <th className="pr-3">Shipment</th>
                  <th className="pr-3">Route</th>
                  <th className="pr-3">Carrier</th>
                  <th className="pr-3 text-right">Delay</th>
                  <th className="pr-3 text-right">Value</th>
                  <th className="w-28">Progress</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const Icon = MODE_ICON[s.mode] ?? Truck;
                  const b: Band = s.risk?.band ?? "LOW";
                  return (
                    <tr key={s.id} className="border-b border-border-warm/60 hover:bg-surface-alt">
                      <td className="py-2.5 pr-3">
                        <div className={"flex items-center gap-2 border-l-4 pl-2 " + BORDER[b]}>
                          <RiskScore score={s.risk?.score ?? 0} band={b} size="sm" />
                          <BandPill band={b} />
                        </div>
                      </td>
                      <td className="pr-3">
                        <Link to={"/shipments/" + s.id}
                          className="font-medium text-ups-brown-800 hover:text-ups-gold-dark hover:underline">
                          {s.id}
                        </Link>
                        <div className="text-xs text-text-muted flex items-center gap-1">
                          <Icon size={11} />{s.mode}
                        </div>
                      </td>
                      <td className="pr-3 text-xs">
                        {s.origin.code} &rarr; {s.destination.code}
                        <div className="text-text-muted">{s.origin.name}</div>
                      </td>
                      <td className="pr-3 text-xs">{s.carrier}</td>
                      <td className="pr-3 text-right tabular-nums">
                        {s.risk ? num(s.risk.predicted_delay_hours) + "h" : "--"}
                        <div className="text-xs text-text-muted">
                          {s.risk ? pct(s.risk.breach_probability) : ""}
                        </div>
                      </td>
                      <td className="pr-3 text-right tabular-nums">{usd(s.value_usd)}</td>
                      <td>
                        <div className="h-1.5 bg-surface-alt rounded overflow-hidden">
                          <div className="h-full bg-ups-brown-600" style={{ width: s.progress_pct + "%" }} />
                        </div>
                        <span className="text-[10px] text-text-muted tabular-nums">
                          {Math.round(s.progress_pct)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
