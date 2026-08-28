import { NavLink, Outlet } from "react-router-dom";
import { Activity, BarChart3, History, Package, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Stats } from "../types";

const NAV = [
  { to: "/", label: "Risk Queue", icon: Package, end: true },
  { to: "/predict", label: "New Shipment", icon: Activity },
  { to: "/backtest", label: "Backtest", icon: History },
  { to: "/model", label: "Model Trust", icon: BarChart3 },
  { to: "/community", label: "Community", icon: Users },
];

export default function Layout() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { api.stats().then(setStats).catch(() => undefined); }, []);
  const atRisk = stats ? stats.high + stats.critical : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Brand bar. Solid brown, gold rule underneath - no gradients. */}
      <header className="bg-ups-brown-800 shrink-0">
        <div className="h-14 px-5 flex items-center gap-3.5">
          <span className="bg-ups-gold text-ups-brown-900 font-black text-[13px]
                           tracking-tight px-2 py-1 rounded-[2px] leading-none">
            UPS
          </span>
          <div className="leading-tight">
            <h1 className="text-white text-[13px] font-semibold tracking-tight">
              Shipment Delivery Risk Score
            </h1>
            <p className="text-ups-brown-200 text-[10.5px] tracking-wide">
              Predictive supply-chain intelligence
            </p>
          </div>
          {stats && (
            <div className="ml-auto flex items-center gap-2 text-[11px] text-ups-brown-200">
              <span className="w-1.5 h-1.5 rounded-full bg-risk-low" aria-hidden="true" />
              {stats.total_active.toLocaleString()} shipments tracked
            </div>
          )}
        </div>
        <div className="h-[3px] bg-ups-gold" />
      </header>

      <div className="flex flex-1 min-h-0">
        <nav aria-label="Main" className="w-52 shrink-0 bg-surface border-r border-border-warm">
          <ul className="py-3">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end}
                  className={({ isActive }) =>
                    "flex items-center gap-2.5 pl-4 pr-3 py-2.5 text-[13px] border-l-[3px] " +
                    "transition-colors duration-200 " +
                    (isActive
                      ? "border-ups-gold bg-ups-gold-soft text-ups-brown-900 font-semibold"
                      : "border-transparent text-text-muted hover:text-ups-brown-800 hover:bg-surface-alt")}>
                  <Icon size={15} strokeWidth={2} aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  {to === "/" && atRisk != null && atRisk > 0 && (
                    <span className="bg-risk-high text-white text-[10px] font-bold
                                     px-1.5 py-[2px] rounded-full tabular-nums leading-none">
                      {atRisk}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="mx-4 mt-4 pt-4 border-t border-border-warm">
            <p className="eyebrow mb-2">Data</p>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Weather, traffic, flight status and news are fetched live. Flight and
              shipment records are simulated.
            </p>
          </div>
        </nav>

        <main className="flex-1 min-w-0 px-6 py-6">
          <div className="max-w-[1440px] space-y-5">
            <Outlet />
          </div>
        </main>
      </div>

      <footer className="px-6 py-2.5 text-[11px] text-text-faint border-t border-border-warm bg-surface">
        Prototype — not an official UPS product.
      </footer>
    </div>
  );
}
