"""
Weather signal provider - Open-Meteo Forecast API.

LIVE, NO API KEY required.
10-minute cache per location.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from backend.providers.base import RiskSignalProvider
from ml.config import OPEN_METEO_FORECAST_URL

logger = logging.getLogger(__name__)


class WeatherProvider(RiskSignalProvider):
    """Live weather signals from Open-Meteo forecast API."""

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, dict]] = {}  # key -> (timestamp, data)
        self._cache_ttl = 600  # 10 minutes
        self._is_live = True

    @property
    def name(self) -> str:
        return "weather"

    @property
    def is_live(self) -> bool:
        return self._is_live

    async def fetch(self, lat: float, lon: float, location_code: str,
                    **kwargs: Any) -> dict:
        """Fetch weather forecast for a location."""
        cache_key = f"{lat:.2f},{lon:.2f}"
        now = time.time()

        # Check cache
        if cache_key in self._cache:
            ts, cached = self._cache[cache_key]
            if now - ts < self._cache_ttl:
                return cached

        # Fetch from API
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "precipitation_sum,snowfall_sum,wind_speed_10m_max,temperature_2m_min,temperature_2m_max",
            "forecast_days": 2,
            "timezone": "auto",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(OPEN_METEO_FORECAST_URL, params=params)
                resp.raise_for_status()
                data = resp.json()

            daily = data.get("daily", {})
            if not daily or not daily.get("time"):
                raise ValueError("No daily data in response")

            # Use today's forecast (index 0)
            precip = daily.get("precipitation_sum", [0])[0] or 0
            snow = daily.get("snowfall_sum", [0])[0] or 0
            wind = daily.get("wind_speed_10m_max", [0])[0] or 0
            temp_min = daily.get("temperature_2m_min", [10])[0] or 10
            temp_max = daily.get("temperature_2m_max", [20])[0] or 20

            # Compute severity
            precip_s = min(1.0, precip / 30.0)
            snow_s = min(1.0, snow / 15.0)
            wind_s = min(1.0, max(0, (wind - 20)) / 60.0)
            freeze_s = min(1.0, abs(temp_min) / 15.0) if temp_min < 0 else 0
            severity = round(0.6 * max(precip_s, snow_s, wind_s, freeze_s) +
                             0.4 * (precip_s + snow_s + wind_s + freeze_s) / 4, 4)

            # Build detail string
            conditions = []
            if precip > 5:
                conditions.append(f"rain {precip:.0f}mm")
            if snow > 1:
                conditions.append(f"snow {snow:.0f}cm")
            if wind > 40:
                conditions.append(f"wind {wind:.0f}km/h")
            if temp_min < 0:
                conditions.append(f"freezing {temp_min:.0f}C")
            detail = ", ".join(conditions) if conditions else "Clear conditions"

            result = {
                "severity": severity,
                "is_live": True,
                "source": "Open-Meteo",
                "detail": detail,
                "precip_mm": precip,
                "snowfall_cm": snow,
                "wind_kph": wind,
                "temp_min": temp_min,
                "temp_max": temp_max,
            }

            self._is_live = True
            self._cache[cache_key] = (now, result)
            return result

        except Exception as e:
            logger.warning(f"Weather fetch failed for {location_code}: {e}")
            self._is_live = False
            return {
                "severity": 0.0,
                "is_live": False,
                "source": "Open-Meteo (degraded)",
                "detail": f"Weather data unavailable: {str(e)[:50]}",
                "precip_mm": 0,
                "snowfall_cm": 0,
                "wind_kph": 0,
                "temp_min": 10,
                "temp_max": 20,
            }
