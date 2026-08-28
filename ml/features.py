"""
Feature schema for Shipment Delivery Risk Score.

THIS IS THE SINGLE SOURCE OF TRUTH for feature definitions.
Used by BOTH training (ml/build_dataset.py, ml/train.py) and
serving (backend/scoring.py). Never define features elsewhere.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FeatureDef:
    """Definition of a single feature in the risk model."""
    name: str
    dtype: str  # "float", "int", "categorical"
    label: str  # Human-readable label for UI
    explanation_template: str  # Template with {value} placeholder
    category: str  # Grouping: shipment, weather, logistics, external


# ─────────────────── CANONICAL FEATURE LIST ───────────────────
FEATURES: list[FeatureDef] = [
    # ── Shipment characteristics ──
    FeatureDef(
        name="mode",
        dtype="categorical",
        label="Transport mode",
        explanation_template="Shipment is traveling by {value} transport",
        category="shipment",
    ),
    FeatureDef(
        name="service_level",
        dtype="categorical",
        label="Service level",
        explanation_template="Service level is {value}",
        category="shipment",
    ),
    FeatureDef(
        name="distance_km",
        dtype="float",
        label="Route distance",
        explanation_template="Route distance is {value:.0f} km",
        category="shipment",
    ),
    FeatureDef(
        name="planned_transit_hours",
        dtype="float",
        label="Planned transit time",
        explanation_template="Planned transit time is {value:.1f} hours",
        category="shipment",
    ),
    FeatureDef(
        name="buffer_hours",
        dtype="float",
        label="Schedule buffer",
        explanation_template="Buffer before SLA deadline is {value:.1f} hours",
        category="shipment",
    ),
    FeatureDef(
        name="handoff_count",
        dtype="int",
        label="Number of handoffs",
        explanation_template="{value} handoffs between carriers/modes on route",
        category="shipment",
    ),
    FeatureDef(
        name="customs_complexity",
        dtype="float",
        label="Customs complexity",
        explanation_template="Customs complexity score is {value:.2f}",
        category="shipment",
    ),
    FeatureDef(
        name="progress_pct",
        dtype="float",
        label="Journey progress",
        explanation_template="Shipment is {value:.0f}% through its journey",
        category="shipment",
    ),
    FeatureDef(
        name="value_usd",
        dtype="float",
        label="Declared value",
        explanation_template="Declared value is ${value:,.0f}",
        category="shipment",
    ),
    FeatureDef(
        name="weight_kg",
        dtype="float",
        label="Package weight",
        explanation_template="Package weighs {value:.1f} kg",
        category="shipment",
    ),

    # ── Historical reliability ──
    FeatureDef(
        name="carrier_reliability",
        dtype="float",
        label="Carrier reliability",
        explanation_template="Carrier on-time rate is {value:.1%}",
        category="logistics",
    ),
    FeatureDef(
        name="lane_historical_delay_rate",
        dtype="float",
        label="Lane delay history",
        explanation_template="This lane has a {value:.1%} historical delay rate",
        category="logistics",
    ),
    FeatureDef(
        name="is_peak_season",
        dtype="int",
        label="Peak season",
        explanation_template="{'Peak season (holiday/year-end)' if {value} else 'Normal season'}",
        category="logistics",
    ),
    FeatureDef(
        name="scheduled_dep_hour",
        dtype="int",
        label="Departure hour",
        explanation_template="Scheduled departure at {value}:00",
        category="logistics",
    ),
    FeatureDef(
        name="day_of_week",
        dtype="int",
        label="Day of week",
        explanation_template="Departure on day {value} of the week",
        category="logistics",
    ),

    # ── Weather ──
    FeatureDef(
        name="weather_severity_origin",
        dtype="float",
        label="Origin weather",
        explanation_template="Weather severity at origin is {value:.2f}/1.0",
        category="weather",
    ),
    FeatureDef(
        name="weather_severity_dest",
        dtype="float",
        label="Destination weather",
        explanation_template="Weather severity at destination is {value:.2f}/1.0",
        category="weather",
    ),
    FeatureDef(
        name="weather_severity_route_max",
        dtype="float",
        label="Worst weather on route",
        explanation_template="Worst weather severity along route is {value:.2f}/1.0",
        category="weather",
    ),
    FeatureDef(
        name="precip_mm",
        dtype="float",
        label="Precipitation",
        explanation_template="Precipitation forecast is {value:.1f} mm",
        category="weather",
    ),
    FeatureDef(
        name="snowfall_cm",
        dtype="float",
        label="Snowfall",
        explanation_template="Snowfall forecast is {value:.1f} cm",
        category="weather",
    ),
    FeatureDef(
        name="wind_kph",
        dtype="float",
        label="Wind speed",
        explanation_template="Max wind speed is {value:.0f} km/h",
        category="weather",
    ),

    # ── Port / ground ──
    FeatureDef(
        name="port_congestion_index",
        dtype="float",
        label="Port congestion",
        explanation_template="Port congestion index is {value:.2f}/1.0",
        category="logistics",
    ),
    FeatureDef(
        name="origin_port_dwell_days",
        dtype="float",
        label="Origin port dwell",
        explanation_template="Average dwell time at origin port is {value:.1f} days",
        category="logistics",
    ),
    FeatureDef(
        name="dest_port_dwell_days",
        dtype="float",
        label="Destination port dwell",
        explanation_template="Average dwell time at destination port is {value:.1f} days",
        category="logistics",
    ),
    FeatureDef(
        name="traffic_congestion_lastmile",
        dtype="float",
        label="Last-mile traffic",
        explanation_template="Last-mile traffic congestion is {value:.2f}/1.0",
        category="logistics",
    ),
    FeatureDef(
        name="flight_delay_probability",
        dtype="float",
        label="Flight delay probability",
        explanation_template="Historical flight delay probability is {value:.1%}",
        category="logistics",
    ),

    # ── External signals ──
    FeatureDef(
        name="news_risk_score",
        dtype="float",
        label="News disruption risk",
        explanation_template="News-based disruption risk is {value:.2f}/1.0",
        category="external",
    ),
]

# Quick lookup by name
FEATURE_MAP: dict[str, FeatureDef] = {f.name: f for f in FEATURES}

# Just the names, in order
FEATURE_NAMES: list[str] = [f.name for f in FEATURES]

# Numeric features (for the model - excludes categoricals that need encoding)
NUMERIC_FEATURES: list[str] = [f.name for f in FEATURES if f.dtype != "categorical"]
CATEGORICAL_FEATURES: list[str] = [f.name for f in FEATURES if f.dtype == "categorical"]

# Modes and service levels
MODES = ["AIR", "OCEAN", "GROUND"]
SERVICE_LEVELS = ["EXPRESS", "PRIORITY", "STANDARD", "ECONOMY"]


def get_feature_explanation(feature_name: str, value: Any) -> str:
    """Generate a human-readable explanation for a feature value."""
    feat = FEATURE_MAP.get(feature_name)
    if feat is None:
        return f"{feature_name} = {value}"
    try:
        return feat.explanation_template.format(value=value)
    except (ValueError, KeyError):
        return f"{feat.label}: {value}"
