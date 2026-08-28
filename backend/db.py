"""
Database models and setup using SQLModel.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, Session, SQLModel, create_engine

from backend.config import DATABASE_URL

engine = create_engine(DATABASE_URL, echo=False)


class ShipmentDB(SQLModel, table=True):
    """Shipment record stored in SQLite."""
    __tablename__ = "shipments"

    id: str = Field(primary_key=True)
    mode: str
    status: str = "IN_TRANSIT"
    carrier: str
    service_level: str
    progress_pct: float = 0.0

    origin_code: str
    origin_name: str
    origin_lat: float
    origin_lon: float

    dest_code: str
    dest_name: str
    dest_lat: float
    dest_lon: float

    departed_at: Optional[str] = None
    promised_delivery: Optional[str] = None
    predicted_delivery: Optional[str] = None

    value_usd: float = 0.0
    weight_kg: float = 0.0

    # Risk (set by scoring engine)
    risk_score: Optional[float] = None
    risk_band: Optional[str] = None
    breach_probability: Optional[float] = None
    predicted_delay_hours: Optional[float] = None
    confidence: Optional[float] = None
    model_used: Optional[str] = None
    validation_status: Optional[str] = None

    # Features (stored as JSON string for simplicity)
    features_json: Optional[str] = None
    drivers_json: Optional[str] = None
    signals_json: Optional[str] = None
    recommendation_json: Optional[str] = None

    updated_at: Optional[str] = None


def create_db_and_tables() -> None:
    """Create database tables."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    """Get a database session."""
    return Session(engine)
