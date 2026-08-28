import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { StatsResponse, HealthResponse, ShipmentSummary, RiskBand } from '../types';
import { StatCard } from '../components/shared/StatCard';
import { BandPill, cn } from '../components/shared/BandPill';
import { RiskScore } from '../components/shared/RiskScore';
import { formatMoney, formatNumber } from '../utils/formatters';
import { Activity, AlertTriangle, ArrowRight, Plane, Ship, Truck, Search, Loader2 } from 'lucide-react';

export const RiskQueue: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [shipments, setShipments] = useState<ShipmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDuration, setRefreshDuration] = useState(0);

  const [filters, setFilters] = useState({
    mode: '',
    band: '',
    search: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, h, sh] = await Promise.all([
        api.getStats(),
        api.getHealth(),
        api.getShipments({ limit: 50, mode: filters.mode, band: filters.band })
      ]);
      setStats(s);
      setHealth(h);
      
      let filteredShipments = sh;
      if (filters.search) {
        filteredShipments = sh.filter(s => s.id.toLowerCase().includes(filters.search.toLowerCase()));
      }
      setShipments(filteredShipments);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters.mode, filters.band, filters.search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshDuration(0);
    
    const interval = setInterval(() => {
      setRefreshDuration(prev => prev + 1);
    }, 1000);

    try {
      await api.refreshSignals();
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      clearInterval(interval);
      setRefreshing(false);
    }
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'AIR': return <Plane size={16} className="text-gray-500" />;
      case 'OCEAN': return <Ship size={16} className="text-gray-500" />;
      case 'GROUND': return <Truck size={16} className="text-gray-500" />;
      default: return null;
    }
  };

  const getRiskBorder = (band: RiskBand) => {
    switch (band) {
      case 'LOW': return 'border-l-risk-low';
      case 'MEDIUM': return 'border-l-risk-medium';
      case 'HIGH': return 'border-l-risk-high';
      case 'CRITICAL': return 'border-l-risk-critical';
      default: return 'border-l-transparent';
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      {stats && health && (
        <div>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-2xl font-bold text-ups-brown-800">
              {formatNumber(stats.total_active, 0)} shipments. {stats.high + stats.critical} need you today.
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-text-muted bg-white px-3 py-1.5 rounded-full border border-border-warm shadow-sm">
                <div className={cn("w-2 h-2 rounded-full animate-pulse", stats.live_signals_ok ? "bg-green-500" : "bg-yellow-500")} />
                Live Signals: {stats.live_signals_ok ? 'OK' : 'Degraded'}
              </div>
              <div className="flex items-center gap-2 text-sm text-text-muted bg-white px-3 py-1.5 rounded-full border border-border-warm shadow-sm">
                AviationStack: {health.aviationstack_calls_remaining}/{health.providers.find(p => p.name === 'flight')?.hard_cap || 60}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            <StatCard 
              label="Active Shipments" 
              value={formatNumber(stats.total_active, 0)} 
              icon={<Activity size={20} />} 
            />
            <StatCard 
              label="Value at Risk (High/Crit)" 
              value={formatMoney(stats.at_risk_value_usd)} 
              valueClassName="text-risk-high"
            />
            <StatCard 
              label="Average Risk Score" 
              value={formatNumber(stats.avg_score, 2)} 
            />
            <StatCard 
              label="Critical Band" 
              value={stats.critical}
              valueClassName="text-risk-critical"
              icon={<AlertTriangle size={20} className="text-risk-critical" />} 
            />
          </div>
        </div>
      )}

      {/* Main Table Area */}
      <div className="bg-surface border border-border-warm rounded-md shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-border-warm bg-gray-50 flex justify-between items-center">
          <div className="flex gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search ID..." 
                className="pl-9 pr-4 py-2 border border-border-warm rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ups-gold"
                value={filters.search}
                onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <select 
              className="px-4 py-2 border border-border-warm rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ups-gold"
              value={filters.mode}
              onChange={e => setFilters(prev => ({ ...prev, mode: e.target.value }))}
            >
              <option value="">All Modes</option>
              <option value="AIR">Air</option>
              <option value="GROUND">Ground</option>
              <option value="OCEAN">Ocean</option>
            </select>
            <select 
              className="px-4 py-2 border border-border-warm rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ups-gold"
              value={filters.band}
              onChange={e => setFilters(prev => ({ ...prev, band: e.target.value }))}
            >
              <option value="">All Risk Bands</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          
          <button 
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-ups-gold hover:bg-ups-gold-dark text-ups-brown-900 font-semibold px-4 py-2 rounded-md transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {refreshing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Refreshing ({refreshDuration}s)
              </>
            ) : (
              'Refresh live signals'
            )}
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {refreshing && (
            <div className="bg-ups-gold-soft p-3 text-sm text-ups-brown-900 flex justify-center items-center border-b border-ups-gold/30">
              <Loader2 size={16} className="animate-spin mr-2" />
              Re-pulling live weather, news, traffic, and flight data... This may take up to 2 minutes.
            </div>
          )}
          
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50/50 text-text-muted border-b border-border-warm">
              <tr>
                <th className="font-medium p-4 pl-6">Score</th>
                <th className="font-medium p-4">Shipment ID</th>
                <th className="font-medium p-4">Mode</th>
                <th className="font-medium p-4">Route</th>
                <th className="font-medium p-4">Carrier</th>
                <th className="font-medium p-4 text-right">Pred. Delay</th>
                <th className="font-medium p-4 text-right">Value</th>
                <th className="font-medium p-4 w-48">Progress</th>
                <th className="font-medium p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-warm">
              {loading && !refreshing ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-text-muted">Loading shipments...</td>
                </tr>
              ) : shipments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-text-muted">No shipments found.</td>
                </tr>
              ) : (
                shipments.map(s => (
                  <tr 
                    key={s.id} 
                    className={cn(
                      "hover:bg-gray-50 transition-colors border-l-4 cursor-pointer", 
                      getRiskBorder(s.risk.band)
                    )}
                    onClick={() => navigate(`/shipments/${s.id}`)}
                  >
                    <td className="p-4 pl-5">
                      <div className="flex flex-col gap-1 items-start">
                        <RiskScore score={s.risk.score} band={s.risk.band} size="lg" />
                        <BandPill band={s.risk.band} />
                      </div>
                    </td>
                    <td className="p-4 font-medium text-ups-brown-900">{s.id}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getModeIcon(s.mode)}
                        <span>{s.mode}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span title={s.origin.name}>{s.origin.code}</span>
                        <ArrowRight size={14} className="text-gray-400" />
                        <span title={s.destination.name}>{s.destination.code}</span>
                      </div>
                    </td>
                    <td className="p-4 text-text-muted">{s.carrier}</td>
                    <td className="p-4 text-right">
                      <span className={s.risk.predicted_delay_hours > 0 ? 'text-risk-high font-medium' : ''}>
                        {s.risk.predicted_delay_hours > 0 
                          ? `+${formatNumber(s.risk.predicted_delay_hours)}h` 
                          : 'On time'}
                      </span>
                    </td>
                    <td className="p-4 text-right">{formatMoney(s.value_usd)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-ups-brown-600 h-1.5 rounded-full" 
                            style={{ width: `${s.progress_pct}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-text-muted w-8">{formatNumber(s.progress_pct, 0)}%</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <ArrowRight size={16} className="text-gray-400" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
