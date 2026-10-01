"""ESP32-CAM Phase 1 drowsiness service.

JPEG frames are fetched from /capture, decoded and classified in memory only.
No image or video data is displayed, recorded, or uploaded to Firebase.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from drowsiness_core import (
    ClosureEpisodeTracker,
    DetectorSettings,
    EyeState,
    SmsModePolicy,
    calibration_values,
    camera_failure_state,
    classify_eye_scores,
)

DEFAULT_CONFIG = {
    "closureDurationMs": 10_000,
    "openEyeScore": 0.0,
    "closedEyeScore": 1.0,
    "calibrated": False,
    "revision": 1,
    "benchTestMode": True,
}


class CameraFrameError(RuntimeError):
    pass


class MediaPipeEyeDetector:
    def __init__(self, camera_url: str, model_path: str, timeout_seconds: float = 5.0):
        try:
            import cv2
            import mediapipe as mp
            import numpy as np
            import requests
        except ImportError as error:
            raise RuntimeError("Install requirements-drowsiness.txt before starting the service.") from error

        self.cv2 = cv2
        self.mp = mp
        self.np = np
        self.requests = requests
        self.camera_url = camera_url
        self.timeout_seconds = timeout_seconds
        self.session = requests.Session()

        model = Path(model_path)
        if not model.is_file():
            raise RuntimeError(f"Face Landmarker model not found: {model}")
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.70,
            min_face_presence_confidence=0.70,
            min_tracking_confidence=0.70,
            output_face_blendshapes=True,
        )
        self.landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)

    def close(self) -> None:
        self.landmarker.close()
        self.session.close()

    def fetch_frame(self):
        try:
            response = self.session.get(
                self.camera_url,
                timeout=(2.0, self.timeout_seconds),
                headers={"Accept": "image/jpeg", "Cache-Control": "no-cache"},
            )
            response.raise_for_status()
        except self.requests.RequestException as error:
            raise CameraFrameError(f"Camera connection failed: {error}") from error
        content = response.content
        if not content or len(content) > 2_000_000:
            raise CameraFrameError("Camera returned an empty or oversized frame.")
        encoded = self.np.frombuffer(content, dtype=self.np.uint8)
        frame_bgr = self.cv2.imdecode(encoded, self.cv2.IMREAD_COLOR)
        if frame_bgr is None:
            raise CameraFrameError("Camera response was not a valid JPEG image.")
        return self.cv2.cvtColor(frame_bgr, self.cv2.COLOR_BGR2RGB)

    def eye_scores(self) -> Optional[Tuple[float, float]]:
        frame_rgb = self.fetch_frame()
        image = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=frame_rgb)
        result = self.landmarker.detect(image)
        if len(result.face_landmarks) != 1 or len(result.face_blendshapes) != 1:
            return None
        scores = {item.category_name: float(item.score) for item in result.face_blendshapes[0]}
        left = scores.get("eyeBlinkLeft")
        right = scores.get("eyeBlinkRight")
        if left is None or right is None:
            return None
        return left, right

    def classify(self, settings: DetectorSettings) -> Tuple[EyeState, Optional[Tuple[float, float]], str]:
        try:
            scores = self.eye_scores()
            if scores is None:
                return EyeState.UNKNOWN, None, "FACE_OR_EYES_NOT_CONFIDENT"
            return classify_eye_scores(scores[0], scores[1], settings), scores, "OK"
        except CameraFrameError as error:
            return camera_failure_state(error), None, "CAMERA_UNAVAILABLE"
        except Exception:
            return EyeState.UNKNOWN, None, "DETECTION_ERROR"


class FirebaseBackend:
    def __init__(self, service_account: str, database_url: str, vehicle_id: str):
        import firebase_admin
        from firebase_admin import credentials, db

        if not firebase_admin._apps:
            firebase_admin.initialize_app(
                credentials.Certificate(service_account), {"databaseURL": database_url}
            )
        self.db = db
        self.vehicle_id = vehicle_id
        if not db.reference(f"vehicles/{vehicle_id}/meta").get():
            raise RuntimeError("Vehicle ID was not found in Firebase.")
        self.config_ref = db.reference(f"deviceConfig/{vehicle_id}/drowsiness")
        self.status_ref = db.reference(f"deviceData/{vehicle_id}/drowsinessStatus")
        self.calibration_status_ref = db.reference(
            f"deviceData/{vehicle_id}/drowsinessCalibrationStatus"
        )
        self.calibration_requests_ref = db.reference(
            f"drowsinessCalibrationRequests/{vehicle_id}"
        )
        self.incidents_ref = db.reference(f"deviceData/{vehicle_id}/incidents")
        self.sms_config_ref = db.reference(f"smsSettings/{vehicle_id}/config")

    def ensure_default_config(self) -> None:
        self.config_ref.transaction(lambda current: DEFAULT_CONFIG if current is None else current)

    def read_settings(self) -> DetectorSettings:
        return DetectorSettings.from_firebase(self.config_ref.get())

    def read_sms_policy(self) -> SmsModePolicy:
        return SmsModePolicy.from_firebase(self.sms_config_ref.get())

    def report_applied(self, settings: DetectorSettings) -> None:
        self.status_ref.update(
            {
                "state": "applied" if settings.calibrated else "awaiting_calibration",
                "appliedRevision": settings.revision,
                "closureDurationMs": settings.closure_duration_ms,
                "calibrated": settings.calibrated,
                "benchTestMode": True,
                "appliedAt": int(time.time() * 1000),
            }
        )

    def report_runtime(
        self, state: EyeState, elapsed_ms: int, result_code: str, settings: DetectorSettings
    ) -> None:
        self.status_ref.update(
            {
                "eyeState": state.value,
                "closureElapsedMs": elapsed_ms,
                "cameraConnected": result_code != "CAMERA_UNAVAILABLE",
                "resultCode": result_code,
                "appliedRevision": settings.revision,
                "updatedAt": int(time.time() * 1000),
            }
        )

    def newest_pending_calibration(self, not_before_ms: int) -> Optional[Tuple[str, Dict[str, Any]]]:
        values = self.calibration_requests_ref.get() or {}
        pending = [
            (request_id, value)
            for request_id, value in values.items()
            if isinstance(value, dict)
            and "processedAt" not in value
            and int(value.get("requestedAt", 0)) >= not_before_ms
        ]
        return max(pending, key=lambda item: int(item[1].get("requestedAt", 0))) if pending else None

    def calibration_status(self, request_id: str, state: str, instruction: str, **extra: Any) -> None:
        value = {
            "requestId": request_id,
            "state": state,
            "instruction": instruction,
            "updatedAt": int(time.time() * 1000),
            **extra,
        }
        self.calibration_status_ref.set(value)

    def finish_calibration_request(self, request_id: str, state: str) -> None:
        self.calibration_requests_ref.child(request_id).update(
            {"processedAt": int(time.time() * 1000), "result": state}
        )

    def save_calibration(self, open_score: float, closed_score: float) -> DetectorSettings:
        def apply(current: object):
            base = dict(current) if isinstance(current, dict) else dict(DEFAULT_CONFIG)
            return {
                **base,
                "openEyeScore": open_score,
                "closedEyeScore": closed_score,
                "calibrated": True,
                "benchTestMode": True,
                "revision": int(base.get("revision", 0)) + 1,
            }

        saved = self.config_ref.transaction(apply)
        return DetectorSettings.from_firebase(saved)

    def create_drowsiness_incident(self, elapsed_ms: int, settings: DetectorSettings, policy: SmsModePolicy) -> str:
        now = int(time.time() * 1000)
        value = build_drowsiness_incident(elapsed_ms, settings.revision, policy, now)
        location = self.db.reference(f"deviceData/{self.vehicle_id}/location").get() or {}
        if (
            isinstance(location.get("latitude"), (int, float))
            and isinstance(location.get("longitude"), (int, float))
            and isinstance(location.get("updatedAt"), (int, float))
            and now - int(location["updatedAt"]) <= 300_000
        ):
            value.update(
                latitude=location["latitude"],
                longitude=location["longitude"],
                locationUpdatedAt=location["updatedAt"],
            )
        return self.incidents_ref.push(value).key


def build_drowsiness_incident(elapsed_ms: int, settings_revision: int, policy: SmsModePolicy, now_ms: int) -> Dict[str, Any]:
    normal = policy.normal_active(now_ms)
    return {
        # Test provenance remains immutable, so enabling NORMAL SMS later cannot
        # make an older Phase 1 incident eligible.
        "type": "drowsiness" if normal else "other",
        "eventType": "drowsiness",
        "source": "esp32cam_drowsiness" if normal else "esp32cam_phase1",
        "createdAt": now_ms,
        "isTest": not normal,
        "smsSuppressed": not normal,
        "durationMs": elapsed_ms,
        "settingsRevision": settings_revision,
        "message": (
            f"Driver eyes remained continuously closed for {elapsed_ms / 1000.0:.1f} seconds."
            if normal else
            f"TEST ONLY: Driver eyes remained continuously closed for {elapsed_ms / 1000.0:.1f} seconds. No emergency response required."
        ),
    }


def collect_calibration_samples(
    detector: MediaPipeEyeDetector,
    backend: FirebaseBackend,
    request_id: str,
    phase: str,
    seconds: int = 5,
) -> List[Tuple[float, float]]:
    instruction = "Keep both eyes naturally open." if phase == "open" else "Keep both eyes gently closed."
    backend.calibration_status(request_id, f"prepare_{phase}", instruction)
    time.sleep(3)
    backend.calibration_status(request_id, f"sampling_{phase}", instruction)
    samples: List[Tuple[float, float]] = []
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            scores = detector.eye_scores()
            if scores is not None:
                samples.append(scores)
        except Exception:
            pass
        time.sleep(0.2)
    return samples


def run_guided_calibration(
    detector: MediaPipeEyeDetector, backend: FirebaseBackend, request_id: str
) -> Optional[DetectorSettings]:
    try:
        open_samples = collect_calibration_samples(detector, backend, request_id, "open")
        closed_samples = collect_calibration_samples(detector, backend, request_id, "closed")
        open_score, closed_score = calibration_values(open_samples, closed_samples)
        settings = backend.save_calibration(open_score, closed_score)
        backend.report_applied(settings)
        backend.calibration_status(
            request_id,
            "complete",
            "Calibration applied successfully.",
            appliedRevision=settings.revision,
            openEyeScore=open_score,
            closedEyeScore=closed_score,
        )
        backend.finish_calibration_request(request_id, "complete")
        return settings
    except Exception as error:
        backend.calibration_status(request_id, "failed", str(error)[:180])
        backend.finish_calibration_request(request_id, "failed")
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TEST ONLY ESP32-CAM drowsiness detector")
    parser.add_argument("--vehicle-id", required=True)
    parser.add_argument("--camera-url", required=True, help="ESP32-CAM JPEG /capture URL")
    parser.add_argument("--service-account", required=True)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--model", required=True, help="Local face_landmarker.task file")
    parser.add_argument("--fps", type=float, default=2.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 0.5 <= args.fps <= 5.0:
        raise RuntimeError("--fps must be between 0.5 and 5.0")
    backend = FirebaseBackend(
        os.path.abspath(args.service_account), args.database_url, args.vehicle_id
    )
    backend.ensure_default_config()
    settings = backend.read_settings()
    sms_policy = backend.read_sms_policy()
    backend.report_applied(settings)
    detector = MediaPipeEyeDetector(args.camera_url, args.model)
    # A restart during an existing closure must not create a second event.
    # Require a confidently OPEN observation before timing the next episode.
    tracker = ClosureEpisodeTracker(settings.closure_duration_ms, start_armed=False)
    started_at_ms = int(time.time() * 1000)
    last_config_poll = 0.0
    last_status_write = 0.0
    print(f"Drowsiness service ready for {args.vehicle_id}; SMS mode={sms_policy.mode}.")
    try:
        while True:
            loop_started = time.monotonic()
            if loop_started - last_config_poll >= 2.0:
                latest = backend.read_settings()
                if latest.revision != settings.revision:
                    settings = latest
                    tracker.apply_duration(settings.closure_duration_ms)
                    backend.report_applied(settings)
                    print(f"Applied drowsiness settings revision {settings.revision}.")
                latest_policy = backend.read_sms_policy()
                if latest_policy != sms_policy:
                    sms_policy = latest_policy
                    # A closure begun under the previous mode cannot cross the
                    # activation boundary. A confidently OPEN frame must rearm it.
                    tracker.disarm_until_open()
                    print(f"Applied SMS mode={sms_policy.mode}; waiting for OPEN before rearming.")
                last_config_poll = loop_started

            pending = backend.newest_pending_calibration(started_at_ms - 300_000)
            if pending:
                calibrated = run_guided_calibration(detector, backend, pending[0])
                if calibrated:
                    settings = calibrated
                    tracker.apply_duration(settings.closure_duration_ms)
                continue

            state, _scores, result_code = detector.classify(settings)
            now_ms = int(time.monotonic() * 1000)
            elapsed = tracker.elapsed_ms(now_ms)
            event_duration = tracker.observe(state, now_ms)
            if event_duration is not None:
                incident_id = backend.create_drowsiness_incident(event_duration, settings, sms_policy)
                print(f"{sms_policy.mode.upper()} drowsiness incident created: {incident_id}")

            if loop_started - last_status_write >= 1.0:
                backend.report_runtime(state, tracker.elapsed_ms(now_ms), result_code, settings)
                last_status_write = loop_started

            time.sleep(max(0.0, 1.0 / args.fps - (time.monotonic() - loop_started)))
    except KeyboardInterrupt:
        print("Drowsiness service stopped.")
        return 0
    finally:
        detector.close()


if __name__ == "__main__":
    sys.exit(main())
