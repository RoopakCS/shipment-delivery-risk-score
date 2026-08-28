"""
FastAPI backend for Shipment Delivery Risk Score.

Endpoints match the locked API contract exactly.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import select

from backend.config import ARTIFACTS_DIR, FRONTEND_ORIGIN
from backend.db import ShipmentDB, create_db_and_tables, get_session
from backend.providers.flight import FlightProvider
from backend.providers.news import NewsProvider
from backend.providers.ports import PortsProvider
from backend.providers.traffic import TrafficProvider
from backend.providers.weather import WeatherProvider
from backend.recommend import generate_recommendation
from backend.schemas import (
    BacktestDetail,
    BacktestSummary,
    DriverSchema,
    HealthResponse,
    LocationSchema,
    RecommendationSchema,
    RefreshResponse,
    RiskSchema,
    ShipmentDetail,
    ShipmentSummary,
    SignalDetailSchema,
    SignalsSchema,
    StatsResponse,
)
from backend.scoring import ScoringEngine
from ml.features import FEATURE_NAMES

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Global state ───
scoring_engine = ScoringEngine()
weather_provider = WeatherProvider()
news_provider = NewsProvider()
traffic_provider = TrafficProvider()
flight_provider = FlightProvider()
ports_provider = PortsProvider(news_provider)

ALL_PROVIDERS = [weather_provider, news_provider, traffic_provider,
                  flight_provider, ports_provider]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: load models and create DB on startup."""
    logger.info("Starting Shipment Delivery Risk Score backend...")
    create_db_and_tables()

    if scoring_engine.load_models():
        logger.info("Models loaded successfully")
    else:
        logger.warning("No models loaded - scoring will fail")

    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Shipment Delivery Risk Score",
    description="Predict shipment delay risk using real BTS data + live signals",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helper functions ───
def _shipment_to_summary(s: ShipmentDB) -> dict:
    """Convert DB shipment to summary dict."""
    risk = None
    if s.risk_score is not None:
        risk = {
            "score": s.risk_score,
            "band": s.risk_band or "LOW",
            "breach_probability": s.breach_probability or 0,
            "predicted_delay_hours": s.predicted_delay_hours or 0,
            "confidence": s.confidence or 0,
            "model_used": s.model_used or "",
            "validation_status": s.validation_status or "",
        }

    return {
        "id": s.id,
        "mode": s.mode,
        "status": s.status,
        "carrier": s.carrier,
        "service_level": s.service_level,
        "progress_pct": s.progress_pct,
        "origin": {"name": s.origin_name, "code": s.origin_code,
                    "lat": s.origin_lat, "lon": s.origin_lon},
        "destination": {"name": s.dest_name, "code": s.dest_code,
                        "lat": s.dest_lat, "lon": s.dest_lon},
        "value_usd": s.value_usd,
        "weight_kg": s.weight_kg,
        "risk": risk,
    }


def _shipment_to_detail(s: ShipmentDB) -> dict:
    """Convert DB shipment to full detail dict."""
    base = _shipment_to_summary(s)
    base["departed_at"] = s.departed_at
    base["promised_delivery"] = s.promised_delivery
    base["predicted_delivery"] = s.predicted_delivery

    # Parse JSON fields
    drivers = json.loads(s.drivers_json) if s.drivers_json else []
    signals = json.loads(s.signals_json) if s.signals_json else None
    recommendation = json.loads(s.recommendation_json) if s.recommendation_json else None

    base["drivers"] = drivers
    base["signals"] = signals
    base["recommendation"] = recommendation

    return base


# ─── API Endpoints ───

@app.get("/api/health")
async def health() -> dict:
    """Health check with model and provider status."""
    provider_status = []
    for p in ALL_PROVIDERS:
        try:
            status = await p.health_check()
        except Exception:
            status = {"name": p.name, "is_live": False, "status": "error"}
        provider_status.append(status)

    flight_remaining = flight_provider.calls_remaining

    return {
        "status": "ok",
        "models_loaded": scoring_engine.models_loaded,
        "providers": provider_status,
        "aviationstack_calls_remaining": flight_remaining,
    }


