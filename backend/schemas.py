"""
Pydantic v2 schemas for API request/response models.
Matches the exact API contract from the spec.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


# ─── Nested schemas ───
class LocationSchema(BaseModel):
    name: str
    code: str
    lat: float
    lon: float


class DriverSchema(BaseModel):
    feature: str
    label: str
    value: float
    contribution: float
    direction: str
    explanation: str


class RiskSchema(BaseModel):
    score: float
    band: str
    breach_probability: float
    predicted_delay_hours: float
    confidence: float
    model_used: str
    validation_status: str


class SignalDetailSchema(BaseModel):
    severity: float
    is_live: bool
    detail: str
    source: str
    articles: list[dict] | None = None


class SignalsSchema(BaseModel):
    weather: SignalDetailSchema | None = None
    news: SignalDetailSchema | None = None
    traffic: SignalDetailSchema | None = None
    flight: SignalDetailSchema | None = None
    ports: SignalDetailSchema | None = None


class RecommendationSchema(BaseModel):
    action: str
    urgency: str
    headline: str
    detail: str
    generated_by: str


# ─── Main schemas ───
class ShipmentSummary(BaseModel):
    id: str
    mode: str
    status: str
    carrier: str
    service_level: str
    progress_pct: float
    origin: LocationSchema
    destination: LocationSchema
    value_usd: float
    weight_kg: float
    risk: RiskSchema | None = None


class ShipmentDetail(BaseModel):
    id: str
    mode: str
    status: str
    carrier: str
    service_level: str
    progress_pct: float
    origin: LocationSchema
    destination: LocationSchema
    departed_at: str | None = None
    promised_delivery: str | None = None
    predicted_delivery: str | None = None
    value_usd: float
    weight_kg: float
    risk: RiskSchema | None = None
    drivers: list[DriverSchema] = []
    signals: SignalsSchema | None = None
    recommendation: RecommendationSchema | None = None


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    providers: list[dict]
    aviationstack_calls_remaining: int


class StatsResponse(BaseModel):
    total_active: int
    low: int
    medium: int
    high: int
    critical: int
    at_risk_value_usd: float
    avg_score: float
    live_signals_ok: bool


class RefreshResponse(BaseModel):
    scored: int
    duration_ms: int
    providers_degraded: list[str]


class BacktestSummary(BaseModel):
    id: str
    airport: str
    airport_name: str
    date: str
    prediction: dict
    actual_outcome: dict
    verdict: str


class BacktestDetail(BaseModel):
    id: str
    airport: str
    airport_name: str
    date: str
    lat: float
    lon: float
    prediction: dict
    inputs_before_event: dict
    actual_outcome: dict
    verdict: str
