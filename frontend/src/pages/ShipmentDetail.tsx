import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import type { ShipmentDetail as IShipmentDetail, RiskBand } from '../types';
import { RiskScore } from '../components/shared/RiskScore';
import { BandPill, cn } from '../components/shared/BandPill';
import { formatNumber, formatPercent, formatDate } from '../utils/formatters';
import { ArrowLeft, MapPin, AlertCircle, Cpu, Wifi, Activity, Truck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

export const ShipmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [shipment, setShipment] = useState<IShipmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getShipmentDetail(id)
      .then(setShipment)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-text-muted flex items-center gap-2"><Activity className="animate-spin" /> Loading shipment details...</div>;
  }

  if (error || !shipment) {
    return <div className="text-risk-critical bg-risk-critical/10 p-4 rounded-md">Error loading shipment: {error}</div>;
  }

  const getRiskBorder = (band: RiskBand) => {
    switch (band) {
      case 'LOW': return 'border-t-risk-low';
      case 'MEDIUM': return 'border-t-risk-medium';
      case 'HIGH': return 'border-t-risk-high';
      case 'CRITICAL': return 'border-t-risk-critical';
      default: return 'border-t-transparent';
    }
  };



  const chartData = shipment.drivers.map(d => ({
    name: d.label,
    contribution: d.contribution,
    color: d.direction === 'increases' ? '#D6461F' : '#1B7F5A', // Risk-high (red) for increasing risk, Risk-low (green) for decreasing
    explanation: d.explanation
  })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const signals = shipment.signals ? Object.entries(shipment.signals) : [];

  return (
    <div className="space-y-6 max-w-5xl">
      <Link to="/" className="inline-flex items-center text-sm font-medium text-text-muted hover:text-ups-brown-800 transition-colors">
        <ArrowLeft size={16} className="mr-1" /> Back to Queue
      </Link>

      {/* Hero Card */}
      <div className={cn("bg-surface border border-border-warm rounded-md shadow-sm overflow-hidden border-t-4", getRiskBorder(shipment.risk.band))}>
        <div className="bg-ups-brown-800 p-4 flex justify-between items-center text-white">
          <h1 className="text-xl font-semibold tracking-wide flex items-center gap-3">
            Shipment {shipment.id}
            <span className="text-xs font-normal px-2 py-0.5 bg-ups-brown-600 rounded text-gray-200">
              {shipment.mode} &bull; {shipment.service_level}
            </span>
          </h1>
          <div className="text-sm text-gray-300">Carrier: <span className="font-medium text-white">{shipment.carrier}</span></div>
        </div>
        
        <div className="p-6 grid grid-cols-4 gap-8 divide-x divide-border-warm">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-muted">Risk Score</span>
            <div className="flex items-end gap-3">
              <RiskScore score={shipment.risk.score} band={shipment.risk.band} size="xl" />
              <BandPill band={shipment.risk.band} className="mb-1" />
            </div>
          </div>
          <div className="flex flex-col gap-1 pl-8">
            <span className="text-sm font-medium text-text-muted">Breach Probability</span>
            <span className="text-2xl font-semibold tabular-nums text-text-main">{formatPercent(shipment.risk.breach_probability)}</span>
          </div>
          <div className="flex flex-col gap-1 pl-8">
            <span className="text-sm font-medium text-text-muted">Predicted Delay</span>
            <span className={cn("text-2xl font-semibold tabular-nums", shipment.risk.predicted_delay_hours > 0 ? "text-risk-high" : "text-text-main")}>
              {shipment.risk.predicted_delay_hours > 0 ? `+${formatNumber(shipment.risk.predicted_delay_hours)}h` : 'On time'}
            </span>
          </div>
          <div className="flex flex-col gap-1 pl-8">
            <span className="text-sm font-medium text-text-muted">Model Confidence</span>
            <div className="flex items-center gap-2" title={`Model: ${shipment.risk.model_used}`}>
              <span className="text-2xl font-semibold tabular-nums text-text-main">{formatPercent(shipment.risk.confidence, 0)}</span>
              <Cpu size={20} className="text-ups-brown-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Route Strip */}
      <div className="bg-surface border border-border-warm rounded-md p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ups-brown-800 mb-6 flex items-center gap-2">
          <MapPin size={20} className="text-ups-brown-400" />
          Route & Timeline
        </h2>
        
        <div className="relative pt-4 pb-2">
          {/* Progress Bar Background */}
          <div className="absolute top-1/2 left-0 w-full h-2 bg-gray-100 rounded-full -translate-y-1/2"></div>
          {/* Active Progress */}
          <div className="absolute top-1/2 left-0 h-2 bg-ups-brown-600 rounded-full -translate-y-1/2 transition-all duration-500" style={{ width: `${shipment.progress_pct}%` }}></div>
          
          <div className="flex justify-between relative z-10">
            <div className="flex flex-col items-start bg-surface pr-4">
              <div className="w-4 h-4 bg-ups-brown-800 border-4 border-white rounded-full shadow-sm mb-2"></div>
              <span className="font-bold text-ups-brown-900">{shipment.origin.code}</span>
              <span className="text-xs text-text-muted w-32 truncate" title={shipment.origin.name}>{shipment.origin.name}</span>
              <span className="text-xs text-text-muted mt-1 font-mono">{formatDate(shipment.departed_at)}</span>
            </div>
            
            <div className="flex flex-col items-center bg-surface px-2">
              <div className="text-xs font-bold text-ups-brown-600 mb-1">{formatNumber(shipment.progress_pct, 0)}%</div>
              <Truck size={20} className="text-ups-brown-600 mb-2" />
            </div>

            <div className="flex flex-col items-end bg-surface pl-4">
              <div className={cn("w-4 h-4 border-4 border-white rounded-full shadow-sm mb-2", shipment.risk.predicted_delay_hours > 0 ? "bg-risk-high" : "bg-gray-300")}></div>
              <span className="font-bold text-ups-brown-900">{shipment.destination.code}</span>
              <span className="text-xs text-text-muted text-right w-32 truncate" title={shipment.destination.name}>{shipment.destination.name}</span>
              <div className="flex flex-col items-end mt-1 text-xs">
                <span className="text-text-muted font-mono" title="Promised">P: {formatDate(shipment.promised_delivery)}</span>
                <span className={cn("font-mono font-medium", shipment.risk.predicted_delay_hours > 0 ? "text-risk-high" : "text-risk-low")} title="Predicted">
                  E: {formatDate(shipment.predicted_delivery)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Drivers Chart */}
        <div className="col-span-2 bg-surface border border-border-warm rounded-md p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ups-brown-800 mb-2">Why this score?</h2>
          <p className="text-sm text-text-muted mb-6">Top factors driving the risk calculation for this specific shipment.</p>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                <Tooltip 
                  formatter={(value: any) => [formatNumber(value as number, 2), 'Impact']}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-ups-brown-900 text-white p-3 rounded shadow-lg text-sm max-w-xs">
                          <p className="font-semibold mb-1">{data.name}</p>
                          <p className="text-gray-300">{data.explanation}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine x={0} stroke="#E3DED8" />
                <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-1 flex flex-col gap-6">
          {/* Recommendation */}
          {shipment.recommendation && (
            <div className="bg-ups-gold-soft border-l-4 border-ups-gold rounded-r-md p-5 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-ups-brown-900 bg-ups-gold/20 px-2 py-1 rounded">
                  {shipment.recommendation.action}
                </span>
                <span className="text-xs font-semibold text-risk-high">{shipment.recommendation.urgency}</span>
              </div>
              <h3 className="font-semibold text-ups-brown-900 mb-2">{shipment.recommendation.headline}</h3>
              <p className="text-sm text-ups-brown-800 mb-4">{shipment.recommendation.detail}</p>
              <div className="text-xs text-ups-brown-600/70 border-t border-ups-brown-400/20 pt-2 flex items-center gap-1">
                <Cpu size={12} /> generated by: {shipment.recommendation.generated_by}
              </div>
            </div>
          )}

          {/* Live Signals */}
          <div className="bg-surface border border-border-warm rounded-md p-5 shadow-sm flex-1">
            <h2 className="text-sm font-semibold text-ups-brown-800 mb-4 flex items-center gap-2">
              <Wifi size={16} /> Live Data Signals
            </h2>
            
            {signals.length === 0 ? (
              <div className="text-sm text-text-muted italic flex items-center gap-2 p-4 bg-gray-50 rounded">
                <AlertCircle size={16} /> No live signal data available.
              </div>
            ) : (
              <div className="space-y-3">
                {signals.map(([key, signal]) => (
                  <div key={key} className="border border-border-warm rounded p-3 text-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium capitalize text-text-main">{key.replace('_', ' ')}</span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded font-semibold",
                        signal.is_live ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                      )}>
                        {signal.is_live ? 'LIVE' : 'SIMULATED'}
                      </span>
                    </div>
                    <p className="text-text-muted text-xs mb-2">{signal.detail}</p>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">SRC: {signal.source}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
