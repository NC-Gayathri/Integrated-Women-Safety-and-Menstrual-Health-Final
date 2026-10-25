import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { IoTEmergencyEvent } from '../services/IoTService';
import { DialContact, normalizeEmergencyContacts, safeDialNumber } from '../services/EmergencyContacts';

interface IoTEmergencyModalProps {
  emergency: IoTEmergencyEvent | null;
  onDismiss: () => void;
}

export function IoTEmergencyModal({ emergency, onDismiss }: IoTEmergencyModalProps) {
  const [contacts, setContacts] = useState<DialContact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [openingNumber, setOpeningNumber] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setContacts([]);
    setContactsLoaded(false);
    setOpeningNumber(null);
    if (emergency) {
      // Cache is populated by the safety tab; does NOT require internet when
      // the ESP32 sends its BLE "SOS" packet.
      void AsyncStorage.getItem('emergencyContacts')
        .then(raw => {
          if (!current) return;
          let stored: unknown = [];
          try { stored = raw ? JSON.parse(raw) : []; } catch { stored = []; }
          setContacts(normalizeEmergencyContacts(stored));
        })
        .catch(() => { if (current) setContacts([]); })
        .finally(() => { if (current) setContactsLoaded(true); });
    }
    return () => { current = false; };
  }, [emergency?.event_id, emergency?.id]);

  const openDialer = async (contact: DialContact) => {
    const number = safeDialNumber(contact.phone);
    if (!number || openingNumber) return;
    setOpeningNumber(number);
    try {
      // This opens Android's dialer. The user decides whether to actually call.
      await Linking.openURL('tel:' + number);
    } catch {
      Alert.alert('Could not open phone dialer',
        'Please open your phone app and call your trusted contact directly.');
    } finally {
      setOpeningNumber(null);
    }
  };

  const openManageContacts = () => {
    onDismiss();
    router.push('/(tabs)/safety');
  };

  if (!emergency) return null;
  const sos = emergency.event_type === 'BUTTON_SOS';
  const fall = emergency.event_type === 'FALL_DETECTED';
  const source = emergency.id < 0 ? 'Direct ESP32 Bluetooth' : 'Registered IoT event';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent
      onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Ionicons name={sos ? 'alert-circle' : fall ? 'warning' : 'heart'}
            size={46} color="#c62828" accessibilityLabel="Emergency alert" />
          <Text style={styles.title}>
            {sos ? '🚨 Hardware SOS received' :
             fall ? '⚠ Fall alert received' : '⚠ Wearable emergency alert'}
          </Text>
          <Text style={styles.description}>
            {sos
              ? 'Your ESP32 SOS button sent an alert to the app.'
              : fall
                ? 'Your wearable reported a fall. Check your situation and contact help if needed.'
                : 'An emergency event was reported by your wearable.'}
          </Text>
          <Text style={styles.source}>Source: {source}</Text>
          <Text style={styles.section}>Your emergency contacts</Text>
          <Text style={styles.hint}>
            Choose a contact below to open the phone dialer. Calls and messages
            are not sent automatically.
          </Text>

          {!contactsLoaded ? (
            <Text style={styles.notice}>Loading locally saved contacts…</Text>
          ) : contacts.length === 0 ? (
            <Text style={styles.notice}>
              No valid saved contacts found on this phone. Add a trusted
              contact in the Safety tab. No emergency number will be dialled
              without your action.
            </Text>
          ) : (
            <ScrollView style={styles.contacts} nestedScrollEnabled
              contentContainerStyle={styles.contactsContent}>
              {contacts.map(contact => (
                <TouchableOpacity
                  key={contact.phone}
                  accessibilityRole="button"
                  accessibilityLabel={'Open dialer for ' + contact.name}
                  style={styles.contactButton}
                  disabled={openingNumber !== null}
                  onPress={() => void openDialer(contact)}>
                  <View style={styles.contactText}>
                    <Text style={styles.contactName}>
                      {contact.name}{contact.isPrimary ? ' · Primary' : ''}
                    </Text>
                    <Text style={styles.phone}>{contact.phone}</Text>
                  </View>
                  <Ionicons name="call-outline" size={23} color="#b71c1c" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.manageButton} onPress={openManageContacts}
            accessibilityRole="button">
            <Text style={styles.manageText}>Manage emergency contacts</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}
            accessibilityRole="button">
            <Text style={styles.dismissText}>Dismiss alert / I am safe</Text>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            Foreground BLE connection required for direct alerts. This is not
            a substitute for emergency services or a guaranteed background notification.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(24,8,38,0.78)', justifyContent: 'center', padding: 18 },
  sheet: { borderRadius: 24, backgroundColor: '#fff', padding: 22, alignItems: 'center', maxHeight: '90%', elevation: 14 },
  title: { fontSize: 21, fontWeight: '900', color: '#6a0030', textAlign: 'center', marginTop: 7 },
  description: { fontSize: 14, color: '#4e355d', textAlign: 'center', marginTop: 9, lineHeight: 21 },
  source: { fontSize: 12, color: '#69547a', marginTop: 9 },
  section: { alignSelf: 'stretch', marginTop: 19, fontSize: 17, fontWeight: '800', color: '#26112e' },
  hint: { fontSize: 12, color: '#69547a', alignSelf: 'stretch', marginTop: 5, lineHeight: 18 },
  notice: { color: '#6f507f', fontSize: 14, marginTop: 14, marginBottom: 14, textAlign: 'center' },
  contacts: { alignSelf: 'stretch', marginTop: 10, maxHeight: 220 },
  contactsContent: { paddingBottom: 5 },
  contactButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#efdae8',
    borderRadius: 14, padding: 12, marginBottom: 8, backgroundColor: '#fff8fc' },
  contactText: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '700', color: '#371546' },
  phone: { fontSize: 13, color: '#70547b', marginTop: 3 },
  manageButton: { marginTop: 12, paddingVertical: 12, alignSelf: 'stretch', alignItems: 'center',
    borderWidth: 1, borderColor: '#af81b0', borderRadius: 13 },
  manageText: { color: '#6d3573', fontWeight: '700', fontSize: 14 },
  dismissButton: { marginTop: 10, backgroundColor: '#773180', paddingVertical: 13,
    alignSelf: 'stretch', alignItems: 'center', borderRadius: 14 },
  dismissText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  disclaimer: { fontSize: 10, textAlign: 'center', color: '#756782', marginTop: 11, lineHeight: 15 },
});
