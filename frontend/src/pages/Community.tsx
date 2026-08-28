import React, { useState, useEffect } from 'react';
import { mockClusters } from '../data/communityDelivery';
import { formatMoney, formatNumber, formatPercent } from '../utils/formatters';
import { StatCard } from '../components/shared/StatCard';
import { cn } from '../components/shared/BandPill';
import { Users, CheckCircle2, Star, Truck, MapPin, DollarSign, Clock, Leaf, Info, X } from 'lucide-react';

export const Community: React.FC = () => {
  // Map of ClusterID -> PartnerID (if assigned)
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ups_community_assignments');
      if (saved) {
        setAssignments(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load assignments", e);
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('ups_community_assignments', JSON.stringify(assignments));
    } catch (e) {
      console.error("Failed to save assignments", e);
    }
  }, [assignments]);

  const handleAssign = (clusterId: string, partnerId: string) => {
    setAssignments(prev => ({ ...prev, [clusterId]: partnerId }));
  };

  const handleUnassign = (clusterId: string) => {
    setAssignments(prev => {
      const next = { ...prev };
      delete next[clusterId];
      return next;
    });
  };

  // Calculate live KPIs
  let totalConsolidatedPkgs = 0;
  let totalDollarsSaved = 0;
  let totalHoursSaved = 0;
  let totalCo2Avoided = 0;

  mockClusters.forEach(cluster => {
    const assignedPartnerId = assignments[cluster.id];
    if (assignedPartnerId) {
      const partner = cluster.partners.find(p => p.id === assignedPartnerId);
      if (partner) {
        // Handle partial capacity
        const pkgsToConsolidate = Math.min(cluster.package_count, partner.capacity_packages);
        const ratio = pkgsToConsolidate / cluster.package_count;

        const originalCost = cluster.direct_cost_usd * ratio;
        const newCost = pkgsToConsolidate * partner.per_package_fee_usd;
        const savings = originalCost - newCost;

        totalConsolidatedPkgs += pkgsToConsolidate;
        totalDollarsSaved += Math.max(0, savings);
        totalHoursSaved += (cluster.direct_driver_hours * ratio * 0.8); // 80% of driver time saved for consolidated portion
        totalCo2Avoided += (cluster.direct_distance_km * ratio * cluster.co2_kg_per_km);
      }
    }
  });

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      <div>
        <h1 className="text-2xl font-bold text-ups-brown-800 flex items-center gap-2 mb-2">
          <Users size={24} className="text-ups-gold" />
          Community Delivery Concept
        </h1>
        <p className="text-text-muted max-w-3xl mb-4">
          Sending a driver into a residential town to make 20 separate stops is slow and expensive. What if we drop all 20 packages at a single verified local partner, and they complete the last leg?
        </p>
        <div className="bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded-md text-sm flex items-start gap-2">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            <strong>Note:</strong> This module is a concept demonstration with representative data. Partner verification, background checks, dynamic routing, and settlement would require real integrations in production.
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard 
          label="Packages Consolidated" 
          value={formatNumber(totalConsolidatedPkgs, 0)} 
          icon={<Truck size={20} />} 
        />
        <StatCard 
          label="Cost Savings" 
          value={formatMoney(totalDollarsSaved)} 
          valueClassName={totalDollarsSaved > 0 ? "text-ups-gold-dark transition-all duration-500" : ""}
          icon={<DollarSign size={20} />} 
        />
        <StatCard 
          label="Driver Hours Saved" 
          value={formatNumber(totalHoursSaved, 1)} 
          valueClassName={totalHoursSaved > 0 ? "text-ups-gold-dark transition-all duration-500" : ""}
          icon={<Clock size={20} />} 
        />
        <StatCard 
          label="CO2 Avoided (kg)" 
          value={formatNumber(totalCo2Avoided, 2)} 
          valueClassName={totalCo2Avoided > 0 ? "text-risk-low transition-all duration-500" : ""}
          icon={<Leaf size={20} />} 
        />
      </div>

      {/* Before / After Diagram */}
      <div className="bg-surface border border-border-warm rounded-md p-6 shadow-sm flex items-center justify-around">
        <div className="text-center">
          <h3 className="font-semibold text-ups-brown-900 mb-4">Direct Delivery (Inefficient)</h3>
          <svg width="200" height="150" viewBox="0 0 200 150" className="mx-auto">
            <rect x="90" y="10" width="20" height="20" fill="#2C1608" rx="4" />
            <path d="M100 30 L30 120 M100 30 L60 130 M100 30 L100 135 M100 30 L140 130 M100 30 L170 120" stroke="#8B6A4F" strokeWidth="2" />
            <circle cx="30" cy="120" r="4" fill="#351C15" />
            <circle cx="60" cy="130" r="4" fill="#351C15" />
            <circle cx="100" cy="135" r="4" fill="#351C15" />
            <circle cx="140" cy="130" r="4" fill="#351C15" />
            <circle cx="170" cy="120" r="4" fill="#351C15" />
          </svg>
        </div>
        
        <div className="text-gray-300 font-bold text-2xl flex flex-col items-center">
          VS
          <ArrowRightIcon className="mt-2 text-ups-gold" size={24} />
        </div>

        <div className="text-center">
          <h3 className="font-semibold text-ups-brown-900 mb-4">Consolidated Delivery (Efficient)</h3>
          <svg width="200" height="150" viewBox="0 0 200 150" className="mx-auto">
            <rect x="90" y="10" width="20" height="20" fill="#2C1608" rx="4" />
            {/* Main line to partner */}
            <path d="M100 30 L100 90" stroke="#8B6A4F" strokeWidth="4" />
            {/* Partner Node */}
            <circle cx="100" cy="90" r="10" fill="#FFB500" />
            <text x="100" y="94" fontSize="10" textAnchor="middle" fill="#2C1608" fontWeight="bold">P</text>
            {/* Short local lines */}
            <path d="M100 90 L60 130 M100 90 L85 135 M100 90 L115 135 M100 90 L140 130" stroke="#8B6A4F" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="60" cy="130" r="4" fill="#351C15" />
            <circle cx="85" cy="135" r="4" fill="#351C15" />
            <circle cx="115" cy="135" r="4" fill="#351C15" />
            <circle cx="140" cy="130" r="4" fill="#351C15" />
          </svg>
        </div>
      </div>

      {/* Cluster List */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-ups-brown-800 border-b border-border-warm pb-2">Delivery Clusters</h2>
        
        {mockClusters.map(cluster => {
          const assignedId = assignments[cluster.id];
          const isAssigned = !!assignedId;

          return (
            <div key={cluster.id} className={cn("bg-surface border rounded-md shadow-sm overflow-hidden transition-all duration-300", isAssigned ? "border-ups-gold" : "border-border-warm")}>
              
              {/* Cluster Header */}
              <div className={cn("p-4 flex justify-between items-start border-b transition-colors", isAssigned ? "bg-ups-gold-soft border-ups-gold/30" : "bg-gray-50 border-border-warm")}>
                <div>
                  <h3 className="font-bold text-lg text-ups-brown-900 flex items-center gap-2">
                    <MapPin size={18} className={isAssigned ? "text-ups-gold-dark" : "text-text-muted"} />
                    {cluster.name}
                  </h3>
                  <div className="text-sm text-text-muted mt-1">
                    {cluster.package_count} packages &bull; {cluster.total_weight_kg} kg &bull; Window: {cluster.delivery_window}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-text-muted">Direct Cost</div>
                  <div className={cn("text-lg font-semibold tabular-nums", isAssigned ? "text-gray-400 line-through" : "text-text-main")}>
                    {formatMoney(cluster.direct_cost_usd)}
                  </div>
                </div>
              </div>

              {/* Partners List */}
              <div className="p-4 bg-white">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Available Verified Partners</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  {cluster.partners.map(partner => {
                    const thisPartnerAssigned = assignedId === partner.id;
                    const canTakeAll = partner.capacity_packages >= cluster.package_count;
                    
                    return (
                      <div 
                        key={partner.id} 
                        className={cn(
                          "border rounded-md p-4 flex flex-col relative transition-all",
                          thisPartnerAssigned ? "border-ups-gold bg-ups-gold-soft/30 shadow-md ring-1 ring-ups-gold" : "border-border-warm hover:border-ups-brown-400"
                        )}
                      >
                        {thisPartnerAssigned && (
                          <div className="absolute top-2 right-2 text-ups-gold-dark">
                            <CheckCircle2 size={20} fill="currentColor" className="text-white" />
                          </div>
                        )}
                        
                        <div className="flex items-start gap-3 mb-3">
                          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0", thisPartnerAssigned ? "bg-ups-gold-dark" : "bg-ups-brown-600")}>
                            {partner.initials}
                          </div>
                          <div>
                            <div className="font-semibold text-ups-brown-900 flex items-center gap-1">
                              {partner.name}
                              {partner.verified && (
                                <div title="Verified Partner" className="inline-flex items-center justify-center">
                                  <CheckCircle2 size={12} className="text-blue-500" />
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-text-muted flex items-center gap-2 mt-0.5">
                              <span className="flex items-center"><Star size={10} className="text-ups-gold mr-0.5" fill="currentColor" /> {partner.rating}</span>
                              <span>&bull;</span>
                              <span>{partner.completed_deliveries} drops</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                          <div>
                            <div className="text-xs text-text-muted">Capacity</div>
                            <div className={cn("font-medium", !canTakeAll && "text-risk-medium")}>{partner.capacity_packages} pkgs</div>
                          </div>
                          <div>
                            <div className="text-xs text-text-muted">Fee per pkg</div>
                            <div className="font-medium">{formatMoney(partner.per_package_fee_usd)}</div>
                          </div>
                        </div>

                        {/* Assignment Logic */}
                        <div className="mt-auto pt-3 border-t border-border-warm flex justify-between items-center">
                          {thisPartnerAssigned ? (
                            <>
                              <div className="text-xs font-medium text-ups-brown-800">
                                {!canTakeAll ? (
                                  <span className="text-risk-medium">Split: {partner.capacity_packages} consolidated, {cluster.package_count - partner.capacity_packages} direct</span>
                                ) : (
                                  <span className="text-risk-low">Full consolidation</span>
                                )}
                              </div>
                              <button 
                                onClick={() => handleUnassign(cluster.id)}
                                className="flex items-center gap-1 text-xs font-semibold text-risk-high hover:bg-risk-high/10 px-2 py-1 rounded transition-colors"
                              >
                                <X size={14} /> Unassign
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="text-xs text-text-muted">
                                Est. savings: <span className="font-semibold text-risk-low">{formatPercent(1 - ((Math.min(cluster.package_count, partner.capacity_packages) * partner.per_package_fee_usd) / (cluster.direct_cost_usd * (Math.min(cluster.package_count, partner.capacity_packages)/cluster.package_count))))}</span>
                              </div>
                              <button 
                                onClick={() => handleAssign(cluster.id, partner.id)}
                                disabled={isAssigned && !thisPartnerAssigned} // Disable if another partner is assigned
                                className={cn(
                                  "text-xs font-semibold px-3 py-1.5 rounded transition-colors",
                                  isAssigned 
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                                    : "bg-ups-brown-900 text-white hover:bg-ups-gold hover:text-ups-brown-900"
                                )}
                              >
                                Assign
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Helper for the VS arrow
const ArrowRightIcon = ({ className, size }: { className?: string, size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 12h14"></path>
    <path d="m12 5 7 7-7 7"></path>
  </svg>
);
