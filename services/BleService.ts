import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { IoTService } from './IoTService';

// Determine if running inside standard Expo Go client or if native module is absent
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo' ||
  !NativeModules?.BleClientManager;

// Safely require BleManager only in bare/development client builds where native module is compiled
let BleManagerClass: any = null;
if (!isExpoGo) {
  try {
    const BleModule = require('react-native-ble-plx');
    BleManagerClass = BleModule.BleManager;
  } catch (e) {
    console.log('[BLE] react-native-ble-plx native module not linked in current JS environment.');
  }
}

// -----------------------------------------------------------------------------------------
// RIGOROUS CONNECTION STATE MACHINE
// -----------------------------------------------------------------------------------------
export type BleDetailedState =
  | 'DISCONNECTED'
  | 'SCANNING FOR ESP32'
  | 'ESP32 FOUND'
  | 'CONNECTING'
  | 'CONNECTED - WAITING FOR ESP32 DATA'
  | 'SUBSCRIBED TO SENSOR NOTIFICATIONS'
  | 'ESP32 ONLINE'
  | 'RECEIVING SENSOR DATA'
  | 'ERROR';

export interface BleTelemetryEvent {
  type:
    | 'STATUS_ONLINE'
    | 'HEARTBEAT'
    | 'SPO2'
    | 'SENSOR_STATUS'
    | 'VITALS_STATUS'
    | 'FALL_DETECTED'
    | 'BUTTON_SOS'
    | 'RAW';
  bpm?: number;
  spo2?: number;
  sensorStatus?: string;
  vitalsStatus?: string;
  fallDetected?: boolean;
  rawPayload: string;
  timestamp: number;
}

export interface BleDiagnosticInfo {
  bluetoothConnected: boolean;
  esp32Found: boolean;
  gattConnected: boolean;
  serviceFound: boolean;
  characteristicFound: boolean;
  notificationsSubscribed: boolean;
  lastRawMessage: string;
  lastHeartbeat: number | null;
  lastSpO2: number | null;
  lastSensorEvent: string;
  totalPacketsReceived: number;
  isNativeBleAvailable: boolean;
}

export type BleEventListener = (event: BleTelemetryEvent) => void;
export type BleStatusListener = (state: BleDetailedState, details?: string) => void;
export type BleDiagnosticListener = (diag: BleDiagnosticInfo) => void;

// -----------------------------------------------------------------------------------------
// BASE64 TO UTF-8 DECODER
// -----------------------------------------------------------------------------------------
function decodeBase64ToUtf8(base64: string): string {
  if (!base64) return '';
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = base64.replace(/=+$/, '');
    let output = '';

    if (str.length % 4 === 1) {
      return base64;
    }

    for (
      let bc = 0, bs = 0, buffer: number, idx = 0;
      (buffer = str.charCodeAt(idx++));
      ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
        ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
        : 0
    ) {
      buffer = chars.indexOf(String.fromCharCode(buffer));
    }

    return output.trim();
  } catch (e) {
    return base64;
  }
}

class BleService {
  private manager: any = null;
  private connectedDevice: any = null;
  private charSubscription: any = null;
  private connectionState: BleDetailedState = 'DISCONNECTED';
  private eventListeners: Set<BleEventListener> = new Set();
  private statusListeners: Set<BleStatusListener> = new Set();
  private diagnosticListeners: Set<BleDiagnosticListener> = new Set();
  private scanTimeoutRef: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimerRef: ReturnType<typeof setTimeout> | null = null;

  // EXACT ESP32 Hardware BLE Configuration
  public readonly targetDeviceName = 'NAARI_KAVACH';
  public readonly targetServiceUUID = '12345678-1234-1234-1234-1234567890ab'.toLowerCase();
  public readonly targetCharUUID = '87654321-4321-4321-4321-ba0987654321'.toLowerCase();

  // Diagnostics & Hardware Telemetry
  public diagnostics: BleDiagnosticInfo = {
    bluetoothConnected: false,
    esp32Found: false,
    gattConnected: false,
    serviceFound: false,
    characteristicFound: false,
    notificationsSubscribed: false,
    lastRawMessage: 'None',
    lastHeartbeat: null,
    lastSpO2: null,
    lastSensorEvent: 'None',
    totalPacketsReceived: 0,
    isNativeBleAvailable: !isExpoGo && !!NativeModules?.BleClientManager,
  };

