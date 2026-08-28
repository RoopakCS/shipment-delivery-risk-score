"""
Traffic signal provider - TomTom Traffic Flow API.

LIVE, requires TOMTOM_API_KEY env var.
Degrades gracefully when key is missing or API fails.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx

from backend.providers.base import RiskSignalProvider
from ml.config import TOMTOM_FLOW_URL

logger = logging.getLogger(__name__)


class TrafficProvider(RiskSignalProvider):
    """Live traffic congestion from TomTom Traffic Flow API."""

    def __init__(self) -> None:
        self._api_key = os.environ.get("TOMTOM_API_KEY", "")
        self._cache: dict[str, tuple[float, dict]] = {}
        self._cache_ttl = 300  # 5 minutes
        self._is_live = bool(self._api_key)

    @property
    def name(self) -> str:
        return "traffic"

    @property
    def is_live(self) -> bool:
        return self._is_live

    async def fetch(self, lat: float, lon: float, location_code: str,
                    **kwargs: Any) -> dict:
        """Fetch traffic flow data for a location."""
        if not self._api_key:
            return {
                "severity": 0.3,  # moderate default
                "is_live": False,
                "source": "TomTom (no API key)",
                "detail": "TOMTOM_API_KEY not configured",
            }

        cache_key = f"{lat:.3f},{lon:.3f}"
        now = time.time()

        if cache_key in self._cache:
            ts, cached = self._cache[cache_key]
            if now - ts < self._cache_ttl:
                return cached

        try:
            params = {
                "key": self._api_key,
                "point": f"{lat},{lon}",
            }

            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(TOMTOM_FLOW_URL, params=params)
                resp.raise_for_status()
                data = resp.json()

            flow = data.get("flowSegmentData", {})
            current_speed = flow.get("currentSpeed", 60)
            free_flow = flow.get("freeFlowSpeed", 60)
            confidence = flow.get("confidence", 0.5)

            # Congestion: ratio of speed reduction
            if free_flow > 0:
                congestion = max(0, 1 - current_speed / free_flow)
            else:
                congestion = 0.3

            result = {
                "severity": round(congestion, 4),
                "is_live": True,
                "source": "TomTom",
                "detail": f"Speed {current_speed}/{free_flow} km/h, "
                          f"congestion {congestion:.0%}",
                "current_speed": current_speed,
                "free_flow_speed": free_flow,
                "confidence": confidence,
            }

            self._is_live = True
            self._cache[cache_key] = (now, result)
            return result

        except Exception as e:
            logger.warning(f"Traffic fetch failed: {e}")
            self._is_live = False
            return {
                "severity": 0.3,
                "is_live": False,
                "source": "TomTom (degraded)",
                "detail": f"Traffic data unavailable: {str(e)[:50]}",
            }
