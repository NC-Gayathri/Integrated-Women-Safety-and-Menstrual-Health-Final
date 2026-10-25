import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import { IoTService, IoTEmergencyEvent } from '../services/IoTService';
import { AuthService } from '../services/AuthService';
import { bleService, BleTelemetryEvent } from '../services/BleService';

/**
 * This hook is mounted ONCE by (tabs)/_layout, not by the Safety tab.
 *
 * Foreground, connected ESP32 => exact BLE "SOS" notification => immediate
 * in-app alert, independent of mobile data, IoT pairing and backend ingest.
 * The authenticated backend poll remains a separate, best-effort path.
 * No background/locked-phone delivery, contact dialing or phone call is
 * claimed without observing those actions on a physical phone.
 */
export function useIoTEmergencyListener() {
  const [activeEmergency, setActiveEmergency] = useState<IoTEmergencyEvent | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acknowledgedIdsRef = useRef<Set<number>>(new Set());
  const ignoredDuplicateRemoteIds = useRef<Set<number>>(new Set());
  const recentLocalRef = useRef<{ type: 'BUTTON_SOS' | 'FALL_DETECTED'; time: number } | null>(null);
  // Negative IDs never collide with the positive auto-increment server IDs.
  const localSequence = useRef(0);

  const onBleEvent = useCallback((event: BleTelemetryEvent) => {
    if (event.type !== 'BUTTON_SOS' && event.type !== 'FALL_DETECTED') return;
    const type = event.type;
    const now = Date.now();
    const previous = recentLocalRef.current;
    // Reject repeated native delivery of one button/fall burst; never reject a
    // separate SOS because the backend, sensors or internet happen to be down.
    if (previous && previous.type === type && now - previous.time < 2500) return;
    recentLocalRef.current = { type, time: now };
    localSequence.current += 1;
    const localEmergency: IoTEmergencyEvent = {
      id: -localSequence.current,
      event_id: 'LOCAL_BLE_' + now + '_' + localSequence.current,
      device_id: bleService.targetDeviceName,
      user_id: 0, // Local alert; no server identity has been asserted.
      event_type: type,
      is_emergency: true,
      status: 'TRIGGERED',
      created_at: new Date(now).toISOString(),
      fall_detected: type === 'FALL_DETECTED',
    };
    // Immediate in-app presentation: do NOT wait for a network round trip.
    setActiveEmergency(localEmergency);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  const checkEmergencies = useCallback(async () => {
    try {
      if (!(await AuthService.isLoggedIn())) return;
      const emergencies = await IoTService.pollEmergencies();
      if (!Array.isArray(emergencies)) return;

      for (const event of emergencies) {
        if (acknowledgedIdsRef.current.has(event.id) ||
            ignoredDuplicateRemoteIds.current.has(event.id)) continue;

        // A single BLE trigger can also arrive later as a backend event.
        // Suppress that *duplicate* without confusing it with a separate SOS.
        const local = recentLocalRef.current;
        const serverTime = event.created_at ? Date.parse(event.created_at) : NaN;
        if (local && event.event_type === local.type &&
            Number.isFinite(serverTime) &&
            Math.abs(serverTime - local.time) <= 15000) {
          ignoredDuplicateRemoteIds.current.add(event.id);
          continue;
        }

        setActiveEmergency(current => current ?? event);
        break;
      }
    } catch {
      // Network failure must not prevent direct BLE alert presentation.
    }
  }, []);

  const acknowledgeActiveEmergency = useCallback(async () => {
    if (!activeEmergency) return;
    const eventId = activeEmergency.id;
    acknowledgedIdsRef.current.add(eventId);
    setActiveEmergency(null);
    // The local negative ID has never been written to the server.
    if (eventId < 0) return;
    try {
      await IoTService.acknowledgeEvent(eventId);
    } catch (e) {
      console.warn('Could not acknowledge remote emergency event:', e);
    }
  }, [activeEmergency]);

  useEffect(() => {
    let mounted = true;

    // Register BEFORE BLE scanning. Subscription persists across tab switches.
    const removeBleListener = bleService.addEventListener(onBleEvent);

    const start = () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      void bleService.startScanAndConnect();
      void checkEmergencies();
      pollingTimerRef.current = setInterval(() => void checkEmergencies(), 5000);
      if (mounted) setIsPolling(true);
    };
    const stop = () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
      if (mounted) setIsPolling(false);
    };
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') start();
      else stop();
    });
    if (AppState.currentState === 'active') start();

    return () => {
      mounted = false;
      stop();
      subscription.remove();
      removeBleListener();
      // BLE stays owned by the singleton; another login/tab mount can reuse it.
    };
  }, [checkEmergencies, onBleEvent]);

  return { activeEmergency, acknowledgeActiveEmergency, checkEmergencies, isPolling };
}
