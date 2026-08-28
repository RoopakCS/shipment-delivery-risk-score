"""
News signal provider - GDELT DOC 2.0 API.

LIVE, NO API KEY required.
Queries for EVERY location on the route (origin, hubs, destination).
30-minute cache. Also supplies the port disruption signal.
Degrades gracefully on failure.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from backend.providers.base import RiskSignalProvider
from ml.config import GDELT_DOC_URL

logger = logging.getLogger(__name__)

DISRUPTION_TERMS = "strike OR closure OR congestion OR storm OR delay OR protest OR backlog"


class NewsProvider(RiskSignalProvider):
    """Live news disruption signals from GDELT DOC 2.0."""

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, dict]] = {}
        self._cache_ttl = 1800  # 30 minutes
        self._is_live = True

    @property
    def name(self) -> str:
        return "news"

    @property
    def is_live(self) -> bool:
        return self._is_live

    async def fetch(self, lat: float, lon: float, location_code: str,
                    **kwargs: Any) -> dict:
        """Fetch news disruption signal for a location."""
        cache_key = location_code
        now = time.time()

        # Check cache
        if cache_key in self._cache:
            ts, cached = self._cache[cache_key]
            if now - ts < self._cache_ttl:
                return cached

        location_name = kwargs.get("location_name", location_code)
        query = f'({location_name}) AND ({DISRUPTION_TERMS})'

        try:
            params = {
                "query": query,
                "mode": "artlist",
                "format": "json",
                "maxrecords": "25",
            }

            # GDELT rate-limits hard; fail fast rather than stall a refresh.
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(GDELT_DOC_URL, params=params)
                resp.raise_for_status()
                data = resp.json()

            articles = data.get("articles", [])
            article_count = len(articles)

            # Compute risk from volume and tone
            if article_count == 0:
                severity = 0.0
                detail = "No disruption news found"
                article_list = []
            else:
                tones = [float(a.get("tone", 0)) for a in articles if a.get("tone")]
                avg_tone = sum(tones) / len(tones) if tones else 0

                volume_score = min(1.0, article_count / 20.0)
                tone_score = min(1.0, max(0, -avg_tone) / 10.0)
                severity = round(0.6 * volume_score + 0.4 * tone_score, 4)

                # Extract article summaries
                article_list = [
                    {
                        "title": a.get("title", "")[:100],
                        "url": a.get("url", ""),
                        "source": a.get("domain", ""),
                        "date": a.get("seendate", ""),
                    }
                    for a in articles[:5]
                ]

                detail = f"{article_count} articles found, avg tone {avg_tone:.1f}"

            result = {
                "severity": severity,
                "is_live": True,
                "source": "GDELT",
                "detail": detail,
                "articles": article_list,
                "article_count": article_count,
            }

            self._is_live = True
            self._cache[cache_key] = (now, result)
            return result

        except Exception as e:
            logger.warning(f"News fetch failed for {location_code}: {e}")
            self._is_live = False
            return {
                "severity": 0.0,
                "is_live": False,
                "source": "GDELT (degraded)",
                "detail": f"News data unavailable: {str(e)[:50]}",
                "articles": [],
                "article_count": 0,
            }