@app.get("/api/stats")
async def stats() -> dict:
    """Dashboard statistics."""
    session = get_session()
    shipments = session.exec(select(ShipmentDB)).all()
    session.close()

    total = len(shipments)
    counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    at_risk_value = 0.0
    total_score = 0.0

    for s in shipments:
        band = s.risk_band or "LOW"
        counts[band] = counts.get(band, 0) + 1
        if band in ("HIGH", "CRITICAL"):
            at_risk_value += s.value_usd
        total_score += (s.risk_score or 0)

    live_ok = all(p.is_live for p in [weather_provider])  # at minimum weather

    return {
        "total_active": total,
        "low": counts.get("LOW", 0),
        "medium": counts.get("MEDIUM", 0),
        "high": counts.get("HIGH", 0),
        "critical": counts.get("CRITICAL", 0),
        "at_risk_value_usd": round(at_risk_value, 2),
        "avg_score": round(total_score / total, 2) if total > 0 else 0,
        "live_signals_ok": live_ok,
    }


@app.get("/api/shipments")
async def list_shipments(
    min_score: Optional[float] = Query(None),
    mode: Optional[str] = Query(None),
    band: Optional[str] = Query(None),
    limit: int = Query(50, le=500),
    sort: str = Query("risk_score_desc"),
) -> list[dict]:
    """List shipments with filtering and sorting. Default sort: risk_score DESC."""
    session = get_session()
    query = select(ShipmentDB)

    shipments = session.exec(query).all()
    session.close()

    # Filter
    if min_score is not None:
        shipments = [s for s in shipments if (s.risk_score or 0) >= min_score]
    if mode:
        shipments = [s for s in shipments if s.mode == mode.upper()]
    if band:
        shipments = [s for s in shipments if s.risk_band == band.upper()]

    # Sort
    if sort == "risk_score_desc" or sort == "risk_score":
        shipments.sort(key=lambda s: s.risk_score or 0, reverse=True)
    elif sort == "risk_score_asc":
        shipments.sort(key=lambda s: s.risk_score or 0)
    elif sort == "value_desc":
        shipments.sort(key=lambda s: s.value_usd or 0, reverse=True)

    # Limit
    shipments = shipments[:limit]

    return [_shipment_to_summary(s) for s in shipments]


@app.get("/api/shipments/{shipment_id}")
async def get_shipment(shipment_id: str) -> dict:
    """Get full shipment detail."""
    session = get_session()
    shipment = session.get(ShipmentDB, shipment_id)
    session.close()

    if not shipment:
        raise HTTPException(status_code=404, detail=f"Shipment {shipment_id} not found")

    return _shipment_to_detail(shipment)


# Signals split into two tiers by cost:
#   Tier 1 (weather) is free and parallel-safe, so we fetch it for every unique
#     location on every route - origin AND destination.
#   Tier 2 (news, traffic, flight, ports) is rate-limited, quota-capped or
#     serial-only, so we spend it on the shipments that actually need
#     attention rather than uniformly across the fleet.
TOP_N_DEEP_SIGNALS = 6
WEATHER_CONCURRENCY = 8
# AviationStack is capped at 60 calls/month, so one refresh must never be able
# to spend a meaningful fraction of it. Responses are cached 6h per airport.
MAX_FLIGHT_CALLS_PER_REFRESH = 4
# Pinned historical scenarios keep their archived weather - see ml/scenarios.py
SCENARIO_PREFIX = "DEMO-"


