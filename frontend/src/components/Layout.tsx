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
  { to: "/community", label: "Community Delivery", icon: Users },
];

export default function Layout() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { api.stats().then(setStats).catch(() => {}); }, []);
  const atRisk = stats ? stats.high + stats.critical : null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ups-brown-800 border-b-4 border-ups-gold">
        <div className="px-6 py-3 flex items-center gap-3">
          <div className="bg-ups-gold text-ups-brown-900 font-black px-2 py-1 rounded text-sm">
            UPS
          </div>
          <h1 className="text-white font-semibold tracking-tight">
            Shipment Delivery Risk Score
          </h1>
          <span className="text-ups-brown-400 text-xs ml-auto">
            Predictive supply-chain intelligence
          </span>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-56 bg-ups-brown-600 shrink-0">
          <ul className="py-3">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-4 py-2.5 text-sm border-l-4 transition-colors
                     ${isActive
                       ? "border-ups-gold bg-ups-brown-800 text-white font-semibold"
                       : "border-transparent text-ups-gold-soft/80 hover:bg-ups-brown-800/50"}`}>
                  <Icon size={16} />
                  <span className="flex-1">{label}</span>
                  {to === "/" && atRisk != null && atRisk > 0 && (
                    <span className="bg-risk-high text-white text-[10px] font-bold
                                     px-1.5 rounded-full tabular-nums">{atRisk}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 p-6 max-w-[1500px]"><Outlet /></main>
      </div>

      <footer className="px-6 py-3 text-xs text-text-muted border-t border-border-warm bg-surface">
        Prototype — not an official UPS product.
      </footer>
    </div>
  );
}
