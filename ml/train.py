"""
Model training for Shipment Delivery Risk Score.

M4: Train TWO model sets sharing the same feature schema:
  MODEL_AIR:     trained on train_air.parquet     -> real_weather_simulated_flights
  MODEL_SURFACE: trained on train_surface.parquet  -> simulated

Each model set:
  - LGBMClassifier -> CalibratedClassifierCV(isotonic, cv=3) -> P(breach)
  - LGBMRegressor  -> delay magnitude
  - shap.TreeExplainer for per-shipment attribution

AIR split: by TIME (train on earlier weeks, test on later) - NO random split.
Reports: ROC-AUC, PR-AUC, Brier, confusion matrix, calibration, SHAP, baseline.
Fails if AIR ROC-AUC < 0.65.
"""
from __future__ import annotations

import json
import warnings
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.preprocessing import LabelEncoder

from ml.config import ARTIFACTS_DIR, DATA_DIR, MIN_AIR_AUC
from ml.features import CATEGORICAL_FEATURES, FEATURE_NAMES, NUMERIC_FEATURES

warnings.filterwarnings("ignore", category=UserWarning)

MODELS_DIR = ARTIFACTS_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def _encode_categoricals(df: pd.DataFrame, encoders: dict | None = None,
                          fit: bool = True) -> tuple[pd.DataFrame, dict]:
    """Encode categorical features as integers for LightGBM."""
    if encoders is None:
        encoders = {}
    df = df.copy()
    for col in CATEGORICAL_FEATURES:
        if col not in df.columns:
            df[col] = "UNKNOWN"
        if fit:
            le = LabelEncoder()
            df[col] = le.fit_transform(df[col].astype(str))
            encoders[col] = le
        else:
            le = encoders[col]
            # Handle unseen categories
            df[col] = df[col].astype(str).map(
                lambda x, _le=le: (
                    _le.transform([x])[0] if x in _le.classes_ else -1
                )
            )
    return df, encoders


