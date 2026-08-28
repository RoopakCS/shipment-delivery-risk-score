"""
Historical weather data ingestion from Open-Meteo Archive API.

FREE, NO API KEY required.
One request per airport for the full date range (30 airports = 30 calls).
Rate-limited to 1 req/sec. Cached to disk.

Derives weather_severity 0-1 from snow, precip, wind, freezing temps.
Saves ml/data/weather_hist.parquet keyed (airport, date).
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from ml.config import (
    AIRPORTS,
    CACHE_DIR,
    DATA_DIR,
    HISTORICAL_WINDOW,
    OPEN_METEO_ARCHIVE_URL,
)

OUTPUT_PATH = DATA_DIR / "weather_hist.parquet"
WEATHER_CACHE_DIR = CACHE_DIR / "weather"


def _compute_weather_severity(
    precip_mm: float,
    snowfall_cm: float,
    wind_kph: float,
    temp_min_c: float,
    temp_max_c: float,
) -> float:
    """Derive a weather severity score 0-1 from raw weather variables.

    Components:
      - Precipitation: heavy rain > 25mm is max
      - Snowfall: any snowfall adds significant severity
      - Wind: gusts > 80 kph are dangerous for logistics
      - Freezing: temps below 0C add icing risk

    Combined with max(), not weighted sum, to capture worst-case.
    """
    # Each component 0-1
    precip_score = min(1.0, (precip_mm or 0) / 30.0)
    snow_score = min(1.0, (snowfall_cm or 0) / 15.0)
    wind_score = min(1.0, max(0, ((wind_kph or 0) - 20)) / 60.0)

    # Freezing risk: below 0C starts contributing, below -10C is max
    freeze_score = 0.0
    if temp_min_c is not None and temp_min_c < 0:
        freeze_score = min(1.0, abs(temp_min_c) / 15.0)

    # Non-linear combination: use a mix of max + weighted average
    # This captures both "worst single factor" and compound effects
    components = [precip_score, snow_score, wind_score, freeze_score]
    max_component = max(components)
    mean_component = np.mean(components)

    # Severity leans toward worst factor but compound effects boost it
    severity = 0.6 * max_component + 0.4 * mean_component
    return round(min(1.0, severity), 4)


def _fetch_airport_weather(
    code: str, lat: float, lon: float, start_date: str, end_date: str
) -> pd.DataFrame | None:
    """Fetch daily weather for one airport from Open-Meteo Archive.

    Returns DataFrame with columns: airport, date, precipitation_sum,
    snowfall_sum, wind_speed_10m_max, temperature_2m_min, temperature_2m_max,
    weather_severity.
    """
    cache_file = WEATHER_CACHE_DIR / f"{code}_{start_date}_{end_date}.json"
    if cache_file.exists():
        with open(cache_file, "r") as f:
            data = json.load(f)
        print(f"    {code}: cached ({len(data.get('daily', {}).get('time', []))} days)")
    else:
        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": start_date,
            "end_date": end_date,
            "daily": "precipitation_sum,snowfall_sum,wind_speed_10m_max,temperature_2m_min,temperature_2m_max",
            "timezone": "America/New_York",
        }
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.get(OPEN_METEO_ARCHIVE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            print(f"    {code}: FAILED - {e}")
            return None

        # Cache to disk
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "w") as f:
            json.dump(data, f)

        day_count = len(data.get("daily", {}).get("time", []))
        print(f"    {code}: fetched ({day_count} days)")

    # Parse into DataFrame
    daily = data.get("daily", {})
    if not daily or not daily.get("time"):
        return None

    df = pd.DataFrame({
        "airport": code,
        "date": pd.to_datetime(daily["time"]),
        "precipitation_sum": daily.get("precipitation_sum", []),
        "snowfall_sum": daily.get("snowfall_sum", []),
        "wind_speed_10m_max": daily.get("wind_speed_10m_max", []),
        "temperature_2m_min": daily.get("temperature_2m_min", []),
        "temperature_2m_max": daily.get("temperature_2m_max", []),
    })

    # Compute severity
    df["weather_severity"] = df.apply(
        lambda r: _compute_weather_severity(
            r["precipitation_sum"], r["snowfall_sum"],
            r["wind_speed_10m_max"], r["temperature_2m_min"],
            r["temperature_2m_max"],
        ),
        axis=1,
    )

    return df


def ingest_weather_archive() -> pd.DataFrame:
    """Main entry: fetch weather for all 30 airports, save to parquet.

    Returns combined DataFrame keyed by (airport, date).
    """
    start, end = HISTORICAL_WINDOW
    start_str = start.isoformat()
    end_str = end.isoformat()

    print(f"\n{'='*60}")
    print(f"[M2] Historical Weather Ingestion (Open-Meteo Archive)")
    print(f"  Window: {start_str} to {end_str}")
    print(f"  Airports: {len(AIRPORTS)}")
    print(f"{'='*60}")

    frames: list[pd.DataFrame] = []
    for i, (code, info) in enumerate(AIRPORTS.items()):
        df = _fetch_airport_weather(code, info.lat, info.lon, start_str, end_str)
        if df is not None:
            frames.append(df)

        # Rate limit: 1 req/sec
        if i < len(AIRPORTS) - 1:
            time.sleep(1.0)

    if not frames:
        raise RuntimeError("FATAL: Could not fetch weather for ANY airport.")

    combined = pd.concat(frames, ignore_index=True)

    # Save
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(OUTPUT_PATH, index=False)

    # Report
    airports_ok = combined["airport"].nunique()
    date_range = f"{combined['date'].min().date()} to {combined['date'].max().date()}"
    mean_severity = combined["weather_severity"].mean()

    print(f"\n  [WEATHER] RESULTS:")
    print(f"    Total rows:      {len(combined):,}")
    print(f"    Airports:        {airports_ok}/{len(AIRPORTS)}")
    print(f"    Date range:      {date_range}")
    print(f"    Mean severity:   {mean_severity:.4f}")
    print(f"    Saved to:        {OUTPUT_PATH}")

    return combined


if __name__ == "__main__":
    ingest_weather_archive()
