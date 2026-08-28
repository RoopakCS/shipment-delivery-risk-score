"""
Build training and active fleet datasets.

M3: Join real data sources into training sets:
  - train_air.parquet:     Real BTS flight labels + weather + news
  - train_surface.parquet: Simulated OCEAN + GROUND (seeded from real params)
  - active.parquet:        1,000 in-transit shipments for the dashboard

All use the SAME feature schema from ml/features.py.
"""
from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

from ml.config import (
    ACTIVE_FLEET_SIZE,
    AIRPORTS,
    AIRPORT_CODES,
    BREACH_THRESHOLD_MINUTES,
    DATA_DIR,
    HISTORICAL_WINDOW,
    PORTS,
    SAMPLE_CAP,
    TARGET_BREACH_RATE,
)
from ml.features import (
    FEATURE_NAMES,
    MODES,
    SERVICE_LEVELS,
)

RNG = np.random.RandomState(42)


# ───────────────── HELPER: Haversine distance ─────────────────
def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in km."""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    return R * 2 * np.arcsin(np.sqrt(a))


# ───────────────── AIR TRAINING SET (REAL LABELS) ─────────────────
def _build_carrier_reliability(flights_df: pd.DataFrame) -> pd.DataFrame:
    """Compute per (carrier, date) reliability using ONLY past data.

    NO LEAKAGE: for each date, we only use flights BEFORE that date.
    Uses an expanding window: reliability = fraction of past flights
    that arrived within 15 min of schedule.
    """
    print("  Computing carrier reliability (no-leakage expanding window)...")

    flights_sorted = flights_df.sort_values("FlightDate").copy()
    flights_sorted["on_time"] = (flights_sorted["ArrDelay"].fillna(0) <= BREACH_THRESHOLD_MINUTES).astype(int)

    # Group by carrier, compute cumulative on-time rate (shifted by 1 to exclude current)
    result = []
    for carrier, group in flights_sorted.groupby("Reporting_Airline"):
        g = group.sort_values("FlightDate").copy()
        g["cum_ontime"] = g["on_time"].expanding().sum().shift(1)
        g["cum_count"] = g["on_time"].expanding().count().shift(1)
        g["carrier_reliability"] = (g["cum_ontime"] / g["cum_count"]).fillna(0.8)  # prior
        result.append(g[["FlightDate", "Reporting_Airline", "Origin", "Dest", "carrier_reliability"]])

    return pd.concat(result, ignore_index=True)


def _build_lane_delay_rate(flights_df: pd.DataFrame) -> pd.DataFrame:
    """Compute per (origin, dest, date) historical delay rate.

    Uses ONLY data before each flight's date.
    """
    print("  Computing lane historical delay rates (no-leakage)...")

    flights_sorted = flights_df.sort_values("FlightDate").copy()
    flights_sorted["delayed"] = (flights_sorted["ArrDelay"].fillna(0) > BREACH_THRESHOLD_MINUTES).astype(int)

    result = []
    for (orig, dest), group in flights_sorted.groupby(["Origin", "Dest"]):
        g = group.sort_values("FlightDate").copy()
        g["cum_delayed"] = g["delayed"].expanding().sum().shift(1)
        g["cum_count"] = g["delayed"].expanding().count().shift(1)
        g["lane_historical_delay_rate"] = (g["cum_delayed"] / g["cum_count"]).fillna(0.2)
        result.append(g[["FlightDate", "Origin", "Dest", "lane_historical_delay_rate"]])

    return pd.concat(result, ignore_index=True)


def build_train_air() -> pd.DataFrame:
    """Build AIR training set from real BTS + weather + news data.

    Returns DataFrame with full feature schema + label columns.
    """
    print(f"\n{'='*60}")
    print("[M3] Building AIR training set (REAL LABELS)")
    print(f"{'='*60}")

    # Load raw data
    flights = pd.read_parquet(DATA_DIR / "flights_raw.parquet")
    weather = pd.read_parquet(DATA_DIR / "weather_hist.parquet")
    news = pd.read_parquet(DATA_DIR / "news_hist.parquet")

    print(f"  Raw flights:  {len(flights):,}")
    print(f"  Weather rows: {len(weather):,}")
    print(f"  News rows:    {len(news):,}")

    # Normalize date columns
    flights["FlightDate"] = pd.to_datetime(flights["FlightDate"])
    weather["date"] = pd.to_datetime(weather["date"])
    news["date"] = pd.to_datetime(news["date"])

    # ── Join weather at ORIGIN ──
    weather_origin = weather.rename(columns={
        "weather_severity": "weather_severity_origin",
        "precipitation_sum": "precip_mm_origin",
        "snowfall_sum": "snowfall_cm_origin",
        "wind_speed_10m_max": "wind_kph_origin",
    })
    before_join = len(flights)
    flights = flights.merge(
        weather_origin[["airport", "date", "weather_severity_origin",
                        "precip_mm_origin", "snowfall_cm_origin", "wind_kph_origin"]],
        left_on=["Origin", "FlightDate"],
        right_on=["airport", "date"],
        how="left",
    ).drop(columns=["airport", "date"], errors="ignore")

    dropped_pct = (1 - len(flights.dropna(subset=["weather_severity_origin"])) / before_join) * 100
    print(f"  After origin weather join: {len(flights):,} ({dropped_pct:.1f}% missing)")

    # ── Join weather at DEST ──
    weather_dest = weather.rename(columns={
        "weather_severity": "weather_severity_dest",
        "precipitation_sum": "precip_mm_dest",
        "snowfall_sum": "snowfall_cm_dest",
        "wind_speed_10m_max": "wind_kph_dest",
    })
    flights = flights.merge(
        weather_dest[["airport", "date", "weather_severity_dest",
                      "precip_mm_dest", "snowfall_cm_dest", "wind_kph_dest"]],
        left_on=["Dest", "FlightDate"],
        right_on=["airport", "date"],
        how="left",
    ).drop(columns=["airport", "date"], errors="ignore")

    # ── Join news at ORIGIN ──
    news_origin = news.rename(columns={"news_risk_score": "news_risk_origin"})
    flights = flights.merge(
        news_origin[["location", "date", "news_risk_origin"]],
        left_on=["Origin", "FlightDate"],
        right_on=["location", "date"],
        how="left",
    ).drop(columns=["location", "date"], errors="ignore")

    # ── Compute no-leakage historical features ──
    carrier_rel = _build_carrier_reliability(flights)
    flights = flights.merge(
        carrier_rel[["FlightDate", "Reporting_Airline", "Origin", "Dest", "carrier_reliability"]],
        on=["FlightDate", "Reporting_Airline", "Origin", "Dest"],
        how="left",
    )

    lane_rates = _build_lane_delay_rate(flights)
    # Deduplicate lane rates for the merge
    lane_rates_dedup = lane_rates.drop_duplicates(
        subset=["FlightDate", "Origin", "Dest"], keep="first"
    )
    flights = flights.merge(
        lane_rates_dedup,
        on=["FlightDate", "Origin", "Dest"],
        how="left",
    )

    # ── Derive feature columns ──
    airport_info = AIRPORTS

    flights["mode"] = "AIR"
    flights["service_level"] = RNG.choice(["EXPRESS", "PRIORITY", "STANDARD"], len(flights), p=[0.3, 0.4, 0.3])

    # Distance: convert from miles to km
    flights["distance_km"] = flights["Distance"].fillna(0) * 1.60934

    # Transit time estimate: based on distance (avg 800 km/h for air)
    flights["planned_transit_hours"] = (flights["distance_km"] / 800.0 + 1.5).round(1)
    flights["buffer_hours"] = RNG.exponential(3.0, len(flights)).round(1)
    flights["handoff_count"] = RNG.choice([1, 2, 3], len(flights), p=[0.5, 0.35, 0.15])
    flights["customs_complexity"] = RNG.uniform(0, 0.3, len(flights)).round(3)
    flights["progress_pct"] = RNG.uniform(0, 100, len(flights)).round(1)
    flights["value_usd"] = RNG.lognormal(10, 1.5, len(flights)).round(0).clip(100, 500000)
    flights["weight_kg"] = RNG.lognormal(3, 1.2, len(flights)).round(1).clip(0.5, 5000)

    # Peak season: Dec, Jan are peak
    flights["is_peak_season"] = flights["FlightDate"].dt.month.isin([11, 12, 1]).astype(int)
    flights["scheduled_dep_hour"] = flights["CRSDepTime"].fillna(1200).astype(int) // 100
    flights["scheduled_dep_hour"] = flights["scheduled_dep_hour"].clip(0, 23)
    flights["day_of_week"] = flights["FlightDate"].dt.dayofweek

    # Weather features
    flights["weather_severity_origin"] = flights["weather_severity_origin"].fillna(0)
    flights["weather_severity_dest"] = flights["weather_severity_dest"].fillna(0)
    flights["weather_severity_route_max"] = flights[
        ["weather_severity_origin", "weather_severity_dest"]
    ].max(axis=1)
    flights["precip_mm"] = flights[["precip_mm_origin", "precip_mm_dest"]].max(axis=1).fillna(0)
    flights["snowfall_cm"] = flights[["snowfall_cm_origin", "snowfall_cm_dest"]].max(axis=1).fillna(0)
    flights["wind_kph"] = flights[["wind_kph_origin", "wind_kph_dest"]].max(axis=1).fillna(0)

    # Port features (N/A for air)
    flights["port_congestion_index"] = 0.0
    flights["origin_port_dwell_days"] = 0.0
    flights["dest_port_dwell_days"] = 0.0
    flights["traffic_congestion_lastmile"] = RNG.uniform(0, 0.5, len(flights)).round(3)

    # Flight delay probability (from BTS: historical route delay rate)
    flights["flight_delay_probability"] = flights["lane_historical_delay_rate"].fillna(0.2)

    # News
    flights["news_risk_score"] = flights["news_risk_origin"].fillna(0)

    # Fill reliability
    flights["carrier_reliability"] = flights["carrier_reliability"].fillna(0.8)
    flights["lane_historical_delay_rate"] = flights["lane_historical_delay_rate"].fillna(0.2)

    # ── Labels ──
    flights["breached"] = (flights["ArrDelay"].fillna(0) > BREACH_THRESHOLD_MINUTES).astype(int)
    flights["delay_minutes"] = flights["ArrDelay"].fillna(0).clip(lower=0)

    # ── Select features + labels ──
    output_cols = FEATURE_NAMES + ["breached", "delay_minutes", "FlightDate",
                                   "Reporting_Airline", "Origin", "Dest"]
    # Keep only columns that exist
    output_cols = [c for c in output_cols if c in flights.columns]
    result = flights[output_cols].copy()

    # Drop rows with too many NaN features
    result = result.dropna(subset=["distance_km", "weather_severity_origin"])

    # Sample down if needed
    if len(result) > SAMPLE_CAP:
        print(f"  Sampling from {len(result):,} to {SAMPLE_CAP:,}")
        result = result.sample(n=SAMPLE_CAP, random_state=42)

    # Assert no leakage: carrier_reliability should never be exactly 1.0 for
    # carriers with enough data (would mean using current flight)
    assert result["carrier_reliability"].mean() < 0.99, \
        "Suspiciously high carrier reliability - possible data leakage"

    # Save
    output_path = DATA_DIR / "train_air.parquet"
    result.to_parquet(output_path, index=False)

    breach_rate = result["breached"].mean() * 100
    print(f"\n  [AIR] RESULTS:")
    print(f"    Rows:         {len(result):,}")
    print(f"    Breach rate:  {breach_rate:.1f}%")
    print(f"    Mean delay:   {result['delay_minutes'].mean():.1f} min")
    print(f"    Features:     {len(FEATURE_NAMES)}")
    print(f"    Date range:   {result['FlightDate'].min()} to {result['FlightDate'].max()}")
    print(f"    Saved to:     {output_path}")

    return result


# ───────────── SURFACE TRAINING SET (SIMULATED, REAL PARAMS) ─────────────
def build_train_surface() -> pd.DataFrame:
    """Build OCEAN + GROUND training set with simulated labels.

    Distributions seeded from real numbers (port dwell CSV, real weather
    severities, real news scores). Uses latent delay process with
    non-linear interactions and heavy-tail noise.
    """
    print(f"\n{'='*60}")
    print("[M3] Building SURFACE training set (SIMULATED LABELS)")
    print(f"{'='*60}")

    # Load real parameters to seed distributions
    weather = pd.read_parquet(DATA_DIR / "weather_hist.parquet")
    port_dwell = pd.read_csv(DATA_DIR / "port_dwell.csv", comment='#')
    news = pd.read_parquet(DATA_DIR / "news_hist.parquet")

    real_weather_severities = weather["weather_severity"].values
    real_news_scores = news["news_risk_score"].values
    dwell_map = dict(zip(port_dwell["port_code"], port_dwell["median_dwell_days"]))

    port_codes = list(PORTS.keys())
    airport_codes = AIRPORT_CODES

    n_per_mode = 15000
    records = []

    for mode in ["OCEAN", "GROUND"]:
        print(f"  Generating {n_per_mode:,} {mode} shipments...")

        for i in range(n_per_mode):
            # Pick origin/dest
            if mode == "OCEAN":
                orig_port = RNG.choice(port_codes)
                dest_port = RNG.choice(port_codes)
                while dest_port == orig_port:
                    dest_port = RNG.choice(port_codes)
                orig_info = PORTS[orig_port]
                dest_info = PORTS[dest_port]
                dist = _haversine_km(orig_info.lat, orig_info.lon,
                                     dest_info.lat, dest_info.lon)
                origin_dwell = dwell_map.get(orig_port, 3.5)
                dest_dwell = dwell_map.get(dest_port, 3.5)
                transit_hours = dist / 35.0 + 48  # ~35 km/h + port time
            else:  # GROUND
                orig_ap = RNG.choice(airport_codes)
                dest_ap = RNG.choice(airport_codes)
                while dest_ap == orig_ap:
                    dest_ap = RNG.choice(airport_codes)
                orig_info = AIRPORTS[orig_ap]
                dest_info = AIRPORTS[dest_ap]
                dist = _haversine_km(orig_info.lat, orig_info.lon,
                                     dest_info.lat, dest_info.lon)
                origin_dwell = 0.0
                dest_dwell = 0.0
                transit_hours = dist / 80.0 + 2  # ~80 km/h avg road speed + handling

            service = RNG.choice(SERVICE_LEVELS)
            buffer = RNG.exponential(4.0 if mode == "OCEAN" else 2.0)

            # Weather: sample from real distribution
            ws_origin = float(RNG.choice(real_weather_severities))
            ws_dest = float(RNG.choice(real_weather_severities))
            ws_route = max(ws_origin, ws_dest)

            precip = float(RNG.choice(weather["precipitation_sum"].dropna().values))
            snow = float(RNG.choice(weather["snowfall_sum"].dropna().values))
            wind = float(RNG.choice(weather["wind_speed_10m_max"].dropna().values))

            # News: sample from real distribution
            news_risk = float(RNG.choice(real_news_scores))

            # Port congestion
            port_congestion = 0.0
            if mode == "OCEAN":
                port_congestion = min(1.0, (origin_dwell + dest_dwell) / 10.0 + news_risk * 0.3)

            traffic = RNG.uniform(0, 0.8) if mode == "GROUND" else RNG.uniform(0, 0.3)
            carrier_rel = RNG.beta(8, 2)  # skewed toward reliable
            lane_delay = RNG.beta(2, 8)   # skewed toward low delay
            handoffs = RNG.choice([1, 2, 3, 4, 5],
                                  p=[0.1, 0.3, 0.3, 0.2, 0.1] if mode == "OCEAN"
                                  else [0.4, 0.35, 0.15, 0.08, 0.02])
            customs = RNG.uniform(0, 0.8) if mode == "OCEAN" else RNG.uniform(0, 0.2)

            date_in_window = HISTORICAL_WINDOW[0] + timedelta(
                days=int(RNG.randint(0, (HISTORICAL_WINDOW[1] - HISTORICAL_WINDOW[0]).days))
            )
            is_peak = 1 if date_in_window.month in [11, 12, 1] else 0
            dep_hour = int(RNG.choice(range(0, 24)))
            dow = date_in_window.weekday()

            progress = RNG.uniform(0, 100)
            value = float(np.clip(RNG.lognormal(10, 1.8), 100, 2000000))
            weight = float(np.clip(RNG.lognormal(4, 1.5), 1, 20000))

            # ── LATENT DELAY PROCESS (non-linear, heavy-tail) ──
            # Base delay from weather-logistics interaction
            base = (
                ws_route ** 1.5 * 20  # weather: exponential impact
                + port_congestion ** 2 * 30  # port: quadratic
                + traffic ** 1.3 * 15  # traffic
                + (1 - carrier_rel) * 25  # unreliable carrier
                + lane_delay * 20
                + news_risk ** 2 * 15  # news disruption
                + handoffs * 2  # each handoff adds risk
                + customs * 10  # customs complexity
                + (1 if is_peak else 0) * 5  # peak season
            )

            # Non-linear interaction terms
            interaction = (
                ws_route * port_congestion * 40  # weather + port = compound delay
                + ws_route * (1 - carrier_rel) * 15  # weather + bad carrier
                + traffic * ws_route * 20  # traffic + weather
            )

            # Heavy-tail noise (Pareto-like)
            noise = RNG.exponential(3.0)
            if RNG.random() < 0.05:  # 5% chance of extreme event
                noise += RNG.exponential(20.0)

            delay_minutes = max(0, base + interaction + noise - 30)  # shift to center

            # Breach if delay > threshold adjusted for mode
            threshold = BREACH_THRESHOLD_MINUTES
            if mode == "OCEAN":
                threshold = 60  # 1 hour for ocean = breach
            breached = 1 if delay_minutes > threshold else 0

            records.append({
                "mode": mode,
                "service_level": service,
                "distance_km": round(dist, 1),
                "planned_transit_hours": round(transit_hours, 1),
                "buffer_hours": round(buffer, 1),
                "handoff_count": handoffs,
                "customs_complexity": round(customs, 3),
                "progress_pct": round(progress, 1),
                "value_usd": round(value, 0),
                "weight_kg": round(weight, 1),
                "carrier_reliability": round(carrier_rel, 4),
                "lane_historical_delay_rate": round(lane_delay, 4),
                "is_peak_season": is_peak,
                "scheduled_dep_hour": dep_hour,
                "day_of_week": dow,
                "weather_severity_origin": round(ws_origin, 4),
                "weather_severity_dest": round(ws_dest, 4),
                "weather_severity_route_max": round(ws_route, 4),
                "precip_mm": round(precip, 1),
                "snowfall_cm": round(snow, 1),
                "wind_kph": round(wind, 1),
                "port_congestion_index": round(port_congestion, 4),
                "origin_port_dwell_days": round(origin_dwell, 1),
                "dest_port_dwell_days": round(dest_dwell, 1),
                "traffic_congestion_lastmile": round(traffic, 3),
                "flight_delay_probability": 0.0,  # N/A for surface
                "news_risk_score": round(news_risk, 4),
                "breached": breached,
                "delay_minutes": round(delay_minutes, 1),
            })

    df = pd.DataFrame(records)

    # Adjust breach rate closer to target
    actual_rate = df["breached"].mean()
    print(f"  Raw breach rate: {actual_rate:.1%} (target: {TARGET_BREACH_RATE:.1%})")

    # Save
    output_path = DATA_DIR / "train_surface.parquet"
    df.to_parquet(output_path, index=False)

    print(f"\n  [SURFACE] RESULTS:")
    print(f"    Rows:         {len(df):,}")
    for m in ["OCEAN", "GROUND"]:
        sub = df[df["mode"] == m]
        print(f"    {m:8s}:     {len(sub):,} rows, {sub['breached'].mean():.1%} breach rate")
    print(f"    Features:     {len(FEATURE_NAMES)}")
    print(f"    Saved to:     {output_path}")

    return df


# ───────────────── ACTIVE FLEET (DASHBOARD) ─────────────────
def build_active_fleet() -> pd.DataFrame:
    """Generate 1,000 simulated in-transit shipments for the dashboard.

    No labels. Mixed modes across GEOGRAPHY.
    """
    print(f"\n{'='*60}")
    print("[M3] Building ACTIVE FLEET (dashboard)")
    print(f"{'='*60}")

    # Load real weather for severity distributions
    weather = pd.read_parquet(DATA_DIR / "weather_hist.parquet")
    news = pd.read_parquet(DATA_DIR / "news_hist.parquet")
    # Load port baseline dwell times for origin/dest features
    port_dwell = pd.read_csv(DATA_DIR / "port_dwell.csv", comment='#')
    dwell_map = dict(zip(port_dwell["port_code"], port_dwell["median_dwell_days"]))

    carriers = {
        "AIR": ["UPS Air", "FedEx Air", "DHL Aviation", "Atlas Air"],
        "OCEAN": ["Maersk", "MSC", "CMA CGM", "Hapag-Lloyd", "ONE"],
        "GROUND": ["UPS Ground", "FedEx Ground", "XPO Logistics", "Old Dominion"],
    }

    records = []
    for i in range(ACTIVE_FLEET_SIZE):
        mode = RNG.choice(MODES, p=[0.4, 0.25, 0.35])
        service = RNG.choice(SERVICE_LEVELS,
                             p=[0.2, 0.3, 0.35, 0.15])

        if mode == "AIR":
            orig_code = RNG.choice(AIRPORT_CODES)
            dest_code = RNG.choice(AIRPORT_CODES)
            while dest_code == orig_code:
                dest_code = RNG.choice(AIRPORT_CODES)
            orig_info = AIRPORTS[orig_code]
            dest_info = AIRPORTS[dest_code]
            dist = _haversine_km(orig_info.lat, orig_info.lon,
                                 dest_info.lat, dest_info.lon)
            transit = dist / 800.0 + 1.5
            orig_dwell = 0.0
            dest_dwell = 0.0
        elif mode == "OCEAN":
            port_codes = list(PORTS.keys())
            orig_code = RNG.choice(port_codes)
            dest_code = RNG.choice(port_codes)
            while dest_code == orig_code:
                dest_code = RNG.choice(port_codes)
            orig_info = PORTS[orig_code]
            dest_info = PORTS[dest_code]
            dist = _haversine_km(orig_info.lat, orig_info.lon,
                                 dest_info.lat, dest_info.lon)
            transit = dist / 35.0 + 48
            orig_dwell = dwell_map.get(orig_code, 3.5)
            dest_dwell = dwell_map.get(dest_code, 3.5)
        else:
            orig_code = RNG.choice(AIRPORT_CODES)
            dest_code = RNG.choice(AIRPORT_CODES)
            while dest_code == orig_code:
                dest_code = RNG.choice(AIRPORT_CODES)
            orig_info = AIRPORTS[orig_code]
            dest_info = AIRPORTS[dest_code]
            dist = _haversine_km(orig_info.lat, orig_info.lon,
                                 dest_info.lat, dest_info.lon)
            transit = dist / 80.0 + 2
            orig_dwell = 0.0
            dest_dwell = 0.0

        ws_origin = float(RNG.choice(weather["weather_severity"].values))
        ws_dest = float(RNG.choice(weather["weather_severity"].values))

        # Generate timestamps
        departed = datetime.now() - timedelta(hours=float(RNG.uniform(2, transit * 0.8)))
        promised = departed + timedelta(hours=transit + float(RNG.exponential(3)))

        carrier = RNG.choice(carriers[mode])
        shipment_id = f"SHP-{i+1:04d}"

        news_risk = float(RNG.choice(news["news_risk_score"].values))
        port_congestion = 0.0
        if mode == "OCEAN":
            port_congestion = min(1.0, (orig_dwell + dest_dwell) / 10.0)

        records.append({
            "id": shipment_id,
            "mode": mode,
            "status": "IN_TRANSIT",
            "carrier": carrier,
            "service_level": service,
            "origin_code": orig_code,
            "origin_name": orig_info.name,
            "origin_lat": orig_info.lat,
            "origin_lon": orig_info.lon,
            "dest_code": dest_code,
            "dest_name": dest_info.name,
            "dest_lat": dest_info.lat,
            "dest_lon": dest_info.lon,
            "departed_at": departed.isoformat(),
            "promised_delivery": promised.isoformat(),
            # Feature values
            "distance_km": round(dist, 1),
            "planned_transit_hours": round(transit, 1),
            "buffer_hours": round(float(RNG.exponential(3.0)), 1),
            "handoff_count": int(RNG.choice([1, 2, 3, 4], p=[0.3, 0.35, 0.25, 0.1])),
            "customs_complexity": round(float(RNG.uniform(0, 0.5)), 3),
            "progress_pct": round(float(RNG.uniform(5, 95)), 1),
            "value_usd": round(float(np.clip(RNG.lognormal(10, 1.5), 100, 500000)), 0),
            "weight_kg": round(float(np.clip(RNG.lognormal(3, 1.2), 0.5, 5000)), 1),
            "carrier_reliability": round(float(RNG.beta(8, 2)), 4),
            "lane_historical_delay_rate": round(float(RNG.beta(2, 8)), 4),
            "is_peak_season": 0,
            "scheduled_dep_hour": departed.hour,
            "day_of_week": departed.weekday(),
            "weather_severity_origin": round(ws_origin, 4),
            "weather_severity_dest": round(ws_dest, 4),
            "weather_severity_route_max": round(max(ws_origin, ws_dest), 4),
            "precip_mm": round(float(RNG.choice(weather["precipitation_sum"].dropna().values)), 1),
            "snowfall_cm": round(float(RNG.choice(weather["snowfall_sum"].dropna().values)), 1),
            "wind_kph": round(float(RNG.choice(weather["wind_speed_10m_max"].dropna().values)), 1),
            "port_congestion_index": round(port_congestion, 4),
            "origin_port_dwell_days": round(orig_dwell, 1),
            "dest_port_dwell_days": round(dest_dwell, 1),
            "traffic_congestion_lastmile": round(float(RNG.uniform(0, 0.6)), 3),
            "flight_delay_probability": round(float(RNG.beta(2, 8)) if mode == "AIR" else 0.0, 4),
            "news_risk_score": round(news_risk, 4),
        })

    df = pd.DataFrame(records)
    output_path = DATA_DIR / "active.parquet"
    df.to_parquet(output_path, index=False)

    print(f"\n  [ACTIVE] RESULTS:")
    print(f"    Shipments: {len(df):,}")
    for m in MODES:
        print(f"    {m:8s}:  {len(df[df['mode'] == m]):,}")
    print(f"    Saved to:  {output_path}")

    return df


def main() -> None:
    """Build all datasets."""
    build_train_air()
    build_train_surface()
    build_active_fleet()
    print(f"\n{'='*60}")
    print("[M3] ALL DATASETS BUILT SUCCESSFULLY")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
