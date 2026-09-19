import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { IoTService, IoTDeviceStatus } from '../services/IoTService';
import { bleService, BleDetailedState, BleTelemetryEvent, BleDiagnosticInfo } from '../services/BleService';

interface IoTStatusCardProps {
  onPairSuccess?: () => void;
}

export function IoTStatusCard({ onPairSuccess }: IoTStatusCardProps) {
  const [status, setStatus] = useState<IoTDeviceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [pairModalVisible, setPairModalVisible] = useState(false);
  const [diagModalVisible, setDiagModalVisible] = useState(false);
  const [deviceIdInput, setDeviceIdInput] = useState('cc:7b:5c:fb:d9:18');
  const [deviceNameInput, setDeviceNameInput] = useState('NAARI_KAVACH');
  const [pairing, setPairing] = useState(false);
  const [bleState, setBleState] = useState<BleDetailedState>(bleService.getConnectionState());
  const [bleBpm, setBleBpm] = useState<number | null>(bleService.latestBpm);
  const [diagnostics, setDiagnostics] = useState<BleDiagnosticInfo>(bleService.diagnostics);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await IoTService.getDeviceStatus();
      setStatus(data);
    } catch (e) {
      // Gracefully ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (timer) clearInterval(timer);
      fetchStatus();
      timer = setInterval(fetchStatus, 15000); // refresh every 15s
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        startPolling();
      } else {
        stopPolling();
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    if (AppState.currentState === 'active') {
      startPolling();
    }

    const unsubStatus = bleService.addStatusListener((st) => {
      setBleState(st);
    });

    const unsubEvents = bleService.addEventListener((event: BleTelemetryEvent) => {
      if (event.type === 'HEARTBEAT' && event.bpm) {
        setBleBpm(event.bpm);
      }
    });

    const unsubDiag = bleService.addDiagnosticListener((diag) => {
      setDiagnostics(diag);
    });

    return () => {
      stopPolling();
      appStateSub.remove();
      unsubStatus();
      unsubEvents();
      unsubDiag();
    };
  }, [fetchStatus]);

  const handlePair = async () => {
    if (!deviceIdInput.trim()) {
      Alert.alert('Device ID Required', 'Please enter your ESP32 device ID (e.g. cc:7b:5c:fb:d9:18).');
      return;
    }

    try {
      setPairing(true);
      await IoTService.pairDevice({
        deviceId: deviceIdInput.trim(),
        deviceName: deviceNameInput.trim(),
      });
      Alert.alert('Device Paired!', `Successfully paired with ${deviceIdInput.trim()}.`);
      setPairModalVisible(false);
      fetchStatus();
      if (onPairSuccess) onPairSuccess();
    } catch (e: any) {
      Alert.alert('Pairing Failed', e?.response?.data?.message || e.message || 'Could not pair device.');
    } finally {
      setPairing(false);
    }
  };

  const isConfigured = status?.isConfigured;
  const isOnline = status?.isOnline || bleService.isEsp32Online || bleState === 'ESP32 ONLINE' || bleState === 'RECEIVING SENSOR DATA';
  const device = status?.device;
  const effectiveBpm = bleBpm || bleService.latestBpm || device?.lastHeartRate;

  const handleBleConnect = async () => {
    try {
      await bleService.startScanAndConnect();
    } catch (e: any) {
      Alert.alert('BLE Error', e?.message || 'Could not start Bluetooth scan.');
    }
  };

  // Determine human-readable status chip label
  let statusChipLabel = 'OFFLINE';
  let statusChipColor = '#757575';
  let statusChipBg = '#f5f5f5';
  let dotColor = '#9e9e9e';

  if (bleState === 'ESP32 ONLINE') {
    statusChipLabel = 'ESP32 ONLINE';
    statusChipColor = '#2e7d32';
    statusChipBg = '#e8f5e9';
    dotColor = '#2e7d32';
  } else if (bleState === 'RECEIVING SENSOR DATA') {
    statusChipLabel = 'RECEIVING DATA';
    statusChipColor = '#2e7d32';
    statusChipBg = '#e8f5e9';
    dotColor = '#2e7d32';
  } else if (bleState === 'SUBSCRIBED TO SENSOR NOTIFICATIONS') {
    statusChipLabel = 'NOTIFY ACTIVE';
    statusChipColor = '#2e7d32';
    statusChipBg = '#e8f5e9';
    dotColor = '#2e7d32';
  } else if (bleState === 'CONNECTED - WAITING FOR ESP32 DATA') {
    statusChipLabel = 'WAITING FOR DATA';
    statusChipColor = '#f57f17';
    statusChipBg = '#fff9c4';
    dotColor = '#fbc02d';
  } else if (bleState === 'SCANNING FOR ESP32') {
    statusChipLabel = 'SCANNING...';
    statusChipColor = '#f57f17';
    statusChipBg = '#fff9c4';
    dotColor = '#fbc02d';
  } else if (bleState === 'CONNECTING' || bleState === 'ESP32 FOUND') {
    statusChipLabel = 'CONNECTING...';
    statusChipColor = '#f57f17';
    statusChipBg = '#fff9c4';
    dotColor = '#fbc02d';
  } else if (isOnline) {
    statusChipLabel = 'ONLINE';
    statusChipColor = '#2e7d32';
    statusChipBg = '#e8f5e9';
    dotColor = '#2e7d32';
  }

  return (
    <View style={styles.card}>
      {/* Top Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <LinearGradient
            colors={['#ab47bc', '#7b1fa2']}
            style={styles.badgeIcon}
          >
            <MaterialCommunityIcons name="watch-vibrate" size={20} color="#ffffff" />
          </LinearGradient>
          <View>
            <Text style={styles.cardTitle}>IoT Safety Wearable</Text>
            <Text style={styles.cardSubtitle}>
              {isConfigured ? device?.deviceName || device?.deviceId : 'No wearable paired yet'}
            </Text>
          </View>
        </View>

        {/* Live Status Chip */}
        <View
          style={[
            styles.statusChip,
            { backgroundColor: statusChipBg },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: dotColor },
            ]}
          />
          <Text
            style={[
              styles.statusChipText,
              { color: statusChipColor },
            ]}
          >
            {statusChipLabel}
          </Text>
        </View>
      </View>

      {/* Sensor Metrics Grid */}
      {isConfigured && (
        <View style={styles.metricsGrid}>
          {/* Heart Rate Metric */}
          <View style={styles.metricItem}>
            <MaterialCommunityIcons name="heart-pulse" size={20} color="#e91e63" />
            <Text style={styles.metricLabel}>Heart Rate</Text>
            <Text style={styles.metricValue}>
              {typeof effectiveBpm === 'number' && effectiveBpm > 0 ? `${effectiveBpm} BPM` : '-- BPM'}
            </Text>
          </View>

          {/* Fall State Metric */}
          <View style={styles.metricItem}>
            <Ionicons name="body" size={20} color="#ff9800" />
            <Text style={styles.metricLabel}>Fall State</Text>
            <Text
              style={[
                styles.metricValue,
                { color: (bleService.lastFallDetected || device?.lastFallDetected) ? '#d50000' : '#4caf50' },
              ]}
            >
              {(bleService.lastFallDetected || device?.lastFallDetected) ? 'FALL DETECTED' : 'NORMAL'}
            </Text>
          </View>

          {/* Battery Metric (Only if hardware measured valid percentage) */}
          {typeof device?.batteryLevel === 'number' && device.batteryLevel >= 0 ? (
            <View style={styles.metricItem}>
              <Ionicons name="battery-charging" size={20} color="#2196f3" />
              <Text style={styles.metricLabel}>Battery</Text>
              <Text style={styles.metricValue}>{device.batteryLevel}%</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Footer Info & Pairing Action */}
      <View style={styles.footerRow}>
        <Text style={styles.lastSeenText}>
          {bleState === 'ESP32 ONLINE' || bleState === 'RECEIVING SENSOR DATA'
            ? 'ESP32 ONLINE (Direct BLE)'
            : bleState === 'CONNECTED - WAITING FOR ESP32 DATA'
            ? 'CONNECTED - WAITING FOR ESP32 DATA'
            : device?.lastSeen
            ? `Last seen: ${new Date(device.lastSeen).toLocaleTimeString()}`
            : isConfigured
            ? 'Waiting for ESP32...'
            : 'Pair device to sync live alerts'}
        </Text>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={[styles.pairButton, { backgroundColor: '#ede7f6' }]}
            onPress={() => setDiagModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.pairButtonText, { color: '#6a1b9a' }]}>
              Diagnostics
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pairButton, { backgroundColor: isOnline ? '#e8f5e9' : '#f3e5f5' }]}
            onPress={handleBleConnect}
            activeOpacity={0.7}
          >
            <Text style={[styles.pairButtonText, { color: isOnline ? '#2e7d32' : '#8e24aa' }]}>
              {isOnline ? 'Re-scan' : 'Connect'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pairButton}
            onPress={() => setPairModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.pairButtonText}>
              {isConfigured ? 'Change' : 'Pair'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Live BLE Diagnostic Modal */}
      <Modal
        visible={diagModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDiagModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>BLE Diagnostics & Status</Text>
              <TouchableOpacity onPress={() => setDiagModalVisible(false)}>
                <Ionicons name="close-circle" size={24} color="#8e24aa" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Real-time hardware pipeline status for ESP32 (NAARI_KAVACH)
            </Text>

            <View style={styles.diagGrid}>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Bluetooth Connected:</Text>
                <Text style={[styles.diagValue, { color: diagnostics.bluetoothConnected ? '#2e7d32' : '#d50000' }]}>
                  {diagnostics.bluetoothConnected ? 'YES' : 'NO'}
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>ESP32 Found (NAARI_KAVACH):</Text>
                <Text style={[styles.diagValue, { color: diagnostics.esp32Found ? '#2e7d32' : '#d50000' }]}>
                  {diagnostics.esp32Found ? 'YES' : 'NO'}
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>GATT Connected:</Text>
                <Text style={[styles.diagValue, { color: diagnostics.gattConnected ? '#2e7d32' : '#d50000' }]}>
                  {diagnostics.gattConnected ? 'YES' : 'NO'}
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Service Found (12345678-...):</Text>
                <Text style={[styles.diagValue, { color: diagnostics.serviceFound ? '#2e7d32' : '#d50000' }]}>
                  {diagnostics.serviceFound ? 'YES' : 'NO'}
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Characteristic (87654321-...):</Text>
                <Text style={[styles.diagValue, { color: diagnostics.characteristicFound ? '#2e7d32' : '#d50000' }]}>
                  {diagnostics.characteristicFound ? 'YES' : 'NO'}
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Notifications Subscribed:</Text>
                <Text style={[styles.diagValue, { color: diagnostics.notificationsSubscribed ? '#2e7d32' : '#d50000' }]}>
                  {diagnostics.notificationsSubscribed ? 'YES' : 'NO'}
                </Text>
              </View>

              <View style={[styles.diagRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.diagLabel}>Current Connection State:</Text>
                <Text style={[styles.diagValue, { color: '#8e24aa', fontWeight: '800' }]}>
                  {bleState}
                </Text>
              </View>
            </View>

            <View style={[styles.diagGrid, { marginTop: 10, backgroundColor: '#f3e5f5' }]}>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Last Raw ESP32 Message:</Text>
                <Text style={[styles.diagValue, { color: '#4a148c' }]}>
                  {diagnostics.lastRawMessage || 'None'}
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Last Heartbeat Received:</Text>
                <Text style={[styles.diagValue, { color: '#e91e63' }]}>
                  {diagnostics.lastHeartbeat ? `${diagnostics.lastHeartbeat} BPM` : '-- BPM'}
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Last Sensor Event Received:</Text>
                <Text style={[styles.diagValue, { color: '#ff6f00' }]}>
                  {diagnostics.lastSensorEvent || 'None'}
                </Text>
              </View>

              <View style={[styles.diagRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.diagLabel}>Total Packets Streamed:</Text>
                <Text style={[styles.diagValue, { color: '#1565c0' }]}>
                  {diagnostics.totalPacketsReceived}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, { marginTop: 14, width: '100%' }]}
              onPress={() => setDiagModalVisible(false)}
            >
              <Text style={styles.saveButtonText}>Close Diagnostics</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Device Pairing Modal */}
      <Modal
        visible={pairModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPairModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pair ESP32 Wearable</Text>
            <Text style={styles.modalSub}>
              Enter your IoT wearable device ID configured in the firmware.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Device Identifier</Text>
              <TextInput
                value={deviceIdInput}
                onChangeText={setDeviceIdInput}
                placeholder="e.g. cc:7b:5c:fb:d9:18"
                style={styles.textInput}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Device Name</Text>
              <TextInput
                value={deviceNameInput}
                onChangeText={setDeviceNameInput}
                placeholder="e.g. NAARI_KAVACH"
                style={styles.textInput}
              />
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setPairModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handlePair}
                disabled={pairing}
              >
                {pairing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Pair Device</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.12)',
    shadowColor: '#0F031D',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  badgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1c0d2b',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#7a6590',
    marginTop: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fbf8fd',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.06)',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: '#8b75a0',
    marginTop: 4,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2a0845',
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  lastSeenText: {
    fontSize: 11,
    color: '#9c88b0',
    flex: 1,
  },
  pairButton: {
    backgroundColor: '#f3e5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  pairButtonText: {
    color: '#7b1fa2',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1c0d2b',
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    color: '#6e5a80',
    lineHeight: 18,
    marginBottom: 18,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4a148c',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#f7f2fa',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(142, 36, 170, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#2a0845',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#7a6590',
    fontWeight: '700',
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#8e24aa',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
  },
  diagGrid: {
    backgroundColor: '#fbf8fd',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.1)',
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(142, 36, 170, 0.05)',
  },
  diagLabel: {
    fontSize: 12,
    color: '#6e5a80',
    fontWeight: '600',
    flex: 1,
  },
  diagValue: {
    fontSize: 12,
    fontWeight: '800',
  },
});
