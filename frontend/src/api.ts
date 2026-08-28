import axios from "axios";
import type {
  BacktestEvent, Health, Metrics, PredictRequest, PredictResult,
  RefreshResult, ShipmentDetail, ShipmentSummary, Stats,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const client = axios.create({ baseURL: BASE, timeout: 300_000 });

export interface ShipmentFilters {
  band?: string; mode?: string; min_score?: number; limit?: number;
}

export const api = {
  stats: () => client.get<Stats>("/api/stats").then(r => r.data),
  health: () => client.get<Health>("/api/health").then(r => r.data),

  shipments: (f: ShipmentFilters = {}) => {
    const p = new URLSearchParams();
    if (f.band) p.set("band", f.band);
    if (f.mode) p.set("mode", f.mode);
    if (f.min_score != null) p.set("min_score", String(f.min_score));
    p.set("limit", String(f.limit ?? 50));
    return client.get<ShipmentSummary[]>(`/api/shipments?${p}`).then(r => r.data);
  },

  shipment: (id: string) =>
    client.get<ShipmentDetail>(`/api/shipments/${id}`).then(r => r.data),

  refresh: () => client.post<RefreshResult>("/api/refresh").then(r => r.data),

  metrics: () => client.get<Metrics>("/api/model/metrics").then(r => r.data),

  backtests: () => client.get<BacktestEvent[]>("/api/backtest").then(r => r.data),

  locations: () =>
    client.get<{ code: string; name: string }[]>("/api/locations").then(r => r.data),

  predict: (body: PredictRequest) =>
    client.post<PredictResult>("/api/predict", body).then(r => r.data),
};
