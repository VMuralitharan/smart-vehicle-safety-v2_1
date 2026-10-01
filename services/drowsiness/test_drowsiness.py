import unittest

from drowsiness_core import (
    ClosureEpisodeTracker,
    DetectorSettings,
    EyeState,
    SmsModePolicy,
    calibration_values,
    camera_failure_state,
    classify_eye_scores,
)
from drowsiness_service import CameraFrameError, MediaPipeEyeDetector, build_drowsiness_incident


class ClosureTests(unittest.TestCase):
    def test_five_second_closure_does_not_trigger(self):
        tracker = ClosureEpisodeTracker(10_000)
        self.assertIsNone(tracker.observe(EyeState.CLOSED, 0))
        self.assertIsNone(tracker.observe(EyeState.CLOSED, 5_000))

    def test_more_than_ten_seconds_triggers_once(self):
        tracker = ClosureEpisodeTracker(10_000)
        tracker.observe(EyeState.CLOSED, 1_000)
        self.assertIsNone(tracker.observe(EyeState.CLOSED, 11_000))
        self.assertEqual(tracker.observe(EyeState.CLOSED, 11_001), 10_001)
        self.assertIsNone(tracker.observe(EyeState.CLOSED, 20_000))

    def test_open_rearms_after_fired_episode(self):
        tracker = ClosureEpisodeTracker(10_000)
        tracker.observe(EyeState.CLOSED, 0)
        self.assertEqual(tracker.observe(EyeState.CLOSED, 10_001), 10_001)
        self.assertIsNone(tracker.observe(EyeState.UNKNOWN, 11_000))
        self.assertIsNone(tracker.observe(EyeState.CLOSED, 12_000))
        tracker.observe(EyeState.OPEN, 13_000)
        tracker.observe(EyeState.CLOSED, 14_000)
        self.assertEqual(tracker.observe(EyeState.CLOSED, 24_001), 10_001)

    def test_restart_requires_open_before_arming(self):
        tracker = ClosureEpisodeTracker(10_000, start_armed=False)
        tracker.observe(EyeState.CLOSED, 0)
        self.assertIsNone(tracker.observe(EyeState.CLOSED, 20_000))
        tracker.observe(EyeState.OPEN, 21_000)
        tracker.observe(EyeState.CLOSED, 22_000)
        self.assertEqual(tracker.observe(EyeState.CLOSED, 32_001), 10_001)

    def test_mode_change_requires_open_before_rearming(self):
        tracker = ClosureEpisodeTracker(10_000)
        tracker.observe(EyeState.CLOSED, 0)
        tracker.disarm_until_open()
        self.assertIsNone(tracker.observe(EyeState.CLOSED, 20_000))
        tracker.observe(EyeState.OPEN, 21_000)
        tracker.observe(EyeState.CLOSED, 22_000)
        self.assertEqual(tracker.observe(EyeState.CLOSED, 32_001), 10_001)

    def test_sms_policy_never_retroactively_eligibilizes_test_incident(self):
        test_value = build_drowsiness_incident(10_001, 7, SmsModePolicy(), 1_000)
        normal_value = build_drowsiness_incident(10_001, 7, SmsModePolicy('normal', 2_000), 2_001)
        self.assertEqual((test_value['type'], test_value['isTest'], test_value['smsSuppressed']), ('other', True, True))
        self.assertEqual((normal_value['type'], normal_value['source'], normal_value['isTest'], normal_value['smsSuppressed']),
                         ('drowsiness', 'esp32cam_drowsiness', False, False))
        self.assertFalse(SmsModePolicy('normal', 2_000).normal_active(1_999))

    def test_missing_face_breaks_continuous_closure(self):
        tracker = ClosureEpisodeTracker(10_000)
        tracker.observe(EyeState.CLOSED, 0)
        tracker.observe(EyeState.UNKNOWN, 9_000)
        tracker.observe(EyeState.CLOSED, 10_000)
        self.assertIsNone(tracker.observe(EyeState.CLOSED, 15_000))

    def test_camera_disconnection_is_unknown(self):
        detector = object.__new__(MediaPipeEyeDetector)
        def disconnected():
            raise CameraFrameError("offline")
        detector.eye_scores = disconnected
        settings = DetectorSettings(calibrated=True)
        state, scores, code = detector.classify(settings)
        self.assertEqual((state, scores, code), (EyeState.UNKNOWN, None, "CAMERA_UNAVAILABLE"))

    def test_missing_face_is_unknown(self):
        detector = object.__new__(MediaPipeEyeDetector)
        detector.eye_scores = lambda: None
        settings = DetectorSettings(calibrated=True)
        state, scores, code = detector.classify(settings)
        self.assertEqual((state, scores, code), (EyeState.UNKNOWN, None, "FACE_OR_EYES_NOT_CONFIDENT"))

    def test_ambiguous_or_missing_scores_are_unknown(self):
        settings = DetectorSettings(
            closure_duration_ms=10_000,
            open_eye_score=0.1,
            closed_eye_score=0.9,
            calibrated=True,
        )
        self.assertEqual(classify_eye_scores(None, None, settings), EyeState.UNKNOWN)
        self.assertEqual(classify_eye_scores(0.2, 0.8, settings), EyeState.UNKNOWN)
        self.assertEqual(classify_eye_scores(0.1, 0.1, settings), EyeState.OPEN)
        self.assertEqual(classify_eye_scores(0.9, 0.9, settings), EyeState.CLOSED)

    def test_guided_calibration_requires_separation(self):
        self.assertEqual(
            calibration_values([(0.1, 0.1)] * 10, [(0.9, 0.9)] * 10), (0.1, 0.9)
        )
        with self.assertRaises(ValueError):
            calibration_values([(0.4, 0.4)] * 10, [(0.45, 0.45)] * 10)


if __name__ == "__main__":
    unittest.main()
