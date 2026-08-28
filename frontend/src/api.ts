import type {
  StatsResponse,
  ShipmentSummary,
  ShipmentDetail,
  HealthResponse,
  RefreshResponse,
  BacktestEvent,
  ModelMetrics
} from './types';

const API_BASE = 'http://localhost:8000/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function fetcher(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  if (!res.ok) {
    throw new ApiError(res.status, `API Error: ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  getStats: () => fetcher('/stats') as Promise<StatsResponse>,
  
  getShipments: (params?: { limit?: number; min_score?: number; mode?: string; band?: string; sort?: string }) => {
    const url = new URL(`${API_BASE}/shipments`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return fetch(url.toString()).then(res => {
      if (!res.ok) throw new ApiError(res.status, res.statusText);
      return res.json() as Promise<ShipmentSummary[]>;
    });
  },

  getShipmentDetail: (id: string) => fetcher(`/shipments/${id}`) as Promise<ShipmentDetail>,

  refreshSignals: () => fetcher('/refresh', { method: 'POST' }) as Promise<RefreshResponse>,

  getHealth: () => fetcher('/health') as Promise<HealthResponse>,

  getModelMetrics: () => fetcher('/model/metrics') as Promise<ModelMetrics>,

  getBacktestEvents: () => fetcher('/backtest') as Promise<BacktestEvent[]>,

  getBacktestEvent: (id: string) => fetcher(`/backtest/${id}`) as Promise<BacktestEvent>
};
