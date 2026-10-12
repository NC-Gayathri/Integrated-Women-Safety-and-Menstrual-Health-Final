"""Fail-closed, dependency-free interpretation of NAARI BLE notifications.

The physical sensor has to produce validated data; a gateway must never
continue to advertise a previous BPM after optical loss, acquisition restart
or BLE reconnection. This is not a physiological calibration.
"""
import re

HEART_RATE_TTL_SECONDS = 10.0
_HEART_RATE = re.compile(r"(?:HEART_RATE|HR):([0-9]{2,3})\Z")


def classify_notification(payload):
    """Return (kind, bpm) for one *exact* notification, never substring-match SOS."""
    value = payload.strip()
    if value == "SOS":
        return ("sos", None)
    if value == "FALL_DETECTED":
        return ("fall", None)
    if value == "STATUS:ONLINE":
        return ("online", None)
    if value in ("VITALS:ACQUIRING", "VITALS:NO_VALID_READING"):
        return ("invalid", None)
    if value.startswith("SENSOR:MAX"):
        # Even READY is followed by a fresh measurement acquisition, not a
        # guarantee that old pre-fault heart-rate values are still fresh.
        return ("invalid", None)
    match = _HEART_RATE.fullmatch(value)
    if match:
        bpm = int(match.group(1))
        if 30 <= bpm <= 230:
            return ("heart_rate", bpm)
    return ("unknown", None)


class GatewayVitals:
    def __init__(self):
        self.clear()

    def clear(self):
        self.bpm = None
        self.seen_at = None

    def observe(self, kind, bpm, now):
        if kind == "invalid":
            self.clear()
        elif kind == "heart_rate":
            self.bpm = bpm
            self.seen_at = now

    def current_bpm(self, now):
        if self.seen_at is None or self.bpm is None:
            return None
        age = now - self.seen_at
        if age < 0 or age > HEART_RATE_TTL_SECONDS:
            self.clear()
            return None
        return self.bpm