  public isEsp32Online: boolean = false;
  public latestBpm: number | null = null;
  public latestSpO2: number | null = null;
  public lastFallDetected: boolean = false;
  public lastEventTime: number = 0;
  public readonly isBleSupported: boolean = !isExpoGo && !!NativeModules?.BleClientManager;

  constructor() {
    if (this.isBleSupported && BleManagerClass) {
      try {
        this.manager = new BleManagerClass();
        console.log('[BLE] BleManager initialized successfully in Development Client build.');
      } catch (e: any) {
        console.warn('[BLE] BleManager instantiation failed:', e.message);
        this.manager = null;
      }
    } else {
      console.log(
        '[BLE] Running in Expo Go. Native BLE scanning is inactive (requires an Expo Development Build: "npx expo run:android"). Authentication, Google Sign-In, and cloud telemetry remain fully operational.'
      );
    }
  }

  /**
   * Returns true if native BLE client is available in current runtime.
   */
  public isAvailable(): boolean {
    return !!this.manager;
  }

  // ---------------------------------------------------------------------------------------
  // 1. ANDROID RUNTIME PERMISSIONS
  // ---------------------------------------------------------------------------------------
  public async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const scanOk = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
        const connectOk = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
        const locOk = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

        console.log(`[BLE] Android 12+ Permissions: Scan=${scanOk}, Connect=${connectOk}, Location=${locOk}`);
        return scanOk && connectOk;
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn('[BLE] Error requesting Android permissions:', err);
      return false;
    }
  }

  // ---------------------------------------------------------------------------------------
  // 2. SCAN & NAME-BASED DISCOVERY
  // ---------------------------------------------------------------------------------------
  public async startScanAndConnect(): Promise<void> {
    if (!this.manager) {
      console.log('[BLE] Scan skipped: Native BLE is not available in Expo Go. Use BLE bridge or run an Expo Development Build.');
      return;
    }

    if (
      this.connectionState === 'CONNECTING' ||
      this.connectionState === 'ESP32 ONLINE' ||
      this.connectionState === 'RECEIVING SENSOR DATA' ||
      this.connectionState === 'SUBSCRIBED TO SENSOR NOTIFICATIONS'
    ) {
      console.log(`[BLE] Current state is already active: ${this.connectionState}`);
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      this.updateStatus('ERROR', 'Bluetooth permissions denied.');
      return;
    }

    console.log(`[BLE] Scanning for ${this.targetDeviceName}`);
    this.updateStatus('SCANNING FOR ESP32');

    if (this.scanTimeoutRef) clearTimeout(this.scanTimeoutRef);
    this.scanTimeoutRef = setTimeout(() => {
      if (this.connectionState === 'SCANNING FOR ESP32') {
        console.log('[BLE] Scan window elapsed. Rescheduling scan...');
        this.stopScan();
        this.updateStatus('DISCONNECTED', 'Device not found in scan window.');
        this.scheduleReconnect(6000);
      }
    }, 12000);

    try {
      this.manager.startDeviceScan(
        null,
        { allowDuplicates: false },
        async (error: any, device: any) => {
          if (error) {
            console.warn('[BLE] Device scan error:', error);
            this.stopScan();
            this.updateStatus('ERROR', error.message || 'Scan error');
            this.scheduleReconnect(5000);
            return;
          }

          if (device) {
            const devName = (device.name || device.localName || '').trim();

            // Match advertised device name NAARI_KAVACH primarily without relying on MAC
            const isNameMatch = devName.toLowerCase() === this.targetDeviceName.toLowerCase();

            if (isNameMatch) {
              console.log(`[BLE] Device found: ${devName} [${device.id}] (RSSI: ${device.rssi} dBm)`);
              this.diagnostics.esp32Found = true;
              this.emitDiagnostics();
              this.updateStatus('ESP32 FOUND', `Found ${devName}`);
              this.stopScan();
              await this.connectToDevice(device);
            }
          }
        }
      );
    } catch (e: any) {
      console.error('[BLE] startDeviceScan exception:', e);
      this.updateStatus('ERROR', e.message || 'Scan exception');
    }
  }

  public stopScan(): void {
    if (this.scanTimeoutRef) {
      clearTimeout(this.scanTimeoutRef);
      this.scanTimeoutRef = null;
    }
    if (this.manager) {
      try {
        this.manager.stopDeviceScan();
      } catch (e) {}
    }
  }

  private async connectToDevice(device: any): Promise<void> {
    try {
      this.cleanupConnection(); // Ensure zero stale subscriptions before connecting
      this.updateStatus('CONNECTING', `Connecting to ${device.name || this.targetDeviceName}...`);
      console.log('[BLE] Connecting...');

      const connected = await device.connect({ autoConnect: false, timeout: 15000 });

      // Negotiate an MTU large enough for the longest sensor-health packets.
      // Core SOS/HR/SpO2 packets are already <= 20 bytes, so failure here is
      // non-fatal and older devices can still use the essential path.
      if (Platform.OS === 'android' && typeof connected.requestMTU === 'function') {
        try {
          await connected.requestMTU(64);
          console.log('[BLE] Requested 64-byte MTU for complete diagnostic notifications.');
        } catch (mtuError: any) {
          console.warn('[BLE] MTU negotiation failed; continuing with essential short packets:', mtuError?.message || mtuError);
        }
      }

      this.connectedDevice = connected;
      console.log('[BLE] Connected');

      this.diagnostics.bluetoothConnected = true;
      this.diagnostics.gattConnected = true;
      this.emitDiagnostics();

      this.updateStatus('CONNECTED - WAITING FOR ESP32 DATA');

      // Handle spontaneous disconnect
      connected.onDisconnected((error: any, dev: any) => {
        console.warn(`[BLE] Disconnected from ${dev?.id}:`, error?.message || 'Connection lost');
        this.cleanupConnection();
        this.isEsp32Online = false;
        this.updateStatus('DISCONNECTED', 'ESP32 disconnected.');
        this.scheduleReconnect(4000);
      });

      // Discover the exact locked GATT service/characteristic contract.
      // Do not fall back to arbitrary notify characteristics: a mismatch must
      // be visible during integration instead of silently binding the wrong endpoint.
      console.log('[BLE] Discovering services and characteristics');
      const discovered = await connected.discoverAllServicesAndCharacteristics();
      const services = await discovered.services();

      let targetSubscribed = false;

      for (const service of services) {
        const sUuid = service.uuid.toLowerCase();
        if (sUuid !== this.targetServiceUUID) continue;

        console.log(`[BLE] Exact service found: ${this.targetServiceUUID}`);
        this.diagnostics.serviceFound = true;
        this.emitDiagnostics();

        const characteristics = await service.characteristics();
        for (const char of characteristics) {
          const cUuid = char.uuid.toLowerCase();
          const isNotifiable = !!(char.isNotifiable || char.isIndicatable);

          if (cUuid === this.targetCharUUID && isNotifiable) {
            console.log(`[BLE] Exact notify characteristic found: ${this.targetCharUUID}`);
            this.diagnostics.characteristicFound = true;
            this.emitDiagnostics();
            this.subscribeToCharacteristic(char);
            targetSubscribed = true;
            break;
          }
        }

        break;
      }

      if (targetSubscribed) {
        console.log('[BLE] Notification subscription successful');
        this.diagnostics.notificationsSubscribed = true;
        this.emitDiagnostics();
        this.updateStatus('SUBSCRIBED TO SENSOR NOTIFICATIONS');
      } else {
        const reason = this.diagnostics.serviceFound
          ? 'Expected BLE notify characteristic UUID was not found/notifiable.'
          : 'Expected BLE service UUID was not found.';
        console.error(`[BLE] Contract mismatch: ${reason}`);
        this.updateStatus('ERROR', reason);
        try {
          await connected.cancelConnection();
        } catch (disconnectError) {}
        this.cleanupConnection();
        this.scheduleReconnect(5000);
      }
    } catch (err: any) {
      console.error('[BLE] Connection error:', err);
      this.cleanupConnection();
      this.isEsp32Online = false;
      this.updateStatus('ERROR', err.message || 'Connection failed');
      this.scheduleReconnect(4000);
    }
  }

  // ---------------------------------------------------------------------------------------
  // 3. CONTINUOUS GATT NOTIFICATION MONITORING & DECODING
  // ---------------------------------------------------------------------------------------
  private subscribeToCharacteristic(characteristic: any): void {
    try {
      if (this.charSubscription) {
        this.charSubscription.remove();
        this.charSubscription = null;
      }

      // Continuous subscription - remains active indefinitely for all streaming packets
      this.charSubscription = characteristic.monitor((error: any, char: any) => {
        if (error) {
          console.warn('[BLE] Characteristic monitor error:', error);
          return;
        }

        if (char && char.value) {
          const base64Payload = char.value;
          console.log(`[BLE RAW] Received Base64 payload: ${base64Payload}`);

          const decodedText = decodeBase64ToUtf8(base64Payload);
          this.handleIncomingMessage(decodedText);
        }
      });
    } catch (e) {
      console.error(`[BLE] Failed to register monitor for ${characteristic?.uuid}:`, e);
    }
  }

  // ---------------------------------------------------------------------------------------
  // 4. EXACT MESSAGE PARSER
  // ---------------------------------------------------------------------------------------
  public handleIncomingMessage(rawText: string): void {
    const text = rawText.trim();
    if (!text) return;

    const now = Date.now();
    this.lastEventTime = now;
    this.diagnostics.totalPacketsReceived++;
    this.diagnostics.lastRawMessage = text;

    // 1. STATUS:ONLINE
    if (text === 'STATUS:ONLINE' || text.toUpperCase().startsWith('STATUS:ONLINE')) {
      console.log(`[BLE DECODED] ${text}`);
      console.log('[BLE EVENT] ESP32 is ONLINE');
      this.isEsp32Online = true;
      this.diagnostics.lastSensorEvent = 'STATUS:ONLINE';
      this.emitDiagnostics();
      this.updateStatus('ESP32 ONLINE');
      this.dispatchTelemetry({
        type: 'STATUS_ONLINE',
        rawPayload: text,
        timestamp: now,
      });
      return;
    }

    // 2. Physical SOS button pressed: "SOS"
    if (text === 'SOS' || text.toUpperCase() === 'SOS' || text.toUpperCase().startsWith('SOS')) {
      console.log(`[BLE DECODED] ${text}`);
      console.log('[BLE EVENT] Physical SOS button pressed');
      this.diagnostics.lastSensorEvent = 'PHYSICAL SOS BUTTON';
      this.emitDiagnostics();
      this.updateStatus('RECEIVING SENSOR DATA', 'Physical SOS button pressed');
      this.dispatchTelemetry({
        type: 'BUTTON_SOS',
        rawPayload: text,
        timestamp: now,
      });
      return;
    }

    // 3. Real Heartbeat Reading: "HEART_RATE:<BPM>" (e.g. HEART_RATE:72, HEART_RATE:73, HEART_RATE:74)
    if (text.toUpperCase().startsWith('HEART_RATE:')) {
      console.log(`[BLE DECODED] ${text}`);
      const parts = text.split(':');
      const bpmNumber = parts.length > 1 ? parseInt(parts[1].trim(), 10) : NaN;

      if (!isNaN(bpmNumber) && bpmNumber >= 30 && bpmNumber <= 230) {
        this.latestBpm = bpmNumber;
        this.diagnostics.lastHeartbeat = bpmNumber;
        this.diagnostics.lastSensorEvent = `HEART_RATE:${bpmNumber}`;
        this.emitDiagnostics();
        console.log(`[BLE EVENT] Heartbeat received: ${bpmNumber} BPM`);
        this.updateStatus('RECEIVING SENSOR DATA', `Heartbeat: ${bpmNumber} BPM`);
        this.dispatchTelemetry({
          type: 'HEARTBEAT',
          bpm: bpmNumber,
          rawPayload: text,
          timestamp: now,
        });
      } else {
        console.warn(`[BLE] Ignored invalid BPM value: '${parts[1]}' in payload '${text}'`);
      }
      return;
    }

    // 4. Real SpO2 reading: "SPO2:<percent>"
    if (text.toUpperCase().startsWith('SPO2:')) {
      const parts = text.split(':');
      const spo2Number = parts.length > 1 ? parseInt(parts[1].trim(), 10) : NaN;

      if (!isNaN(spo2Number) && spo2Number >= 70 && spo2Number <= 100) {
        this.latestSpO2 = spo2Number;
        this.diagnostics.lastSpO2 = spo2Number;
        this.diagnostics.lastSensorEvent = `SPO2:${spo2Number}`;
        this.emitDiagnostics();
        console.log(`[BLE EVENT] SpO2 received: ${spo2Number}%`);
        this.updateStatus('RECEIVING SENSOR DATA', `SpO2: ${spo2Number}%`);
        this.dispatchTelemetry({
          type: 'SPO2',
          spo2: spo2Number,
          rawPayload: text,
          timestamp: now,
        });
      } else {
        console.warn(`[BLE] Ignored invalid SpO2 value: '${parts[1]}' in payload '${text}'`);
      }
      return;
    }

    // 5. Explicit sensor health/status packets.
    if (text.toUpperCase().startsWith('SENSOR:')) {
      const upper = text.toUpperCase();
      const opticalFault =
        (upper.includes('MAX30100') || upper.includes('MAX30102') || upper.includes('MAX3010X')) &&
        (upper.includes('I2C_ERROR') ||
          upper.includes('NOT_READY') ||
          upper.includes('CONFIG_ERROR') ||
          upper.includes('UNKNOWN_PART'));

      if (opticalFault) {
        this.latestBpm = null;
        this.latestSpO2 = null;
        this.diagnostics.lastHeartbeat = null;
        this.diagnostics.lastSpO2 = null;
      }

      this.diagnostics.lastSensorEvent = text;
      this.emitDiagnostics();
      this.dispatchTelemetry({
        type: 'SENSOR_STATUS',
        sensorStatus: text,
        rawPayload: text,
        timestamp: now,
      });
      return;
    }

    // 6. Vitals validity/acquisition state. These are deliberately not
    // converted into numeric readings.
    if (text.toUpperCase().startsWith('VITALS:')) {
      if (text.toUpperCase().includes('NO_VALID_READING')) {
        this.latestBpm = null;
        this.latestSpO2 = null;
        this.diagnostics.lastHeartbeat = null;
        this.diagnostics.lastSpO2 = null;
      }

      this.diagnostics.lastSensorEvent = text;
      this.emitDiagnostics();
      this.dispatchTelemetry({
        type: 'VITALS_STATUS',
        vitalsStatus: text,
        rawPayload: text,
        timestamp: now,
      });
      return;
    }

    // 7. Hardware Fall Detected: "FALL_DETECTED"
    if (text === 'FALL_DETECTED' || text.toUpperCase() === 'FALL_DETECTED') {
      console.log(`[BLE DECODED] ${text}`);
      console.log('[BLE EVENT] Hardware fall detected');
      this.lastFallDetected = true;
      this.diagnostics.lastSensorEvent = 'FALL_DETECTED';
      this.emitDiagnostics();
      this.updateStatus('RECEIVING SENSOR DATA', 'Hardware Fall Detected');
      this.dispatchTelemetry({
        type: 'FALL_DETECTED',
        fallDetected: true,
        rawPayload: text,
        timestamp: now,
      });
      return;
    }

    // Fallback: If numeric string only (legacy heartbeat payload, e.g. "72")
    if (/^\d+$/.test(text)) {
      const bpmNumber = parseInt(text, 10);
      if (bpmNumber >= 30 && bpmNumber <= 230) {
        this.latestBpm = bpmNumber;
        this.diagnostics.lastHeartbeat = bpmNumber;
        this.diagnostics.lastSensorEvent = `HEART_RATE:${bpmNumber}`;
        this.emitDiagnostics();
        console.log(`[BLE DECODED] ${text}`);
        console.log(`[BLE EVENT] Heartbeat received: ${bpmNumber} BPM`);
        this.updateStatus('RECEIVING SENSOR DATA', `Heartbeat: ${bpmNumber} BPM`);
        this.dispatchTelemetry({
          type: 'HEARTBEAT',
          bpm: bpmNumber,
          rawPayload: text,
          timestamp: now,
        });
        return;
      }
    }

    console.log(`[BLE DECODED] ${text}`);
    this.diagnostics.lastSensorEvent = text;
    this.emitDiagnostics();
    this.dispatchTelemetry({
      type: 'RAW',
      rawPayload: text,
      timestamp: now,
    });
  }

  private dispatchTelemetry(event: BleTelemetryEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[BLE] Listener error:', err);
      }
    });

    // Ingest into backend in background for audit trail
    this.syncBackend(event).catch(() => {});
  }

  private async syncBackend(event: BleTelemetryEvent): Promise<void> {
    try {
      // Current backend schema has no SpO2/sensor-health column. Do not
      // mislabel those packets as heartbeat events.
      if (event.type === 'SPO2' || event.type === 'SENSOR_STATUS' || event.type === 'VITALS_STATUS') {
        return;
      }

      const eventTypeMap: Record<string, string> = {
        STATUS_ONLINE: 'STATUS_HEARTBEAT',
        BUTTON_SOS: 'BUTTON_SOS',
        FALL_DETECTED: 'FALL_DETECTED',
        HEARTBEAT: 'STATUS_HEARTBEAT',
      };

      const eventType = eventTypeMap[event.type] || 'STATUS_HEARTBEAT';
      const eventId = `NAARI_KAVACH_BLE_${Date.now()}`;

      await IoTService.ingestEvent({
        deviceId: 'cc:7b:5c:fb:d9:18',
        eventId,
        eventType: eventType as any,
        heartRate: event.bpm || this.latestBpm || undefined,
        fallDetected: event.type === 'FALL_DETECTED',
      });
    } catch (e) {
      // Backend may be offline; direct local BLE handling still succeeds
    }
  }

  // ---------------------------------------------------------------------------------------
  // 5. OBSERVER SUBSCRIPTIONS & DIAGNOSTICS
  // ---------------------------------------------------------------------------------------
  public addEventListener(listener: BleEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public addStatusListener(listener: BleStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.connectionState);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public addDiagnosticListener(listener: BleDiagnosticListener): () => void {
    this.diagnosticListeners.add(listener);
    listener(this.diagnostics);
    return () => {
      this.diagnosticListeners.delete(listener);
    };
  }

  private emitDiagnostics(): void {
    this.diagnosticListeners.forEach((listener) => {
      try {
        listener({ ...this.diagnostics });
      } catch (err) {}
    });
  }

  private updateStatus(state: BleDetailedState, details?: string): void {
    this.connectionState = state;
    this.statusListeners.forEach((listener) => {
      try {
        listener(state, details);
      } catch (err) {}
    });
  }

  public getConnectionState(): BleDetailedState {
    return this.connectionState;
  }

  private cleanupConnection(): void {
    if (this.charSubscription) {
      try {
        this.charSubscription.remove();
      } catch (e) {}
      this.charSubscription = null;
    }
    this.connectedDevice = null;
    this.diagnostics.bluetoothConnected = false;
    this.diagnostics.gattConnected = false;
    this.diagnostics.serviceFound = false;
    this.diagnostics.characteristicFound = false;
    this.diagnostics.notificationsSubscribed = false;
    this.emitDiagnostics();
  }

  public async disconnect(): Promise<void> {
    if (this.reconnectTimerRef) {
      clearTimeout(this.reconnectTimerRef);
      this.reconnectTimerRef = null;
    }
    this.stopScan();
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch (e) {}
    }
    this.cleanupConnection();
    this.isEsp32Online = false;
    this.updateStatus('DISCONNECTED', 'Manually disconnected.');
  }

  private scheduleReconnect(delayMs: number): void {
    if (!this.manager) return; // Do not schedule reconnect if native BLE is unavailable
    if (this.reconnectTimerRef) clearTimeout(this.reconnectTimerRef);
    this.reconnectTimerRef = setTimeout(() => {
      if (this.connectionState === 'DISCONNECTED' || this.connectionState === 'ERROR') {
        console.log('[BLE] Retrying scan for ESP32...');
        this.startScanAndConnect();
      }
    }, delayMs);
  }
}

export const bleService = new BleService();
