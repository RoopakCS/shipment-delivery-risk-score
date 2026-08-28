export type Band = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Mode = "AIR" | "OCEAN" | "GROUND";

export interface Location { name: string; code: string; lat: number; lon: number }

export interface Risk {
  score: number; band: Band; breach_probability: number;
  predicted_delay_hours: number; confidence: number;
  model_used: string; validation_status: string;
}

export interface Driver {
  feature: string; label: string; value: number; contribution: number;
  direction: "increases" | "decreases"; explanation: string;
}

export interface Signal {
  severity?: number; is_live?: boolean; source?: string; detail?: string;
  articles?: { title: string; url: string; source: string }[];
}

export interface Recommendation {
  action: string; urgency: string; headline: string;
  detail: string; generated_by: string;
}

export interface ShipmentSummary {
  id: string; mode: Mode; status: string; carrier: string;
  service_level: string; progress_pct: number;
  origin: Location; destination: Location;
  value_usd: number; weight_kg: number; risk: Risk | null;
}

export interface ShipmentDetail extends ShipmentSummary {
  departed_at: string; promised_delivery: string; predicted_delivery: string;
  drivers: Driver[];
  signals: Record<string, Signal> | null;
  recommendation: Recommendation | null;
}

export interface Stats {
  total_active: number; low: number; medium: number; high: number;
  critical: number; at_risk_value_usd: number; avg_score: number;
  live_signals_ok: boolean;
}

export interface ProviderHealth {
  name: string; is_live: boolean; status?: string;
  calls_remaining?: number; hard_cap?: number; calls_this_month?: number;
}

export interface Health {
  status: string; models_loaded: boolean;
  providers: ProviderHealth[]; aviationstack_calls_remaining: number | null;
}

export interface RefreshResult {
  scored: number; deep_signals_fetched: number; locations_fetched: number;
  duration_ms: number; providers_degraded: string[];
}

export interface WhatIf {
  action: string; label: string; new_score: number; new_band: Band;
  new_breach_probability: number; delta: number; helps: boolean;
}

export interface PredictResult {
  verdict: "ON_TIME" | "AT_RISK"; verdict_detail: string;
  risk: Risk; drivers: Driver[]; recommendation: Recommendation;
  what_if: WhatIf[]; signals: Record<string, Signal>;
  inputs: Record<string, string | number>;
}

export interface PredictRequest {
  mode: Mode; origin_code: string; dest_code: string; service_level: string;
  planned_transit_hours: number; buffer_hours: number; value_usd: number;
  weight_kg: number; carrier_reliability: number;
  scheduled_dep_hour: number; handoff_count: number;
}

export interface BacktestEvent {
  id: string; airport: string; airport_name: string; date: string;
  lat: number; lon: number;
  prediction: { risk_score: number; band: Band; breach_probability: number;
                predicted_delay_hours: number; drivers: Driver[] };
  inputs_before_event: Record<string, number>;
  actual_outcome: { total_flights: number; delayed_flights: number;
                    delay_rate: number; mean_delay_minutes: number;
                    max_delay_minutes?: number };
  verdict: string;
}

export interface Metrics { [k: string]: any }
