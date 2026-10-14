#!/usr/bin/env python3
"""Deterministic fail-closed gateway tests, with no radio/network dependencies."""
import ast
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ble-bridge"))
from ble_event_policy import GatewayVitals, HEART_RATE_TTL_SECONDS, classify_notification


class NotificationPolicyTests(unittest.TestCase):
    def test_emergency_tokens_are_exact(self):
        self.assertEqual(classify_notification("SOS"), ("sos", None))
        self.assertEqual(classify_notification(" FALL_DETECTED "), ("fall", None))
        for value in ("NO_SOS", "SOS:TEST", "SOS_EXTRA", "NO_FALL", "FALL_DETECTED_FAKE"):
            self.assertEqual(classify_notification(value), ("unknown", None))

    def test_only_bounded_heart_rate_protocol_is_accepted(self):
        for value, bpm in (("HEART_RATE:80", 80), ("HR:130", 130), ("HR:230", 230)):
            self.assertEqual(classify_notification(value), ("heart_rate", bpm))
        for value in ("80", "HR:231", "HR:29", "HEART_RATE:x", "HR:80hello",
                      "HEART_RATE:80:I2C_ERROR", "HR:-60", "XHEART_RATE:80", "HR:00100"):
            self.assertEqual(classify_notification(value), ("unknown", None))

    def test_invalidation_clears_cached_measurement_immediately(self):
        for invalid in ("VITALS:ACQUIRING", "VITALS:NO_VALID_READING",
                        "SENSOR:MAX30102:I2C_ERROR", "SENSOR:MAX30102:READY",
                        "SENSOR:MAX3010X:NOT_READY",
                        "SENSOR:MAX3010X:UNKNOWN_PART", "SENSOR:MAX30100:CONFIG_ERROR"):
            state = GatewayVitals()
            state.observe("heart_rate", 81, 100.0)
            kind, bpm = classify_notification(invalid)
            self.assertEqual(kind, "invalid", invalid)
            state.observe(kind, bpm, 101.0)
            self.assertIsNone(state.current_bpm(101.0), invalid)
            self.assertIsNone(state.current_bpm(102.0), invalid)

    def test_no_stale_bpm_on_sos_fall_or_heartbeat(self):
        state = GatewayVitals()
        state.observe("heart_rate", 76, 100)
        self.assertEqual(state.current_bpm(100 + HEART_RATE_TTL_SECONDS), 76)
        for token in ("SOS", "FALL_DETECTED", "STATUS:ONLINE"):
            kind, bpm = classify_notification(token)
            self.assertIn(kind, ("sos", "fall", "online"))
            state.observe(kind, bpm, 101)
            self.assertEqual(state.current_bpm(101), 76)
        self.assertIsNone(state.current_bpm(100 + HEART_RATE_TTL_SECONDS + 0.001))
        state.observe("heart_rate", 91, 200)
        self.assertEqual(state.current_bpm(200), 91)
        state.clear()  # Connection loss.
        self.assertIsNone(state.current_bpm(201))
        state.observe("heart_rate", 100, 400)
        self.assertIsNone(state.current_bpm(399))  # Reversed time fails closed.

    def test_other_sensor_events_do_not_clear_live_optical_bpm(self):
        state = GatewayVitals()
        state.observe("heart_rate", 72, 100)
        kind, bpm = classify_notification("SENSOR:MPU6500:I2C_ERROR")
        self.assertEqual(kind, "unknown")
        state.observe(kind, bpm, 101)
        self.assertEqual(state.current_bpm(101), 72)

    def test_real_gateway_consumes_policy_and_refuses_false_online(self):
        bridge = (ROOT / "ble-bridge/ble_bridge.py").read_text()
        ast.parse(bridge)
        self.assertIn("from ble_event_policy import GatewayVitals, classify_notification", bridge)
        self.assertIn("kind, bpm = classify_notification(raw_text)", bridge)
        self.assertIn('if kind == "invalid":', bridge)
        self.assertNotIn('if "SOS" in raw_text.upper()', bridge)
        self.assertNotIn('if "FALL" in raw_text.upper()', bridge)
        self.assertNotIn("last_known_bpm", bridge)
        self.assertIn("gateway_vitals.clear()  # New connection", bridge)
        self.assertIn("No BLE notification subscription. Refusing ONLINE heartbeats", bridge)
        self.assertLess(bridge.index("if not subscribed:"), bridge.index("heartbeat_task = asyncio.create_task(periodic_heartbeat_task(session))"))
        self.assertIn('if str(service.uuid).lower() != TARGET_SERVICE_UUID:', bridge)
        self.assertIn('if str(char.uuid).lower() != TARGET_NOTIFY_CHAR_UUID:', bridge)
        self.assertNotIn("Fallback subscription on:", bridge)
        self.assertIn("await heartbeat_task", bridge)
        self.assertIn("heartbeat_task.cancel()", bridge)
        self.assertIn("gateway_vitals.clear()", bridge)

    def test_serial_script_requires_v22_and_rejects_faults(self):
        serial = (ROOT / "ble-bridge/read_com5.ps1").read_text()
        self.assertIn("[EVIDENCE_POLICY] pulse-and-fall-diags-v22-20261014", serial)
        self.assertNotIn("single-axis-fall-v10", serial)
        self.assertIn("[ValidateRange(3, 900)]", serial)
        self.assertIn("$RequireTransportStable", serial)
        self.assertIn("[ValidateSet('Both', 'Optical', 'Mpu')]", serial)
        self.assertIn("$RequireMeasuredHeartbeat", serial)
        self.assertIn("$RequireFallEvent", serial)
        self.assertIn("Test-RelevantTransportFault -Line $Line", serial)
        self.assertIn("$script:mpuSamples -eq 0", serial)
        self.assertIn("$script:opticalSamples -eq 0", serial)
        self.assertIn("exit 6", serial)
        self.assertIn("exit 7", serial)
        self.assertIn("$OutputPath", serial)
        self.assertIn("SHARED_I2C_FAULT", serial)
        self.assertIn("PERSISTENT_I2C_FAULT", serial)
        self.assertIn("SENSOR:([^:]+):(I2C_ERROR|CONFIG_ERROR|NOT_READY|UNKNOWN_PART)", serial)
        self.assertIn("exit 4", serial)
        self.assertIn("exit 5", serial)
        self.assertIn("exit 2", serial)
        self.assertIn("$script:observationUntil = (Get-Date).AddSeconds($Seconds)", serial)
        self.assertIn("if ($script:bootMarkerCount -eq 1)", serial)
        self.assertIn("Additional firmware boot detected", serial)
        self.assertIn("$bootDeadline = (Get-Date).AddSeconds(45)", serial)


if __name__ == "__main__":
    unittest.main(verbosity=2)