def _rescore(s: ShipmentDB, features: dict, signals: dict) -> None:
    """Score one shipment from its features and persist the result."""
    risk = scoring_engine.score_shipment(features)
    rec = generate_recommendation(
        risk["score"], risk["band"], risk["breach_probability"],
        risk.get("drivers", []), s.mode)

    s.risk_score = risk["score"]
    s.risk_band = risk["band"]
    s.breach_probability = risk["breach_probability"]
    s.predicted_delay_hours = risk["predicted_delay_hours"]
    s.confidence = risk["confidence"]
    s.model_used = risk["model_used"]
    s.validation_status = risk["validation_status"]
    s.features_json = json.dumps(features, default=str)
    s.drivers_json = json.dumps(risk.get("drivers", []), default=str)
    s.signals_json = json.dumps(signals, default=str)
    s.recommendation_json = json.dumps(rec, default=str)
    s.updated_at = datetime.now().isoformat()


@app.post("/api/refresh")
async def refresh_signals() -> dict:
    """Re-pull live signals and rescore the fleet.

    Two passes: bulk weather for every route location, then the expensive
    signals for the highest-risk shipments only.
    """
    start = time.time()
    session = get_session()
    shipments = session.exec(select(ShipmentDB)).all()
    degraded: set[str] = set()

    # ── Pass 1: weather for every unique location on every route ──
    locations: dict[str, tuple[float, float, str]] = {}
    for s in shipments:
        locations.setdefault(s.origin_code, (s.origin_lat, s.origin_lon, s.origin_name))
        locations.setdefault(s.dest_code, (s.dest_lat, s.dest_lon, s.dest_name))

    sem = asyncio.Semaphore(WEATHER_CONCURRENCY)

    async def _wx(code: str, lat: float, lon: float) -> tuple[str, dict]:
        async with sem:
            return code, await weather_provider.fetch(lat, lon, code)

    results = await asyncio.gather(
        *[_wx(c, v[0], v[1]) for c, v in locations.items()],
        return_exceptions=True,
    )
    weather_by_loc: dict[str, dict] = {}
    for r in results:
        if isinstance(r, BaseException):
            degraded.add("weather")
            continue
        code, sig = r
        weather_by_loc[code] = sig
        if not sig.get("is_live"):
            degraded.add("weather")

    scored = 0
    signals_by_id: dict[str, dict] = {}
    features_by_id: dict[str, dict] = {}

    for s in shipments:
        try:
            features = json.loads(s.features_json) if s.features_json else {}
            if s.id.startswith(SCENARIO_PREFIX):
                # Historical replay: keep its archived weather, rescore only.
                features_by_id[s.id] = features
                signals_by_id[s.id] = json.loads(s.signals_json) if s.signals_json else {}
                scored += 1
                continue
            wx_o = weather_by_loc.get(s.origin_code, {})
            wx_d = weather_by_loc.get(s.dest_code, {})

            sev_o = wx_o.get("severity", features.get("weather_severity_origin", 0))
            sev_d = wx_d.get("severity", features.get("weather_severity_dest", 0))
            features["weather_severity_origin"] = sev_o
            features["weather_severity_dest"] = sev_d
            features["weather_severity_route_max"] = max(sev_o, sev_d)
            features["precip_mm"] = wx_d.get("precip_mm", features.get("precip_mm", 0))
            features["snowfall_cm"] = wx_d.get("snowfall_cm", features.get("snowfall_cm", 0))
            features["wind_kph"] = wx_d.get("wind_kph", features.get("wind_kph", 0))

            signals = {"weather_origin": wx_o, "weather": wx_d}
            features_by_id[s.id] = features
            signals_by_id[s.id] = signals

            _rescore(s, features, signals)
            session.add(s)
            scored += 1
        except Exception as e:
            logger.warning(f"Failed to refresh {s.id}: {e}")

    session.commit()

    # ── Pass 2: expensive signals for the highest-risk shipments only ──
    ranked = sorted(
        [s for s in shipments
         if s.id in features_by_id and not s.id.startswith(SCENARIO_PREFIX)],
        key=lambda x: x.risk_score or 0.0,
        reverse=True,
    )[:TOP_N_DEEP_SIGNALS]
    deepened = 0
    flight_calls = 0

    for s in ranked:
        try:
            features = features_by_id[s.id]
            signals = signals_by_id[s.id]

            news_sig = await news_provider.fetch(
                s.origin_lat, s.origin_lon, s.origin_code,
                location_name=s.origin_name)
            signals["news"] = news_sig
            features["news_risk_score"] = news_sig.get("severity", 0)
            if not news_sig.get("is_live"):
                degraded.add("news")

            traffic_sig = await traffic_provider.fetch(
                s.dest_lat, s.dest_lon, s.dest_code)
            signals["traffic"] = traffic_sig
            features["traffic_congestion_lastmile"] = traffic_sig.get("severity", 0)
            if not traffic_sig.get("is_live"):
                degraded.add("traffic")

            if s.mode == "AIR" and flight_calls < MAX_FLIGHT_CALLS_PER_REFRESH:
                flight_calls += 1
                flight_sig = await flight_provider.fetch(
                    s.origin_lat, s.origin_lon, s.origin_code)
                signals["flight"] = flight_sig
                features["flight_delay_probability"] = flight_sig.get("severity", 0)
                if not flight_sig.get("is_live"):
                    degraded.add("flight")

            if s.mode == "OCEAN":
                port_sig = await ports_provider.fetch(
                    s.dest_lat, s.dest_lon, s.dest_code,
                    location_name=s.dest_name)
                signals["ports"] = port_sig
                features["port_congestion_index"] = port_sig.get("severity", 0)
                if not port_sig.get("is_live"):
                    degraded.add("ports")

            _rescore(s, features, signals)
            session.add(s)
            deepened += 1
        except Exception as e:
            logger.warning(f"Deep signal fetch failed for {s.id}: {e}")

    session.commit()
    session.close()

    return {
        "scored": scored,
        "deep_signals_fetched": deepened,
        "locations_fetched": len(weather_by_loc),
        "duration_ms": int((time.time() - start) * 1000),
        "providers_degraded": sorted(degraded),
    }


