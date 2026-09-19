import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { IoTEmergencyEvent } from '../services/IoTService';

interface IoTEmergencyModalProps {
  emergency: IoTEmergencyEvent | null;
  onDismiss: () => void;
}

export function IoTEmergencyModal({ emergency, onDismiss }: IoTEmergencyModalProps) {
  const [countdown, setCountdown] = useState(10);
  const [isCalling, setIsCalling] = useState(false);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isButtonSOS = emergency?.event_type === 'BUTTON_SOS';
  const isFall = emergency?.event_type === 'FALL_DETECTED';
  const isHeartRate = emergency?.event_type === 'HEART_RATE_EMERGENCY';

  // Handle countdown for BUTTON_SOS
  useEffect(() => {
    if (!emergency) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setCountdown(10);
      setIsCalling(false);
      return;
    }

    if (isButtonSOS) {
      setCountdown(10);
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            handleCallContacts();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [emergency?.id, emergency?.event_type]);

  const handleCallContacts = async () => {
    if (isCalling) return;
    setIsCalling(true);

    try {
      const savedContacts = await AsyncStorage.getItem('emergencyContacts');
      const contacts: string[] = savedContacts ? JSON.parse(savedContacts) : [];

      if (contacts.length > 0) {
        const primaryPhone = contacts[0].replace(/\s+/g, '');
        Linking.openURL(`tel:${primaryPhone}`);
      } else {
        // Fallback emergency number
        Linking.openURL('tel:112');
      }
    } catch (e) {
      console.warn('Error opening dialer:', e);
      Linking.openURL('tel:112');
    }
  };

  const handleDismiss = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    onDismiss();
  };

  if (!emergency) return null;

  return (
    <Modal
      visible={!!emergency}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header Badge */}
          <LinearGradient
            colors={isButtonSOS ? ['#d50000', '#b71c1c'] : isFall ? ['#e65100', '#bf360c'] : ['#880e4f', '#4a148c']}
            style={styles.iconCircle}
          >
            {isButtonSOS && <Ionicons name="alert-circle" size={48} color="#fff" />}
            {isFall && <Ionicons name="body" size={48} color="#fff" />}
            {isHeartRate && <MaterialCommunityIcons name="heart-pulse" size={48} color="#fff" />}
          </LinearGradient>

          {/* Title and Description */}
          <Text style={styles.title}>
            {isButtonSOS
              ? '🚨 Hardware SOS Triggered!'
              : isFall
              ? '⚠ Fall Detected!'
              : '💓 Abnormal Heart Rate Alert!'}
          </Text>

          <Text style={styles.description}>
            {isButtonSOS
              ? 'Emergency push button was pressed 3 times on your IoT wearable device.'
              : isFall
              ? 'A sudden impact or fall was detected by your wearable device sensors.'
              : `Your wearable detected an abnormal pulse rate of ${emergency.heart_rate || 'N/A'} BPM.`}
          </Text>

          {/* Telemetry Details */}
          <View style={styles.detailsBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Device ID:</Text>
              <Text style={styles.detailValue}>{emergency.device_id}</Text>
            </View>
            {emergency.heart_rate ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Heart Rate:</Text>
                <Text style={[styles.detailValue, { color: '#e91e63', fontWeight: '800' }]}>
                  {emergency.heart_rate} BPM
                </Text>
              </View>
            ) : null}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Event Time:</Text>
              <Text style={styles.detailValue}>
                {emergency.created_at ? new Date(emergency.created_at).toLocaleTimeString() : 'Just now'}
              </Text>
            </View>
          </View>

          {/* Button SOS Countdown Indicator */}
          {isButtonSOS && countdown > 0 && (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>
                Calling Emergency Contact in <Text style={styles.countdownNumber}>{countdown}</Text>s
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionColumn}>
            <TouchableOpacity
              style={styles.callButton}
              activeOpacity={0.85}
              onPress={handleCallContacts}
            >
              <LinearGradient
                colors={['#d50000', '#b71c1c']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.callButtonGradient}
              >
                <Ionicons name="call" size={22} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.callButtonText}>Call Emergency Contact</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dismissButton}
              activeOpacity={0.7}
              onPress={handleDismiss}
            >
              <Text style={styles.dismissButtonText}>I Am Safe (Dismiss Alert)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 3, 29, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 24,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#d50000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1c0d2b',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#554168',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  detailsBox: {
    width: '100%',
    backgroundColor: '#f8f2fc',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.15)',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#7a6590',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    color: '#2a0845',
    fontWeight: '700',
  },
  countdownContainer: {
    backgroundColor: '#ffebee',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c62828',
  },
  countdownNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#b71c1c',
  },
  actionColumn: {
    width: '100%',
  },
  callButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#d50000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  callButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  callButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  dismissButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#7a6590',
    fontSize: 14,
    fontWeight: '700',
  },
});
