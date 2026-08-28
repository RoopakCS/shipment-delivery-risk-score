export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ShipmentSummary {
  id: string;
  mode: 'AIR' | 'OCEAN' | 'GROUND';
  status: string;
  carrier: string;
  service_level: string;
  progress_pct: number;
  origin: { name: string; code: string; lat: number; lon: number };
  destination: { name: string; code: string; lat: number; lon: number };
  value_usd: number;
  weight_kg: number;
  risk: {
    score: number;
    band: RiskBand;
    breach_probability: number;
    predicted_delay_hours: number;
    confidence: number;
    model_used: string;
    validation_status: string;
  };
}

export interface Driver {
  feature: string;
  label: string;
  value: number;
  contribution: number;
  direction: 'increases' | 'decreases';
  explanation: string;
}

export interface Signal {
  is_live: boolean;
  source: string;
  detail: string;
  [key: string]: any;
}

export interface ShipmentDetail extends ShipmentSummary {
  departed_at?: string;
  promised_delivery?: string;
  predicted_delivery?: string;
  drivers: Driver[];
  signals: {
    weather?: Signal;
    weather_origin?: Signal;
    news?: Signal;
    traffic?: Signal;
    flight?: Signal;
    ports?: Signal;
  } | null;
  recommendation?: {
    action: string;
    urgency: string;
    headline: string;
    detail: string;
    generated_by: string;
  };
}

export interface StatsResponse {
  total_active: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
  at_risk_value_usd: number;
  avg_score: number;
  live_signals_ok: boolean;
}

export interface HealthResponse {
  status: string;
  models_loaded: boolean;
  providers: {
    name: string;
    is_live: boolean;
    status?: string;
    api_key_set?: boolean;
    calls_this_month?: number;
    calls_remaining?: number;
    hard_cap?: number;
  }[];
  aviationstack_calls_remaining?: number;
}

export interface RefreshResponse {
  scored: number;
  deep_signals_fetched: number;
  locations_fetched: number;
  duration_ms: number;
  providers_degraded: string[];
}

export interface BacktestEvent {
  id: string;
  airport: string;
  airport_name: string;
  date: string;
  lat: number;
  lon: number;
  prediction: {
    risk_score: number;
    band: RiskBand;
    breach_probability: number;
    predicted_delay_hours: number;
    drivers: Driver[];
  };
  inputs_before_event: Record<string, any>;
  actual_outcome: Record<string, any>;
  verdict: 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'TRUE_NEGATIVE' | 'FALSE_NEGATIVE';
}

export interface ModelMetrics {
  validation_status: string;
  calibration_curves: Record<string, any>;
  [key: string]: any; // air_roc_auc, surface_roc_auc, etc.
}
