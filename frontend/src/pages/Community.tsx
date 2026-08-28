import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Package, Star } from "lucide-react";
import { CLUSTERS, economics, type Partner } from "../data/communityDelivery";
import { Card, PageHeader, StatCard } from "../components/ui";
import { usd } from "../lib/format";

const STORAGE_KEY = "ups-community-assignments";

/** Count-up for the savings figures. Honours reduced-motion. */
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
    <>
      <PageHeader
        title="Community Delivery"
        lede="Twenty separate stops in one town is slow and expensive. Dropping all twenty with a
              single verified local partner who completes the last leg replaces twenty van
              stops with one." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Packages consolidated" value={totals.packages}
          caption="handed to local partners" />
        <StatCard label="Cost saved" value={usd(savingAnim)}
          accent="text-ups-gold-dark" caption="versus door-to-door delivery" />
        <StatCard label="Driver hours saved" value={`${hoursAnim.toFixed(1)} h`}
          caption="returned to the route" />
        <StatCard label="CO₂ avoided" value={`${co2Anim.toFixed(1)} kg`}
          caption="from kilometres not driven" />
      </div>

      <Card title="How it works">
        <BeforeAfter />
      </Card>

      {CLUSTERS.map((c) => {
        const partner = c.partners.find((p) => p.id === assignments[c.id]) ?? null;
        const e = economics(c, partner);
        return (
          <Card key={c.id}
            title={`${c.town}, ${c.city}`}
            subtitle={`${c.packages} packages · ${c.totalWeightKg} kg · ${c.window}`}
            right={
              <div className="text-right">
                {partner ? (
                  <>
                    <div className="text-[1.125rem] font-bold tabular-nums text-ups-gold-dark leading-none">
                      {usd(e.saving)}
                    </div>
                    <p className="text-[10.5px] text-text-muted mt-1 tabular-nums">
                      saved · {(e.savingPct * 100).toFixed(0)}%
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-[1.125rem] font-bold tabular-nums text-ups-brown-800 leading-none">
                      {usd(e.directCost)}
                    </div>
                    <p className="text-[10.5px] text-text-muted mt-1">direct cost</p>
                  </>
                )}
              </div>
            }>

            {partner && (
              <div className="bg-ups-gold-soft border-l-[3px] border-l-ups-gold rounded-[3px]
                              px-4 py-3 mb-4">
                <p className="text-[12.5px] text-ups-brown-900">
                  <strong>{partner.name}</strong> takes{" "}
                  <strong className="tabular-nums">{e.assignedPackages} of {c.packages}</strong> packages.
                  {e.remainingPackages > 0 && (
                    <span className="text-risk-medium">
                      {" "}{e.remainingPackages} exceed their capacity and stay on direct delivery.
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-text-muted mt-1.5 tabular-nums">
                  {usd(e.directCost)} direct → {usd(e.consolidatedCost)} consolidated ·{" "}
                  {e.kmSaved.toFixed(1)} km and {e.hoursSaved.toFixed(1)} h saved
                </p>
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

      <p className="text-[11px] text-text-faint leading-relaxed">
        Concept demonstration with representative data. Partner verification, routing and
        settlement would be real integrations in production.
      </p>
    </>
  );
}

function PartnerCard({ partner, packages, selected, onSelect }: {
  partner: Partner; packages: number; selected: boolean; onSelect: () => void;
}) {
  const initials = partner.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const short = partner.capacity < packages;

  return (
    <button onClick={onSelect} aria-pressed={selected}
      className={"text-left border rounded-[6px] p-3.5 w-full cursor-pointer " +
        "transition-colors duration-200 " +
        (selected
          ? "border-ups-gold bg-ups-gold-soft"
          : "border-border-warm hover:border-border-strong hover:bg-surface-alt")}>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-ups-brown-600 text-white text-[11px]
                         font-bold flex items-center justify-center shrink-0 tracking-tight">
          {initials}
        </span>
        <span className="text-[13px] font-semibold text-ups-brown-800 truncate flex-1">
          {partner.name}
        </span>
        {partner.verified && (
          <BadgeCheck size={15} className="text-risk-low shrink-0" aria-label="Verified partner" />
        )}
      </div>

      <div className="flex items-center gap-3 mt-2.5 text-[11px] text-text-muted tabular-nums">
        <span className="flex items-center gap-1">
          <Star size={11} className="text-ups-gold fill-ups-gold" aria-hidden="true" />
          {partner.rating}
        </span>
        <span>{partner.completedDeliveries} deliveries</span>
        <span>{partner.distanceKm} km</span>
      </div>

      <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-border-warm text-[11px]">
        <Package size={12} className={short ? "text-risk-medium" : "text-text-faint"}
          aria-hidden="true" />
        <span className={short ? "text-risk-medium font-semibold" : "text-text-muted"}>
          holds {partner.capacity}{short ? ` — not all ${packages}` : ""}
        </span>
        <span className="ml-auto tabular-nums font-semibold text-ups-brown-800">
          ${partner.feePerPackage.toFixed(2)}/pkg
        </span>
      </div>

      {!partner.verified && (
        <p className="text-[10px] text-risk-medium mt-2">Verification pending</p>
      )}
    </button>
  );
}

/** Schematic: many separate stops on the left, one drop plus a local loop on the right. */
function BeforeAfter() {
  const houses = Array.from({ length: 12 });
  return (
    <div className="grid md:grid-cols-2 gap-8">
      <figure>
        <figcaption className="eyebrow mb-3">Today — one stop per address</figcaption>
        <svg viewBox="0 0 260 150" className="w-full h-40" role="img"
             aria-label="One hub with twelve separate delivery lines fanning out">
          {houses.map((_, i) => {
            const angle = (Math.PI / (houses.length - 1)) * i - Math.PI / 2;
            const x = 130 + Math.cos(angle) * 105;
            const y = 135 + Math.sin(angle) * 95;
            return (
              <g key={i}>
                <line x1={30} y1={40} x2={x} y2={y} stroke="#C9B49F" strokeWidth={1} />
                <rect x={x - 3.5} y={y - 3.5} width={7} height={7} fill="#5F3C1E" />
              </g>
            );
          })}
          <circle cx={30} cy={40} r={8} fill="#351C15" />
          <text x={30} y={24} textAnchor="middle" fontSize={9} fill="#6A625A">Hub</text>
        </svg>
      </figure>

      <figure>
        <figcaption className="eyebrow mb-3">Consolidated — one drop, local last leg</figcaption>
        <svg viewBox="0 0 260 150" className="w-full h-40" role="img"
             aria-label="One line into a local partner, then a short local loop">
          <line x1={30} y1={40} x2={150} y2={80} stroke="#351C15" strokeWidth={2.5} />
          {houses.map((_, i) => {
            const angle = (Math.PI * 2 / houses.length) * i;
            const x = 150 + Math.cos(angle) * 45;
            const y = 80 + Math.sin(angle) * 38;
            return (
              <g key={i}>
                <line x1={150} y1={80} x2={x} y2={y} stroke="#E2DCD4" strokeWidth={1} />
                <rect x={x - 3.5} y={y - 3.5} width={7} height={7} fill="#5F3C1E" />
              </g>
            );
          })}
          <circle cx={30} cy={40} r={8} fill="#351C15" />
          <text x={30} y={24} textAnchor="middle" fontSize={9} fill="#6A625A">Hub</text>
          <circle cx={150} cy={80} r={10} fill="#FFB500" stroke="#351C15" strokeWidth={1.5} />
          <text x={150} y={128} textAnchor="middle" fontSize={9} fill="#6A625A">Local partner</text>
        </svg>
      </figure>
    </div>
  );
}
