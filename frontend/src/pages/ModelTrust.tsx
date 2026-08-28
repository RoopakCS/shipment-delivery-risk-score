import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { ModelMetrics } from '../types';
import { StatCard } from '../components/shared/StatCard';
import { formatNumber } from '../utils/formatters';
import { Activity, ShieldAlert, AlertCircle, Database, CheckCircle2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

export const ModelTrust: React.FC = () => {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getModelMetrics()
      .then(setMetrics)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-text-muted flex items-center gap-2 p-8"><Activity className="animate-spin" /> Loading model metrics...</div>;
  }

  if (error || !metrics) {
    return <div className="text-risk-critical bg-risk-critical/10 p-4 rounded-md">Error loading model metrics: {error}</div>;
  }

  // Format calibration curve data
  const calData = (metrics.calibration_curves?.air?.prob_pred || []).map((pred: number, i: number) => ({
    predicted: pred,
    actual: metrics.calibration_curves?.air?.prob_true[i] || 0,
    ideal: pred
  }));

  // Format SHAP importance data
  const shapData = Object.entries(metrics.air_shap_importance || {})
    .map(([feature, importance]) => ({
      feature,
      importance: importance as number
    }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10);

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-ups-brown-800 flex items-center gap-2 mb-2">
          <ShieldAlert size={24} className="text-ups-gold" />
          Model Trust & Transparency
        </h1>
        <p className="text-text-muted max-w-3xl">
          We don't hide our math. Here are the precise performance metrics, calibration curves, and feature importance weightings for the live models currently scoring shipments.
        </p>
      </div>

      {/* Provenance Panel */}
      <div className="bg-ups-brown-50 border border-ups-brown-200 rounded-md p-6">
        <h3 className="text-sm font-bold text-ups-brown-800 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Database size={18} /> Data Provenance Statement
        </h3>
        <div className="grid grid-cols-3 gap-6 text-sm">
          <div className="bg-white p-4 rounded border border-ups-brown-100">
            <h4 className="font-bold text-ups-brown-900 mb-2">Weather & News</h4>
            <p className="text-text-muted">Real recorded Open-Meteo archive data and GDELT global news disruptions. 100% historically accurate.</p>
          </div>
          <div className="bg-white p-4 rounded border border-ups-brown-100">
            <h4 className="font-bold text-ups-brown-900 mb-2">Flight Records</h4>
            <p className="text-text-muted">Simulated based on historical statistical baselines. Real BTS flight data API connection was blocked during training.</p>
          </div>
          <div className="bg-white p-4 rounded border border-ups-brown-100">
            <h4 className="font-bold text-ups-brown-900 mb-2">Live Signals</h4>
            <p className="text-text-muted">Fetched dynamically at runtime via live API connections (AviationStack, TomTom, Open-Meteo).</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Calibration Curve */}
        <div className="bg-surface border border-border-warm rounded-md p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ups-brown-800 mb-2">Model Calibration (Air)</h2>
          <p className="text-sm text-text-muted mb-6 font-medium bg-gray-50 p-2 rounded border border-gray-100">
            <AlertCircle size={14} className="inline mr-1 text-ups-gold-dark" /> 
            Of the shipments we scored 7 (70%), about 70% actually breached.
          </p>
          
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calData} margin={{ top: 5, right: 5, bottom: 20, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="predicted" type="number" domain={[0, 1]} tickCount={5} tickFormatter={v => formatNumber(v, 2)} />
                <YAxis domain={[0, 1]} tickCount={5} tickFormatter={v => formatNumber(v, 2)} />
                <RechartsTooltip formatter={(value: any) => formatNumber(value as number, 3)} />
                <Line type="monotone" dataKey="ideal" stroke="#A3A3A3" strokeDasharray="5 5" strokeWidth={2} dot={false} name="Perfect Calibration" />
                <Line type="monotone" dataKey="actual" stroke="#351C15" strokeWidth={3} dot={{ r: 4, fill: '#351C15' }} name="Actual Observed" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Feature Importance */}
        <div className="bg-surface border border-border-warm rounded-md p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ups-brown-800 mb-2">Global Feature Importance</h2>
          <p className="text-sm text-text-muted mb-6">Which factors matter most across all shipments (SHAP).</p>
          
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shapData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="feature" type="category" width={100} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <RechartsTooltip formatter={(value: any) => formatNumber(value as number, 3)} />
                <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                  {shapData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--color-ups-gold)' : 'var(--color-ups-brown-600)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard 
          label="ROC-AUC (Air)" 
          value={formatNumber(metrics.air_roc_auc, 3)} 
          subValue={`vs Baseline: ${formatNumber(metrics.air_baseline_roc_auc, 3)}`}
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard 
          label="Brier Score" 
          value={formatNumber(metrics.air_brier, 3)} 
          subValue="Lower is better"
        />
        <StatCard 
          label="MAE (Delay Regressor)" 
          value={formatNumber(metrics.air_reg_mae, 2)} 
          subValue="Hours absolute error"
        />
        <StatCard 
          label="Precision" 
          value={formatNumber(metrics.air_precision, 3)} 
          subValue={`Recall: ${formatNumber(metrics.air_recall, 3)}`}
        />
      </div>
    </div>
  );
};
