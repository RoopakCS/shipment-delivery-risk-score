"""
FastAPI backend for Shipment Delivery Risk Score.

Endpoints match the locked API contract exactly.
"""
from __future__ import annotations

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


@app.post("/api/refresh")
async def refresh_signals() -> dict:
    """Re-pull live signals and rescore all shipments."""
    start = time.time()
    session = get_session()
    shipments = session.exec(select(ShipmentDB)).all()

    scored = 0
    degraded = set()

    for s in shipments:
        try:
            # Fetch live signals (DON'T call flight API in a loop!)
            weather_sig = await weather_provider.fetch(
                s.dest_lat, s.dest_lon, s.dest_code)
            news_sig = await news_provider.fetch(
                s.origin_lat, s.origin_lon, s.origin_code,
                location_name=s.origin_name)

            if not weather_sig.get("is_live"):
                degraded.add("weather")
            if not news_sig.get("is_live"):
                degraded.add("news")

            # Update features with live signals
            features = json.loads(s.features_json) if s.features_json else {}
            features["weather_severity_dest"] = weather_sig.get("severity", 0)
            features["news_risk_score"] = news_sig.get("severity", 0)
            features["precip_mm"] = weather_sig.get("precip_mm", 0)
            features["snowfall_cm"] = weather_sig.get("snowfall_cm", 0)
            features["wind_kph"] = weather_sig.get("wind_kph", 0)

            # Rescore
            risk = scoring_engine.score_shipment(features)

            # Generate recommendation
            rec = generate_recommendation(
                risk["score"], risk["band"], risk["breach_probability"],
                risk.get("drivers", []), s.mode)

            # Update DB
            s.risk_score = risk["score"]
            s.risk_band = risk["band"]
            s.breach_probability = risk["breach_probability"]
            s.predicted_delay_hours = risk["predicted_delay_hours"]
            s.confidence = risk["confidence"]
            s.model_used = risk["model_used"]
            s.validation_status = risk["validation_status"]
            s.features_json = json.dumps(features, default=str)
            s.drivers_json = json.dumps(risk.get("drivers", []), default=str)
            s.signals_json = json.dumps({
                "weather": weather_sig,
                "news": news_sig,
            }, default=str)
            s.recommendation_json = json.dumps(rec, default=str)
            s.updated_at = datetime.now().isoformat()

            session.add(s)
            scored += 1

        except Exception as e:
            logger.warning(f"Failed to refresh {s.id}: {e}")

    session.commit()
    session.close()

    duration_ms = int((time.time() - start) * 1000)

    return {
        "scored": scored,
        "duration_ms": duration_ms,
        "providers_degraded": list(degraded),
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
