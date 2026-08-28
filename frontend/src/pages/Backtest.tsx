import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { BacktestEvent } from '../types';
import { RiskScore } from '../components/shared/RiskScore';
import { BandPill, cn } from '../components/shared/BandPill';
import { formatNumber, formatPercent } from '../utils/formatters';
import { Activity, Target, ShieldCheck, ShieldAlert, FileSearch } from 'lucide-react';

export const Backtest: React.FC = () => {
  const [events, setEvents] = useState<BacktestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getBacktestEvents()
      .then(setEvents)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-text-muted flex items-center gap-2 p-8"><Activity className="animate-spin" /> Loading backtest events...</div>;
  }

  if (error) {
    return <div className="text-risk-critical bg-risk-critical/10 p-4 rounded-md">Error loading backtest data: {error}</div>;
  }

  const getVerdictBadge = (verdict: string) => {
    const isTrue = verdict.startsWith('TRUE_');
    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border",
        isTrue ? "bg-risk-low/10 text-risk-low border-risk-low/20" : "bg-risk-high/10 text-risk-high border-risk-high/20"
      )}>
        {isTrue ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
        {verdict.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-ups-brown-800 flex items-center gap-2 mb-2">
          <Target size={24} className="text-ups-gold" />
          Backtest: "We called it"
        </h1>
        <p className="text-text-muted max-w-3xl">
          This screen proves the model's credibility. It shows historical disruptions that actually happened, comparing what the model predicted beforehand versus the reality of the disruption.
        </p>
      </div>

      <div className="space-y-6">
        {events.map((event) => (
          <div key={event.id} className="bg-surface border border-border-warm rounded-md shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gray-50 border-b border-border-warm p-4 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-ups-brown-900 text-lg flex items-center gap-2">
                  Event: {event.id} <span className="text-text-muted font-normal text-sm">|</span> {event.airport_name} ({event.airport})
                </h3>
                <div className="text-sm text-text-muted mt-1 font-mono">{event.date}</div>
              </div>
              <div>
                {getVerdictBadge(event.verdict)}
              </div>
            </div>

            {/* Split Content */}
            <div className="flex divide-x divide-border-warm relative">
              {/* VS Marker */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-ups-gold text-ups-brown-900 font-bold w-8 h-8 rounded-full flex items-center justify-center border-4 border-surface shadow-sm z-10 text-xs">
                VS
              </div>

              {/* LEFT: Prediction */}
              <div className="flex-1 p-6 bg-surface">
                <h4 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-4 flex items-center gap-2">
                  <FileSearch size={16} /> What we predicted
                </h4>
                
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="text-xs text-text-muted mb-1">Risk Score</div>
                    <div className="flex items-end gap-2">
                      <RiskScore score={event.prediction.risk_score} band={event.prediction.band} size="lg" />
                      <BandPill band={event.prediction.band} className="mb-1" />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-text-muted mb-1">Breach Prob.</div>
                    <div className="text-xl font-semibold tabular-nums text-text-main">
                      {formatPercent(event.prediction.breach_probability)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-text-muted mb-1">Pred. Delay</div>
                    <div className="text-xl font-semibold tabular-nums text-risk-high">
                      +{formatNumber(event.prediction.predicted_delay_hours)}h
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-ups-brown-600 mb-2 border-b border-border-warm pb-1">Primary Drivers</div>
                  {event.prediction.drivers.slice(0, 3).map((d, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="text-text-muted truncate pr-4">{d.explanation}</span>
                      <span className={cn("font-medium tabular-nums", d.direction === 'increases' ? 'text-risk-high' : 'text-risk-low')}>
                        {d.direction === 'increases' ? '+' : ''}{formatNumber(d.contribution, 2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT: Actual */}
              <div className="flex-1 p-6 bg-surface-alt/30">
                <h4 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-4 flex items-center gap-2">
                  <Activity size={16} /> What actually happened
                </h4>

                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <div className="text-xs text-text-muted mb-1">Flights Affected</div>
                    <div className="text-xl font-semibold tabular-nums text-text-main">
                      {formatNumber(event.actual_outcome.delayed_flights || 0, 0)} <span className="text-sm font-normal text-text-muted">/ {formatNumber(event.actual_outcome.total_flights || 0, 0)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted mb-1">Delay Rate</div>
                    <div className="text-xl font-semibold tabular-nums text-risk-high">
                      {formatPercent(event.actual_outcome.delay_rate || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted mb-1">Mean Delay (Minutes)</div>
                    <div className="text-xl font-semibold tabular-nums text-risk-high">
                      {formatNumber(event.actual_outcome.mean_delay_minutes || 0)} min
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <div className="text-xs font-semibold text-ups-brown-600 mb-2 border-b border-border-warm pb-1">Conditions</div>
                  {Object.entries(event.inputs_before_event).slice(0, 3).map(([k, v], idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="text-text-muted capitalize">{k.replace(/_/g, ' ')}</span>
                      <span className="font-medium">{typeof v === 'number' ? formatNumber(v, 2) : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
