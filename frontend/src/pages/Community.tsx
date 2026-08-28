import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Package, Star } from "lucide-react";
import { CLUSTERS, economics, type Partner } from "../data/communityDelivery";
import { Card, StatCard } from "../components/ui";
import { usd } from "../lib/format";

const STORAGE_KEY = "ups-community-assignments";

/** Count-up animation for the savings figures. */
function useCountUp(target: number, duration = 400) {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setValue(target); from.current = target; return; }

    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(origin + (target - origin) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

export default function Community() {
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments)); }
    catch { /* private mode - assignments simply will not persist */ }
  }, [assignments]);

  const totals = useMemo(() => {
    let packages = 0, saving = 0, hours = 0, co2 = 0;
    for (const c of CLUSTERS) {
      const partner = c.partners.find((p) => p.id === assignments[c.id]) ?? null;
      if (!partner) continue;
      const e = economics(c, partner);
      packages += e.assignedPackages;
      saving += e.saving;
      hours += e.hoursSaved;
      co2 += e.co2SavedKg;
    }
    return { packages, saving, hours, co2 };
  }, [assignments]);

  const savingAnim = useCountUp(totals.saving);
  const hoursAnim = useCountUp(totals.hours);
  const co2Anim = useCountUp(totals.co2);

  const toggle = (clusterId: string, partnerId: string) =>
    setAssignments((a) =>
      a[clusterId] === partnerId
        ? Object.fromEntries(Object.entries(a).filter(([k]) => k !== clusterId))
        : { ...a, [clusterId]: partnerId });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-ups-brown-800">Community Delivery</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-3xl">
          Twenty separate stops in one town is slow and expensive. Dropping all twenty
          with a single verified local partner who completes the last leg replaces
          twenty van stops with one.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Packages consolidated" value={totals.packages}
          caption="handed to local partners" />
        <StatCard label="Cost saved" value={usd(savingAnim)}
          accent="text-ups-gold-dark" caption="versus door-to-door delivery" />
        <StatCard label="Driver hours saved" value={hoursAnim.toFixed(1) + " h"}
          caption="returned to the route" />
        <StatCard label="CO2 avoided" value={co2Anim.toFixed(1) + " kg"}
          caption="from kilometres not driven" />
      </div>

      <Card title="How it works">
        <BeforeAfter />
      </Card>

      <div className="space-y-4">
        {CLUSTERS.map((c) => {
          const partner = c.partners.find((p) => p.id === assignments[c.id]) ?? null;
          const e = economics(c, partner);
          return (
            <Card key={c.id} title={c.town + ", " + c.city}
              subtitle={c.packages + " packages · " + c.totalWeightKg + " kg · " + c.window}
              right={partner ? (
                <span className="text-sm font-semibold text-ups-gold-dark tabular-nums">
                  saving {usd(e.saving)} ({(e.savingPct * 100).toFixed(0)}%)
                </span>
              ) : (
                <span className="text-sm text-text-muted">{usd(e.directCost)} direct</span>
              )}>

              {partner && (
                <div className="bg-ups-gold-soft border border-ups-gold rounded px-4 py-3 mb-4 text-sm">
                  <strong>{partner.name}</strong> takes{" "}
                  <strong className="tabular-nums">{e.assignedPackages} of {c.packages}</strong> packages.
                  {e.remainingPackages > 0 && (
                    <span className="text-risk-medium">
                      {" "}{e.remainingPackages} exceed their capacity and stay on direct delivery.
                    </span>
                  )}
                  <div className="mt-1.5 text-xs text-text-muted tabular-nums">
                    {usd(e.directCost)} direct &rarr; {usd(e.consolidatedCost)} consolidated
                    &nbsp;&middot;&nbsp; {e.kmSaved.toFixed(1)} km and{" "}
                    {e.hoursSaved.toFixed(1)} h saved
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {c.partners.map((p) => (
                  <PartnerCard key={p.id} partner={p} packages={c.packages}
                    selected={assignments[c.id] === p.id}
                    onSelect={() => toggle(c.id, p.id)} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-text-muted border-t border-border-warm pt-3">
        Concept demonstration with representative data. Partner verification, routing
        and settlement would be real integrations in production.
      </p>
    </div>
  );
}

function PartnerCard({ partner, packages, selected, onSelect }: {
  partner: Partner; packages: number; selected: boolean; onSelect: () => void;
}) {
  const initials = partner.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const short = partner.capacity < packages;

  return (
    <button onClick={onSelect} aria-pressed={selected}
      className={"text-left border rounded-lg p-3 transition-colors w-full " +
        (selected
          ? "border-ups-gold bg-ups-gold-soft ring-2 ring-ups-gold/40"
          : "border-border-warm hover:bg-surface-alt")}>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-full bg-ups-brown-600 text-white text-xs
                         font-bold flex items-center justify-center shrink-0">
          {initials}
        </span>
        <span className="font-semibold text-sm text-ups-brown-800 truncate">{partner.name}</span>
        {partner.verified && <BadgeCheck size={15} className="text-risk-low shrink-0" />}
      </div>

      <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
        <span className="flex items-center gap-0.5">
          <Star size={11} className="text-ups-gold fill-ups-gold" />
          {partner.rating}
        </span>
        <span>{partner.completedDeliveries} deliveries</span>
        <span>{partner.distanceKm} km</span>
      </div>

      <div className="flex items-center gap-1.5 mt-2 text-xs">
        <Package size={12} className={short ? "text-risk-medium" : "text-text-muted"} />
        <span className={short ? "text-risk-medium font-medium" : "text-text-muted"}>
          holds {partner.capacity}{short ? " - not all " + packages : ""}
        </span>
        <span className="ml-auto tabular-nums font-medium text-ups-brown-800">
          ${partner.feePerPackage.toFixed(2)}/pkg
        </span>
      </div>

      {!partner.verified && (
        <p className="text-[10px] text-risk-medium mt-1.5">Verification pending</p>
      )}
    </button>
  );
}

/** Schematic: twenty separate stops on the left, one drop plus a local loop right. */
function BeforeAfter() {
  const houses = Array.from({ length: 12 });
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <figure>
        <figcaption className="text-xs uppercase tracking-wide font-semibold text-text-muted mb-2">
          Today &mdash; one stop per address
        </figcaption>
        <svg viewBox="0 0 260 150" className="w-full h-40" role="img"
             aria-label="One hub with twelve separate delivery lines">
          {houses.map((_, i) => {
            const angle = (Math.PI / (houses.length - 1)) * i - Math.PI / 2;
            const x = 130 + Math.cos(angle) * 105;
            const y = 135 + Math.sin(angle) * 95;
            return (
              <g key={i}>
                <line x1={30} y1={40} x2={x} y2={y} stroke="#8B6A4F" strokeWidth={1} />
                <rect x={x - 4} y={y - 4} width={8} height={8} fill="#5F3C1E" rx={1} />
              </g>
            );
          })}
          <circle cx={30} cy={40} r={9} fill="#351C15" />
          <text x={30} y={26} textAnchor="middle" fontSize={9} fill="#6B6560">Hub</text>
        </svg>
      </figure>

      <figure>
        <figcaption className="text-xs uppercase tracking-wide font-semibold text-text-muted mb-2">
          Consolidated &mdash; one drop, local last leg
        </figcaption>
        <svg viewBox="0 0 260 150" className="w-full h-40" role="img"
             aria-label="One line into a local partner, then a short local loop">
          <line x1={30} y1={40} x2={150} y2={80} stroke="#351C15" strokeWidth={2.5} />
          {houses.map((_, i) => {
            const angle = (Math.PI * 2 / houses.length) * i;
            const x = 150 + Math.cos(angle) * 45;
            const y = 80 + Math.sin(angle) * 38;
            return (
              <g key={i}>
                <line x1={150} y1={80} x2={x} y2={y} stroke="#E3DED8" strokeWidth={1} />
                <rect x={x - 4} y={y - 4} width={8} height={8} fill="#5F3C1E" rx={1} />
              </g>
            );
          })}
          <circle cx={30} cy={40} r={9} fill="#351C15" />
          <text x={30} y={26} textAnchor="middle" fontSize={9} fill="#6B6560">Hub</text>
          <circle cx={150} cy={80} r={11} fill="#FFB500" stroke="#351C15" strokeWidth={1.5} />
          <text x={150} y={128} textAnchor="middle" fontSize={9} fill="#6B6560">Local partner</text>
        </svg>
      </figure>
    </div>
  );
}
