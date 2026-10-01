"""Pure drowsiness-state logic. This module has no camera or Firebase dependencies."""

from dataclasses import dataclass
from enum import Enum
from statistics import median
from typing import Optional, Sequence, Tuple


class EyeState(str, Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class SmsModePolicy:
    mode: str = "test"
    normal_enabled_at: int = 0

    @classmethod
    def from_firebase(cls, value: object) -> "SmsModePolicy":
        if not isinstance(value, dict) or value.get("mode") != "normal":
            return cls()
        enabled_at = value.get("normalEnabledAt")
        if not isinstance(enabled_at, (int, float)) or enabled_at <= 0:
            return cls()
        return cls(mode="normal", normal_enabled_at=int(enabled_at))

    def normal_active(self, now_ms: int) -> bool:
        return self.mode == "normal" and self.normal_enabled_at > 0 and now_ms >= self.normal_enabled_at


@dataclass(frozen=True)
class DetectorSettings:
    closure_duration_ms: int = 10_000
    open_eye_score: float = 0.0
    closed_eye_score: float = 1.0
    calibrated: bool = False
    revision: int = 1
    bench_test_mode: bool = True

    @classmethod
    def from_firebase(cls, value: object) -> "DetectorSettings":
        if not isinstance(value, dict):
            raise ValueError("Drowsiness configuration is missing.")
        settings = cls(
            closure_duration_ms=int(value.get("closureDurationMs", 0)),
            open_eye_score=float(value.get("openEyeScore", 0)),
            closed_eye_score=float(value.get("closedEyeScore", 0)),
            calibrated=value.get("calibrated") is True,
            revision=int(value.get("revision", 0)),
            bench_test_mode=value.get("benchTestMode") is True,
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if not 5_000 <= self.closure_duration_ms <= 120_000:
            raise ValueError("closureDurationMs must be between 5000 and 120000.")
        if self.revision < 1:
            raise ValueError("revision must be a positive integer.")
        if not self.bench_test_mode:
            raise ValueError("benchTestMode must remain enabled during Phase 1.")
        if not 0.0 <= self.open_eye_score <= 1.0:
            raise ValueError("openEyeScore must be between 0 and 1.")
        if not 0.0 <= self.closed_eye_score <= 1.0:
            raise ValueError("closedEyeScore must be between 0 and 1.")
        if self.calibrated and self.closed_eye_score - self.open_eye_score < 0.15:
            raise ValueError("Open/closed calibration separation is too small.")

    @property
    def open_boundary(self) -> float:
        return self.open_eye_score + (self.closed_eye_score - self.open_eye_score) * 0.35

    @property
    def closed_boundary(self) -> float:
        return self.closed_eye_score - (self.closed_eye_score - self.open_eye_score) * 0.35


def classify_eye_scores(
    left_score: Optional[float], right_score: Optional[float], settings: DetectorSettings
) -> EyeState:
    """Classify only high-confidence agreement; disagreement/absence is UNKNOWN."""
    if not settings.calibrated or left_score is None or right_score is None:
        return EyeState.UNKNOWN
    if not (0.0 <= left_score <= 1.0 and 0.0 <= right_score <= 1.0):
        return EyeState.UNKNOWN
    if max(left_score, right_score) <= settings.open_boundary:
        return EyeState.OPEN
    if min(left_score, right_score) >= settings.closed_boundary:
        return EyeState.CLOSED
    return EyeState.UNKNOWN


def calibration_values(
    open_samples: Sequence[Tuple[float, float]],
    closed_samples: Sequence[Tuple[float, float]],
    minimum_samples: int = 10,
) -> Tuple[float, float]:
    if len(open_samples) < minimum_samples or len(closed_samples) < minimum_samples:
        raise ValueError("Not enough valid face/eye samples for calibration.")
    open_score = median((left + right) / 2.0 for left, right in open_samples)
    closed_score = median((left + right) / 2.0 for left, right in closed_samples)
    if closed_score - open_score < 0.15:
        raise ValueError("Calibration could not clearly separate open and closed eyes.")
    return round(open_score, 4), round(closed_score, 4)


class ClosureEpisodeTracker:
    """Emits once after a continuous CLOSED period; only OPEN rearms an episode."""

    def __init__(self, closure_duration_ms: int, start_armed: bool = True):
        self.closure_duration_ms = closure_duration_ms
        self.closed_since_ms: Optional[int] = None
        self.armed = start_armed

    def apply_duration(self, closure_duration_ms: int) -> None:
        self.closure_duration_ms = closure_duration_ms
        self.closed_since_ms = None

    def disarm_until_open(self) -> None:
        self.closed_since_ms = None
        self.armed = False

    def observe(self, state: EyeState, now_ms: int) -> Optional[int]:
        if state is EyeState.OPEN:
            self.closed_since_ms = None
            self.armed = True
            return None
        if state is EyeState.UNKNOWN:
            # UNKNOWN breaks continuity but cannot rearm a previously fired episode.
            self.closed_since_ms = None
            return None
        if not self.armed:
            return None
        if self.closed_since_ms is None:
            self.closed_since_ms = now_ms
            return None
        elapsed = now_ms - self.closed_since_ms
        if elapsed > self.closure_duration_ms:
            self.armed = False
            return elapsed
        return None

    def elapsed_ms(self, now_ms: int) -> int:
        return 0 if self.closed_since_ms is None else max(0, now_ms - self.closed_since_ms)


def camera_failure_state(_error: BaseException) -> EyeState:
    """Camera/network/decode failures are never evidence of closed eyes."""
    return EyeState.UNKNOWN
