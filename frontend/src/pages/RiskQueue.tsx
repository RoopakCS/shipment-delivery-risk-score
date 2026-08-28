import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plane, Ship, Truck, RefreshCw } from "lucide-react";
import { api } from "../api";
import type { Band, Health, ShipmentSummary, Stats } from "../types";
import {
  BandPill, Button, Card, ErrorState, PageHeader, RiskScore, Skeleton, StatCard, bandBorder,
} from "../components/ui";
import { num, pct, usd } from "../lib/format";

const MODE_ICON: Record<string, typeof Plane> = { AIR: Plane, OCEAN: Ship, GROUND: Truck };
const BANDS = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"];

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

  const select = "border border-border-strong rounded-[3px] px-2.5 py-1.5 text-[12.5px] " +
    "bg-surface text-ups-brown-800 cursor-pointer";

  return (
    <>
      <PageHeader
        title="Risk Queue"
        lede={stats
          ? `${stats.total_active.toLocaleString()} shipments in transit. ${stats.high + stats.critical} need attention today.`
          : "Loading fleet…"}
        action={
          <Button onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
            {refreshing ? `Pulling signals… ${elapsed}s` : "Refresh live signals"}
          </Button>
        } />

      {refreshing && (
        <div role="status"
          className="bg-ups-gold-soft border border-border-warm border-l-[3px] border-l-ups-gold
                     rounded-[6px] px-4 py-2.5 text-[12.5px] text-ups-brown-800">
          Re-pulling live weather, news, traffic and flight data across every route.
          This normally takes 60&ndash;140 seconds.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Active" value={stats?.total_active ?? "—"} caption="shipments in transit" />
        <StatCard label="Critical" value={stats?.critical ?? "—"} accent="text-risk-critical" caption="escalate now" />
        <StatCard label="High" value={stats?.high ?? "—"} accent="text-risk-high" caption="intervene today" />
        <StatCard label="Medium" value={stats?.medium ?? "—"} accent="text-risk-medium" caption="monitor only" />
        <StatCard label="Value at risk" value={stats ? usd(stats.at_risk_value_usd) : "—"} caption="in high + critical" />
        <StatCard label="Flight API" value={flight?.calls_remaining ?? "—"}
          caption={`live calls left of ${flight?.hard_cap ?? 60} per month`} />
      </div>

      <Card
        title="Shipments"
        subtitle="Ranked by risk score, highest first"
        flush
        right={
          <div className="flex gap-2 flex-wrap">
            <select value={band} onChange={(e) => setBand(e.target.value)}
              aria-label="Filter by risk band" className={select}>
              {BANDS.map((b) => <option key={b} value={b}>{b || "All bands"}</option>)}
            </select>
            <select value={mode} onChange={(e) => setMode(e.target.value)}
              aria-label="Filter by transport mode" className={select}>
              {["", "AIR", "OCEAN", "GROUND"].map((m) =>
                <option key={m} value={m}>{m || "All modes"}</option>)}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID"
              aria-label="Search by shipment ID"
              className="border border-border-strong rounded-[3px] px-2.5 py-1.5 text-[12.5px] w-32" />
          </div>
        }>

        {!rows ? <div className="p-5"><Skeleton rows={8} /></div>
          : visible.length === 0 ? (
            <p className="text-[13px] text-text-muted py-12 text-center">
              No shipments match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left border-b border-border-warm bg-surface-alt">
                    <th className="py-2 pl-5 pr-3 eyebrow font-semibold">Risk</th>
                    <th className="pr-3 eyebrow font-semibold">Shipment</th>
                    <th className="pr-3 eyebrow font-semibold">Route</th>
                    <th className="pr-3 eyebrow font-semibold">Carrier</th>
                    <th className="pr-3 eyebrow font-semibold text-right">Delay</th>
                    <th className="pr-3 eyebrow font-semibold text-right">Value</th>
                    <th className="pr-5 eyebrow font-semibold w-28">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => {
                    const Icon = MODE_ICON[s.mode] ?? Truck;
                    const b: Band = s.risk?.band ?? "LOW";
                    return (
                      <tr key={s.id}
                        className="border-b border-border-warm/70 hover:bg-ups-gold-soft/40 transition-colors duration-150">
                        <td className={`py-2.5 pl-5 pr-3 border-l-[3px] ${bandBorder[b]}`}>
                          <div className="flex items-center gap-2.5">
                            <RiskScore score={s.risk?.score ?? 0} band={b} size="sm" />
                            <BandPill band={b} />
                          </div>
                        </td>
                        <td className="pr-3">
                          <Link to={`/shipments/${s.id}`}
                            className="font-semibold text-ups-brown-800 hover:text-ups-gold-dark
                                       hover:underline underline-offset-2">
                            {s.id}
                          </Link>
                          <div className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
                            <Icon size={11} aria-hidden="true" />{s.mode}
                          </div>
                        </td>
                        <td className="pr-3">
                          <span className="font-semibold text-ups-brown-800 tabular-nums">
                            {s.origin.code} → {s.destination.code}
                          </span>
                          <div className="text-[11px] text-text-muted truncate max-w-[15rem]">
                            {s.origin.name}
                          </div>
                        </td>
                        <td className="pr-3 text-text-muted">{s.carrier}</td>
                        <td className="pr-3 text-right">
                          <span className="tabular-nums font-medium">
                            {s.risk ? `${num(s.risk.predicted_delay_hours)}h` : "—"}
                          </span>
                          <div className="text-[11px] text-text-muted tabular-nums">
                            {s.risk ? `${pct(s.risk.breach_probability)} breach` : ""}
                          </div>
                        </td>
                        <td className="pr-3 text-right tabular-nums">{usd(s.value_usd)}</td>
                        <td className="pr-5">
                          <div className="h-[5px] bg-surface-sunk rounded-[1px] overflow-hidden">
                            <div className="h-full bg-ups-brown-600"
                                 style={{ width: `${s.progress_pct}%` }} />
                          </div>
                          <span className="text-[10.5px] text-text-muted tabular-nums">
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
    </>
  );
}