def _prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Select and fill missing feature columns."""
    result = pd.DataFrame()
    for col in FEATURE_NAMES:
        if col in df.columns:
            result[col] = df[col]
        else:
            result[col] = 0.0
    return result.fillna(0)


def _compute_metrics(y_true: np.ndarray, y_pred_proba: np.ndarray,
                      y_pred: np.ndarray, prefix: str) -> dict:
    """Compute classification metrics."""
    metrics = {
        f"{prefix}_roc_auc": float(roc_auc_score(y_true, y_pred_proba)),
        f"{prefix}_pr_auc": float(average_precision_score(y_true, y_pred_proba)),
        f"{prefix}_brier": float(brier_score_loss(y_true, y_pred_proba)),
        f"{prefix}_accuracy": float(accuracy_score(y_true, y_pred)),
        f"{prefix}_precision": float(precision_score(y_true, y_pred, zero_division=0)),
        f"{prefix}_recall": float(recall_score(y_true, y_pred, zero_division=0)),
        f"{prefix}_f1": float(f1_score(y_true, y_pred, zero_division=0)),
    }

    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred)
    metrics[f"{prefix}_confusion_matrix"] = cm.tolist()

    # Calibration curve (10 bins)
    try:
        prob_true, prob_pred = calibration_curve(y_true, y_pred_proba, n_bins=10,
                                                  strategy="uniform")
        metrics[f"{prefix}_calibration"] = {
            "prob_true": prob_true.tolist(),
            "prob_pred": prob_pred.tolist(),
        }
    except Exception:
        metrics[f"{prefix}_calibration"] = {"prob_true": [], "prob_pred": []}

    # Baseline comparison (always predict majority)
    majority_class = int(np.argmax(np.bincount(y_true.astype(int))))
    baseline_pred = np.full_like(y_true, majority_class)
    baseline_proba = np.full_like(y_pred_proba, y_true.mean())
    metrics[f"{prefix}_baseline_roc_auc"] = float(
        roc_auc_score(y_true, baseline_proba) if len(np.unique(y_true)) > 1 else 0.5
    )
    metrics[f"{prefix}_baseline_accuracy"] = float(accuracy_score(y_true, baseline_pred))
    metrics[f"{prefix}_lift_roc_auc"] = (
        metrics[f"{prefix}_roc_auc"] - metrics[f"{prefix}_baseline_roc_auc"]
    )

    return metrics


def train_model_set(
    name: str,
    df: pd.DataFrame,
    time_split: bool = False,
    time_col: str = "FlightDate",
) -> dict:
    """Train a complete model set (classifier + regressor) for one mode group.

    Args:
        name: Model name (e.g., "AIR" or "SURFACE")
        df: Training data with features + breached + delay_minutes
        time_split: If True, split by time (for AIR). Else random.
        time_col: Column to use for time-based splitting.

    Returns dict of metrics.
    """
    print(f"\n{'='*60}")
    print(f"[M4] Training MODEL_{name}")
    print(f"  Rows: {len(df):,}")
    print(f"  Breach rate: {df['breached'].mean():.1%}")
    print(f"  Split: {'TIME-BASED' if time_split else 'RANDOM (80/20)'}")
    print(f"{'='*60}")

    # Prepare features
    X = _prepare_features(df)
    y_cls = df["breached"].values.astype(int)
    y_reg = df["delay_minutes"].values.astype(float)

    # Encode categoricals
    X, encoders = _encode_categoricals(X, fit=True)

    # Split
    if time_split and time_col in df.columns:
        dates = pd.to_datetime(df[time_col])
        # Use 75th percentile as split point (train on earlier, test on later)
        split_date = dates.quantile(0.75)
        train_mask = dates <= split_date
        test_mask = dates > split_date
        print(f"  Time split: train <= {split_date.date()}, test > {split_date.date()}")
        print(f"  Train: {train_mask.sum():,}, Test: {test_mask.sum():,}")
    else:
        n = len(X)
        idx = np.random.RandomState(42).permutation(n)
        split = int(0.8 * n)
        train_mask = np.zeros(n, dtype=bool)
        train_mask[idx[:split]] = True
        test_mask = ~train_mask
        print(f"  Random split: Train: {train_mask.sum():,}, Test: {test_mask.sum():,}")

    X_train, X_test = X[train_mask].values, X[test_mask].values
    y_cls_train, y_cls_test = y_cls[train_mask], y_cls[test_mask]
    y_reg_train, y_reg_test = y_reg[train_mask], y_reg[test_mask]

    # ── CLASSIFIER ──
    print("\n  Training LGBMClassifier...")
    clf = lgb.LGBMClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        num_leaves=31,
        min_child_samples=50,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=0.1,
        random_state=42,
        verbose=-1,
        force_col_wise=True,
    )
    clf.fit(X_train, y_cls_train)

    # Calibrate
    print("  Calibrating with CalibratedClassifierCV (isotonic, cv=3)...")
    cal_clf = CalibratedClassifierCV(clf, cv=3, method="isotonic")
    cal_clf.fit(X_train, y_cls_train)

    # Predict on test
    y_pred_proba = cal_clf.predict_proba(X_test)[:, 1]
    y_pred = (y_pred_proba > 0.5).astype(int)

    # ── REGRESSOR ──
    print("  Training LGBMRegressor...")
    reg = lgb.LGBMRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        num_leaves=31,
        min_child_samples=50,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        verbose=-1,
        force_col_wise=True,
    )
    reg.fit(X_train, y_reg_train)

    y_reg_pred = reg.predict(X_test)
    reg_mae = np.mean(np.abs(y_reg_test - y_reg_pred))
    reg_rmse = np.sqrt(np.mean((y_reg_test - y_reg_pred) ** 2))

    # ── SHAP ──
    print("  Computing SHAP values...")
    try:
        import shap
        explainer = shap.TreeExplainer(clf)
        # Use a sample for speed
        sample_size = min(500, len(X_test))
        sample_idx = np.random.RandomState(42).choice(len(X_test), sample_size, replace=False)
        shap_values = explainer.shap_values(X_test[sample_idx])

        # Handle binary classification SHAP output
        if isinstance(shap_values, list):
            shap_vals = np.abs(shap_values[1]).mean(axis=0)
        else:
            shap_vals = np.abs(shap_values).mean(axis=0)

        # Global SHAP importances
        shap_importance = dict(zip(FEATURE_NAMES, shap_vals.tolist()))
        shap_importance = dict(sorted(shap_importance.items(),
                                       key=lambda x: x[1], reverse=True))
    except Exception as e:
        print(f"  SHAP failed: {e}")
        shap_importance = {}
        explainer = None

    # ── METRICS ──
    metrics = _compute_metrics(y_cls_test, y_pred_proba, y_pred, name.lower())
    metrics[f"{name.lower()}_reg_mae"] = float(reg_mae)
    metrics[f"{name.lower()}_reg_rmse"] = float(reg_rmse)
    metrics[f"{name.lower()}_shap_importance"] = shap_importance
    metrics[f"{name.lower()}_n_train"] = int(train_mask.sum())
    metrics[f"{name.lower()}_n_test"] = int(test_mask.sum())
    metrics[f"{name.lower()}_breach_rate"] = float(df["breached"].mean())

    if name == "AIR":
        metrics["validation_status"] = "real_weather_simulated_flights"
    else:
        metrics["validation_status"] = "simulated"

    # Print results
    print(f"\n  [{name}] METRICS:")
    print(f"    ROC-AUC:    {metrics[f'{name.lower()}_roc_auc']:.4f}")
    print(f"    PR-AUC:     {metrics[f'{name.lower()}_pr_auc']:.4f}")
    print(f"    Brier:      {metrics[f'{name.lower()}_brier']:.4f}")
    print(f"    Accuracy:   {metrics[f'{name.lower()}_accuracy']:.4f}")
    print(f"    Precision:  {metrics[f'{name.lower()}_precision']:.4f}")
    print(f"    Recall:     {metrics[f'{name.lower()}_recall']:.4f}")
    print(f"    F1:         {metrics[f'{name.lower()}_f1']:.4f}")
    print(f"    Reg MAE:    {reg_mae:.2f} min")
    print(f"    Reg RMSE:   {reg_rmse:.2f} min")
    print(f"    --- Baseline comparison ---")
    print(f"    Base AUC:   {metrics[f'{name.lower()}_baseline_roc_auc']:.4f}")
    print(f"    AUC Lift:   +{metrics[f'{name.lower()}_lift_roc_auc']:.4f}")

    if shap_importance:
        print(f"    --- Top 10 SHAP features ---")
        for i, (feat, imp) in enumerate(list(shap_importance.items())[:10]):
            print(f"    {i+1:2d}. {feat:35s} {imp:.4f}")

    # ── SAVE MODELS ──
    model_dir = MODELS_DIR / name.lower()
    model_dir.mkdir(parents=True, exist_ok=True)

    joblib.dump(cal_clf, model_dir / "classifier.joblib")
    joblib.dump(reg, model_dir / "regressor.joblib")
    joblib.dump(encoders, model_dir / "encoders.joblib")
    if explainer is not None:
        joblib.dump(explainer, model_dir / "shap_explainer.joblib")

    print(f"  Saved models to {model_dir}")

    return metrics


def train_all() -> dict:
    """Train all model sets and save combined metrics."""
    all_metrics: dict = {}

    # ── AIR MODEL (real data, time-based split) ──
    air_df = pd.read_parquet(DATA_DIR / "train_air.parquet")
    air_metrics = train_model_set("AIR", air_df, time_split=True, time_col="FlightDate")
    all_metrics.update(air_metrics)

    # Check AIR AUC threshold
    air_auc = air_metrics["air_roc_auc"]
    if air_auc < MIN_AIR_AUC:
        raise RuntimeError(
            f"FATAL: AIR ROC-AUC is {air_auc:.4f}, below minimum {MIN_AIR_AUC}. "
            f"Model is not good enough. Check data quality and features."
        )
    print(f"\n  [CHECK] AIR ROC-AUC {air_auc:.4f} >= {MIN_AIR_AUC} -- PASS")

    # ── SURFACE MODEL (simulated data, random split) ──
    surface_df = pd.read_parquet(DATA_DIR / "train_surface.parquet")
    surface_metrics = train_model_set("SURFACE", surface_df, time_split=False)
    all_metrics.update(surface_metrics)

    # ── Save combined metrics ──
    metrics_path = ARTIFACTS_DIR / "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(all_metrics, f, indent=2, default=str)
    print(f"\n  Saved metrics to {metrics_path}")

    # ── Save calibration data separately for frontend ──
    cal_data = {}
    for prefix in ["air", "surface"]:
        cal_key = f"{prefix}_calibration"
        if cal_key in all_metrics:
            cal_data[prefix] = all_metrics[cal_key]

    cal_path = ARTIFACTS_DIR / "calibration.json"
    with open(cal_path, "w") as f:
        json.dump(cal_data, f, indent=2)
    print(f"  Saved calibration to {cal_path}")

    print(f"\n{'='*60}")
    print("[M4] ALL MODELS TRAINED SUCCESSFULLY")
    print(f"{'='*60}")

    return all_metrics


if __name__ == "__main__":
    train_all()