@app.get("/api/model/metrics")
async def model_metrics() -> dict:
    """Return training metrics + calibration curves."""
    metrics_path = ARTIFACTS_DIR / "metrics.json"
    if not metrics_path.exists():
        raise HTTPException(status_code=404, detail="Metrics not found. Run train.py first.")

    with open(metrics_path) as f:
        metrics = json.load(f)

    # Add calibration data
    cal_path = ARTIFACTS_DIR / "calibration.json"
    if cal_path.exists():
        with open(cal_path) as f:
            metrics["calibration_curves"] = json.load(f)

    return metrics


@app.get("/api/backtest")
async def list_backtests() -> list[dict]:
    """List backtest events."""
    bt_path = ARTIFACTS_DIR / "backtest.json"
    if not bt_path.exists():
        raise HTTPException(status_code=404, detail="Backtest not found. Run backtest.py first.")

    with open(bt_path) as f:
        events = json.load(f)

    return [
        {
            "id": e["id"],
            "airport": e["airport"],
            "airport_name": e["airport_name"],
            "date": e["date"],
            "prediction": e["prediction"],
            "actual_outcome": e["actual_outcome"],
            "verdict": e["verdict"],
        }
        for e in events
    ]


@app.get("/api/backtest/{event_id}")
async def get_backtest(event_id: str) -> dict:
    """Get detailed backtest event."""
    bt_path = ARTIFACTS_DIR / "backtest.json"
    if not bt_path.exists():
        raise HTTPException(status_code=404, detail="Backtest not found")

    with open(bt_path) as f:
        events = json.load(f)

    for e in events:
        if e["id"] == event_id:
            return e

    raise HTTPException(status_code=404, detail=f"Event {event_id} not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
