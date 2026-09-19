import { apiClient } from './ApiService';

export interface IoTDeviceStatus {
  isConfigured: boolean;
  isOnline: boolean;
  device?: {
    id: number;
    deviceId: string;
    deviceName: string;
    batteryLevel?: number | null;
    status: string;
    lastHeartRate?: number | null;
    lastFallDetected?: boolean;
    lastSeen?: string | null;
  } | null;
  activeEmergenciesCount: number;
}

export interface IoTEmergencyEvent {
  id: number;
  event_id: string;
  device_id: string;
  user_id: number;
  event_type: 'BUTTON_SOS' | 'FALL_DETECTED' | 'HEART_RATE_EMERGENCY' | 'STATUS_HEARTBEAT';
  heart_rate?: number | null;
  fall_detected?: boolean;
  battery_level?: number | null;
  is_emergency: boolean;
  status: 'TRIGGERED' | 'ACKNOWLEDGED' | 'RESOLVED';
  created_at?: string;
}

export const IoTService = {
  /**
   * Fetches the current user's paired device info and real-time connectivity status.
   */
  getDeviceStatus: async (): Promise<IoTDeviceStatus> => {
    const res = await apiClient.get('/iot/devices/status');
    return res.data?.data || res.data;
  },

  /**
   * Polls active unacknowledged emergency alerts for the logged-in user.
   */
  pollEmergencies: async (): Promise<IoTEmergencyEvent[]> => {
    const res = await apiClient.get('/iot/events/emergency-poll');
    return res.data?.data || [];
  },

  /**
   * Acknowledges / dismisses an IoT emergency event so it stops alerting.
   */
  acknowledgeEvent: async (eventId: number | string): Promise<any> => {
    const res = await apiClient.post(`/iot/events/${eventId}/ack`);
    return res.data?.data || res.data;
  },

  /**
   * Pairs an ESP32 wearable device ID with the current user account.
   */
  pairDevice: async (payload: { deviceId: string; deviceName?: string; deviceApiKey?: string }): Promise<any> => {
    const res = await apiClient.post('/iot/devices/pair', payload);
    return res.data?.data || res.data;
  },

  /**
   * Unpairs an IoT device from the user account.
   */
  unpairDevice: async (deviceId: string): Promise<any> => {
    const res = await apiClient.delete(`/iot/devices/${deviceId}`);
    return res.data;
  },

  /**
   * Ingests an IoT event into the backend database.
   */
  ingestEvent: async (payload: {
    deviceId: string;
    apiKey?: string;
    eventId: string;
    eventType: 'BUTTON_SOS' | 'FALL_DETECTED' | 'HEART_RATE_EMERGENCY' | 'STATUS_HEARTBEAT';
    heartRate?: number;
    fallDetected?: boolean;
    batteryLevel?: number;
  }): Promise<any> => {
    const res = await apiClient.post('/iot/events', payload);
    return res.data?.data || res.data;
  },
};
