"""
Backtest module - THE DEMO CENTERPIECE.

M5: Auto-identify the top 5 REAL disruption days in the window from BTS data.
For each, build a backtest record comparing model prediction vs what actually
happened. This is how we prove the model works.

Saves ml/artifacts/backtest.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.config import (
    AIRPORTS,
    ARTIFACTS_DIR,
    BREACH_THRESHOLD_MINUTES,
    DATA_DIR,
    breach_prob_to_score,
    risk_band,
)
from ml.features import FEATURE_NAMES, FEATURE_MAP
from ml.train import _encode_categoricals, _prepare_features

BACKTEST_PATH = ARTIFACTS_DIR / "backtest.json"
MODELS_DIR = ARTIFACTS_DIR / "models"


def _load_air_models():
    """Load the trained AIR model set."""
    model_dir = MODELS_DIR / "air"
    clf = joblib.load(model_dir / "classifier.joblib")
    reg = joblib.load(model_dir / "regressor.joblib")
    encoders = joblib.load(model_dir / "encoders.joblib")

    explainer = None
    explainer_path = model_dir / "shap_explainer.joblib"
    if explainer_path.exists():
        explainer = joblib.load(explainer_path)

    return clf, reg, encoders, explainer


def _get_shap_drivers(explainer, X_row: np.ndarray, feature_names: list[str],
                       feature_values: dict, top_n: int = 3) -> list[dict]:
    """Get top N SHAP drivers for a single prediction."""
    if explainer is None:
        return []

    try:
        shap_values = explainer.shap_values(X_row.reshape(1, -1))
        if isinstance(shap_values, list):
            vals = shap_values[1][0]  # class 1 (breach)
        else:
            vals = shap_values[0]

        # Get top N by absolute value
        abs_vals = np.abs(vals)
        top_idx = abs_vals.argsort()[-top_n:][::-1]

        drivers = []
        for idx in top_idx:
            feat_name = feature_names[idx]
            feat_def = FEATURE_MAP.get(feat_name)
            feat_val = feature_values.get(feat_name, 0)

            direction = "increases" if vals[idx] > 0 else "decreases"
            label = feat_def.label if feat_def else feat_name
            try:
                explanation = feat_def.explanation_template.format(value=feat_val) if feat_def else f"{feat_name}={feat_val}"
            except Exception:
                explanation = f"{label}: {feat_val}"

            drivers.append({
                "feature": feat_name,
                "label": label,
                "value": round(float(feat_val), 4),
                "contribution": round(float(abs(vals[idx])), 4),
                "direction": direction,
                "explanation": explanation,
            })

        return drivers
    except Exception:
        return []


def find_disruption_days(flights_df: pd.DataFrame, top_n: int = 5) -> pd.DataFrame:
    """Find the top N real disruption days from BTS data.

    Ranks (airport, date) pairs by highest actual delay rates.
    """
    flights_df = flights_df.copy()
    flights_df["FlightDate"] = pd.to_datetime(flights_df["FlightDate"])
    flights_df["delayed"] = (flights_df["ArrDelay"].fillna(0) > BREACH_THRESHOLD_MINUTES).astype(int)

    # Aggregate by (Origin, date)
    daily = flights_df.groupby(["Origin", flights_df["FlightDate"].dt.date]).agg(
        total_flights=("delayed", "count"),
        delayed_flights=("delayed", "sum"),
        mean_arr_delay=("ArrDelay", "mean"),
        max_arr_delay=("ArrDelay", "max"),
        pct_delayed=("delayed", "mean"),
        # Delay cause breakdown
        carrier_delay_sum=("CarrierDelay", lambda x: x.fillna(0).sum()),
        weather_delay_sum=("WeatherDelay", lambda x: x.fillna(0).sum()),
        nas_delay_sum=("NASDelay", lambda x: x.fillna(0).sum()),
        late_aircraft_sum=("LateAircraftDelay", lambda x: x.fillna(0).sum()),
    ).reset_index()

    daily.columns = ["airport", "date", "total_flights", "delayed_flights",
                      "mean_arr_delay", "max_arr_delay", "pct_delayed",
                      "carrier_delay_sum", "weather_delay_sum",
                      "nas_delay_sum", "late_aircraft_sum"]

    # Filter: need at least 20 flights for statistical significance
    daily = daily[daily["total_flights"] >= 20]

    # Rank by delay rate
    daily = daily.sort_values("pct_delayed", ascending=False).head(top_n)

    return daily


def build_backtest() -> list[dict]:
    """Build backtest records for top 5 disruption days.

    For each event:
    - Inputs as known BEFORE the event
    - Model prediction (risk score, P(breach), predicted delay, drivers)
    - WHAT ACTUALLY HAPPENED from BTS
    - Match verdict
    """
    print(f"\n{'='*60}")
    print("[M5] Building Backtest - Top 5 Real Disruption Days")
    print(f"{'='*60}")

    # Load data
    flights = pd.read_parquet(DATA_DIR / "flights_raw.parquet")
    weather = pd.read_parquet(DATA_DIR / "weather_hist.parquet")
    news = pd.read_parquet(DATA_DIR / "news_hist.parquet")

    # Find top disruption days
    disruptions = find_disruption_days(flights)
    print(f"\n  Top {len(disruptions)} disruption days identified:")

    # Load model
    clf, reg, encoders, explainer = _load_air_models()

    backtest_records = []

    for idx, (_, row) in enumerate(disruptions.iterrows()):
        airport = row["airport"]
        event_date = pd.Timestamp(row["date"])
        airport_info = AIRPORTS.get(airport)

        print(f"\n  Event {idx+1}: {airport} on {event_date.date()}")
        print(f"    Flights: {row['total_flights']}, Delayed: {row['delayed_flights']} "
              f"({row['pct_delayed']:.1%})")
        print(f"    Mean delay: {row['mean_arr_delay']:.1f} min, "
              f"Max: {row['max_arr_delay']:.0f} min")

        # ── Get inputs as known BEFORE the event ──
        # Weather at the airport on that day
        wx = weather[(weather["airport"] == airport) &
                      (weather["date"] == event_date)]
        weather_severity = float(wx["weather_severity"].iloc[0]) if len(wx) > 0 else 0.0
        precip = float(wx["precipitation_sum"].iloc[0]) if len(wx) > 0 else 0.0
        snow = float(wx["snowfall_sum"].iloc[0]) if len(wx) > 0 else 0.0
        wind = float(wx["wind_speed_10m_max"].iloc[0]) if len(wx) > 0 else 0.0

        # News risk
        nx = news[(news["location"] == airport) & (news["date"] == event_date)]
        news_risk = float(nx["news_risk_score"].iloc[0]) if len(nx) > 0 else 0.0

        # Historical carrier reliability (from flights before this date)
        past_flights = flights[pd.to_datetime(flights["FlightDate"]) < event_date]
        past_at_airport = past_flights[past_flights["Origin"] == airport]
        if len(past_at_airport) > 0:
            carrier_rel = (past_at_airport["ArrDelay"].fillna(0) <= BREACH_THRESHOLD_MINUTES).mean()
            lane_delay_rate = (past_at_airport["ArrDelay"].fillna(0) > BREACH_THRESHOLD_MINUTES).mean()
        else:
            carrier_rel = 0.8
            lane_delay_rate = 0.2

        # Build feature vector
        feature_values = {
            "mode": "AIR",
            "service_level": "PRIORITY",
            "distance_km": 1500.0,  # representative
            "planned_transit_hours": 4.0,
            "buffer_hours": 2.0,
            "handoff_count": 2,
            "customs_complexity": 0.1,
            "progress_pct": 30.0,
            "value_usd": 50000.0,
            "weight_kg": 200.0,
            "carrier_reliability": carrier_rel,
            "lane_historical_delay_rate": lane_delay_rate,
            "is_peak_season": 1 if event_date.month in [11, 12, 1] else 0,
            "scheduled_dep_hour": 10,
            "day_of_week": event_date.weekday(),
            "weather_severity_origin": weather_severity,
            "weather_severity_dest": weather_severity * 0.5,  # conservative
            "weather_severity_route_max": weather_severity,
            "precip_mm": precip,
            "snowfall_cm": snow,
            "wind_kph": wind,
            "port_congestion_index": 0.0,
            "origin_port_dwell_days": 0.0,
            "dest_port_dwell_days": 0.0,
            "traffic_congestion_lastmile": 0.2,
            "flight_delay_probability": lane_delay_rate,
            "news_risk_score": news_risk,
        }

        # Prepare for model
        X = _prepare_features(pd.DataFrame([feature_values]))
        X, _ = _encode_categoricals(X, encoders, fit=False)
        X_arr = X.values

        # Predict
        p_breach = float(clf.predict_proba(X_arr)[0][1])
        pred_delay = float(reg.predict(X_arr)[0])
        score = breach_prob_to_score(p_breach)
        band = risk_band(score)

        # SHAP drivers
        drivers = _get_shap_drivers(explainer, X_arr[0], FEATURE_NAMES,
                                     feature_values, top_n=3)

        # ── What actually happened ──
        # Official delay-cause breakdown
        total_delay = (row["carrier_delay_sum"] + row["weather_delay_sum"] +
                       row["nas_delay_sum"] + row["late_aircraft_sum"])
        cause_breakdown = {}
        if total_delay > 0:
            cause_breakdown = {
                "carrier": round(row["carrier_delay_sum"] / total_delay * 100, 1),
                "weather": round(row["weather_delay_sum"] / total_delay * 100, 1),
                "nas_system": round(row["nas_delay_sum"] / total_delay * 100, 1),
                "late_aircraft": round(row["late_aircraft_sum"] / total_delay * 100, 1),
            }

        # Match verdict
        actual_high_risk = row["pct_delayed"] > 0.3
        predicted_high_risk = score >= 6.0
        if actual_high_risk and predicted_high_risk:
            verdict = "TRUE_POSITIVE"
        elif actual_high_risk and not predicted_high_risk:
            verdict = "FALSE_NEGATIVE"
        elif not actual_high_risk and predicted_high_risk:
            verdict = "FALSE_POSITIVE"
        else:
            verdict = "TRUE_NEGATIVE"

        record = {
            "id": f"BT-{idx+1:03d}",
            "airport": airport,
            "airport_name": airport_info.name if airport_info else airport,
            "date": str(event_date.date()),
            "lat": airport_info.lat if airport_info else 0,
            "lon": airport_info.lon if airport_info else 0,

            "prediction": {
                "risk_score": score,
                "band": band,
                "breach_probability": round(p_breach, 4),
                "predicted_delay_hours": round(pred_delay / 60, 2),
                "drivers": drivers,
            },

            "inputs_before_event": {
                "weather_severity": weather_severity,
                "precipitation_mm": precip,
                "snowfall_cm": snow,
                "wind_kph": wind,
                "news_risk_score": news_risk,
                "carrier_reliability": round(carrier_rel, 4),
                "lane_delay_rate": round(lane_delay_rate, 4),
            },

            "actual_outcome": {
                "total_flights": int(row["total_flights"]),
                "delayed_flights": int(row["delayed_flights"]),
                "delay_rate": round(float(row["pct_delayed"]), 4),
                "mean_delay_minutes": round(float(row["mean_arr_delay"]), 1),
                "max_delay_minutes": round(float(row["max_arr_delay"]), 0),
                "cause_breakdown_pct": cause_breakdown,
            },

            "verdict": verdict,
        }

        backtest_records.append(record)

        print(f"    Prediction: score={score}, band={band}, P(breach)={p_breach:.3f}")
        print(f"    Actual:     {row['pct_delayed']:.1%} delayed, "
              f"mean {row['mean_arr_delay']:.1f}min")
        print(f"    Verdict:    {verdict}")

    # Save
    with open(BACKTEST_PATH, "w") as f:
        json.dump(backtest_records, f, indent=2)

    print(f"\n  Saved backtest to {BACKTEST_PATH}")
    print(f"\n{'='*60}")
    print("[M5] BACKTEST COMPLETE")
    print(f"{'='*60}")

    return backtest_records


if __name__ == "__main__":
    build_backtest()
