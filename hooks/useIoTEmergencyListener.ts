import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import { IoTService, IoTEmergencyEvent } from '../services/IoTService';
import { AuthService } from '../services/AuthService';

export function useIoTEmergencyListener() {
  const [activeEmergency, setActiveEmergency] = useState<IoTEmergencyEvent | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acknowledgedIdsRef = useRef<Set<number>>(new Set());

  const checkEmergencies = useCallback(async () => {
    try {
      const loggedIn = await AuthService.isLoggedIn();
      if (!loggedIn) return;

      const emergencies = await IoTService.pollEmergencies();
      if (emergencies && emergencies.length > 0) {
        // Find the latest unacknowledged emergency
        const latest = emergencies.find((e) => !acknowledgedIdsRef.current.has(e.id));
        if (latest) {
          setActiveEmergency(latest);
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } catch (hapticErr) {
            // ignore haptic failure on web/simulator
          }
        }
      }
    } catch (error) {
      // Gracefully ignore transient network/polling errors
    }
  }, []);

  const acknowledgeActiveEmergency = useCallback(async () => {
    if (!activeEmergency) return;
    const eventId = activeEmergency.id;
    acknowledgedIdsRef.current.add(eventId);
    setActiveEmergency(null);
    try {
      await IoTService.acknowledgeEvent(eventId);
    } catch (e) {
      console.warn('Failed to acknowledge emergency on backend:', e);
    }
  }, [activeEmergency]);

  useEffect(() => {
    let isMounted = true;

    const startPolling = () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      checkEmergencies();
      pollingTimerRef.current = setInterval(checkEmergencies, 5000); // 5-second active polling
      if (isMounted) setIsPolling(true);
    };

    const stopPolling = () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      if (isMounted) setIsPolling(false);
    };

    // App state listener: Active vs Background vs Inactive
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        startPolling();
      } else {
        stopPolling();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Initial start if app is currently active
    if (AppState.currentState === 'active') {
      startPolling();
    }

    return () => {
      isMounted = false;
      stopPolling();
      subscription.remove();
    };
  }, [checkEmergencies]);

  return {
    activeEmergency,
    acknowledgeActiveEmergency,
    checkEmergencies,
    isPolling,
  };
}
