import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  FlatList,
  Platform,
  AppState,
  AppStateStatus,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { Accelerometer } from "expo-sensors";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import { IoTStatusCard } from "@/components/IoTStatusCard";
import { IoTService } from "@/services/IoTService";
import { bleService, BleTelemetryEvent, BleDetailedState } from "@/services/BleService";
import { ApiService } from "@/services/ApiService";

export interface EmergencyContactRecord {
  id?: number;
  name: string;
  phone: string;
  relationship?: string;
  is_primary?: boolean;
}

export default function SafetyScreen() {
  const [safetyOn, setSafetyOn] = useState(false);
  const [fallDetected, setFallDetected] = useState(false);
  const [, setShakeCount] = useState(0);
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [liveSpo2, setLiveSpo2] = useState<number | null>(null);
  const [hardwareSensorStatus, setHardwareSensorStatus] = useState<string | null>(null);
  const [bleState, setBleState] = useState<BleDetailedState>('DISCONNECTED');

  const [contacts, setContacts] = useState<EmergencyContactRecord[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newContact, setNewContact] = useState("");
  const [newContactName, setNewContactName] = useState("");

  const accelSubscription = useRef<any>(null);
  const sosCooldownRef = useRef(false);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertTriggeredRef = useRef(false);
  const contactsRef = useRef<EmergencyContactRecord[]>([]);
  const triggerSOSRef = useRef<() => Promise<void> | void>(() => {});

  // Event listeners remain mounted while these refs always point at current state/behavior.
  contactsRef.current = contacts;

  // Fetch real IoT device telemetry (heart rate, online status) from backend
  const fetchIotTelemetry = useCallback(async () => {
    try {
      await IoTService.getDeviceStatus();
    } catch {
      // Ignore background fetch error
    }
  }, []);

  // Connect & listen to direct ESP32 Bluetooth Low Energy events
  useEffect(() => {
    // Start BLE scan & connect on screen mount
    bleService.startScanAndConnect();

    const unsubStatus = bleService.addStatusListener((st) => {
      setBleState(st);
    });

    const unsubEvents = bleService.addEventListener((event: BleTelemetryEvent) => {
      console.log(`[SafetyScreen] Handling BLE Event: ${event.type}`, event);

      if (event.type === 'STATUS_ONLINE') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (event.type === 'HEARTBEAT' && typeof event.bpm === 'number') {
        setLiveBpm(event.bpm);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (event.type === 'SPO2' && typeof event.spo2 === 'number') {
        setLiveSpo2(event.spo2);
      } else if (event.type === 'SENSOR_STATUS' && event.sensorStatus) {
        setHardwareSensorStatus(event.sensorStatus);

        const upper = event.sensorStatus.toUpperCase();
        const opticalFault =
          (upper.includes('MAX30100') || upper.includes('MAX30102') || upper.includes('MAX3010X')) &&
          (upper.includes('I2C_ERROR') ||
            upper.includes('NOT_READY') ||
            upper.includes('CONFIG_ERROR') ||
            upper.includes('UNKNOWN_PART'));

        if (opticalFault) {
          setLiveBpm(null);
          setLiveSpo2(null);
        }
      } else if (event.type === 'VITALS_STATUS' && event.vitalsStatus) {
        if (event.vitalsStatus.toUpperCase().includes('NO_VALID_READING')) {
          setLiveBpm(null);
          setLiveSpo2(null);
        }
      } else if (event.type === 'FALL_DETECTED') {
        setFallDetected(true);
        alertTriggeredRef.current = true;
        Alert.alert("⚠ Hardware Fall Detected!", "ESP32 wearable detected a physical fall event!");
        void triggerSOSRef.current();
      } else if (event.type === 'BUTTON_SOS') {
        Alert.alert("🚨 Physical SOS Triggered!", "ESP32 hardware emergency button was pressed!");
        void triggerSOSRef.current();
      }
    });

    return () => {
      unsubStatus();
      unsubEvents();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | null = null;

      const start = () => {
        if (timer) clearInterval(timer);
        fetchIotTelemetry();
        timer = setInterval(fetchIotTelemetry, 10000); // 10s live telemetry refresh
      };

      const stop = () => {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };

      const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          start();
        } else {
          stop();
        }
      });

      if (AppState.currentState === 'active') {
        start();
      }

      return () => {
        stop();
        subscription.remove();
      };
    }, [fetchIotTelemetry])
  );

  useEffect(() => {
    loadContacts();
  }, []);

  // --------------- Shake + Fall Detection (Expo sensors) ---------------
  const startSensors = useCallback(() => {
    setShakeCount(0);
    setFallDetected(false);
    alertTriggeredRef.current = false;

    Accelerometer.setUpdateInterval(100);

    if (accelSubscription.current) {
      accelSubscription.current.remove();
    }

    accelSubscription.current = Accelerometer.addListener(({ x, y, z }) => {
      const force = Math.sqrt(x * x + y * y + z * z);

      // Shake detection – 3 strong shakes in 2 seconds
      if (force > 2.8) {
        setShakeCount((prev) => {
          const next = prev + 1;

          if (next === 1) {
            // reset after 2 seconds
            shakeTimerRef.current = setTimeout(() => {
              setShakeCount(0);
            }, 2000);
          }

          if (next >= 3) {
            void triggerSOSRef.current();
            setShakeCount(0);
            if (shakeTimerRef.current) {
              clearTimeout(shakeTimerRef.current);
              shakeTimerRef.current = null;
            }
          }

          return next;
        });
      }

      // Fall detection – very low acceleration (phone dropped / free fall)
      if (!alertTriggeredRef.current && force < 0.5) {
        setFallDetected(true);
        alertTriggeredRef.current = true;
        Alert.alert("⚠ Fall Detected!", "Your phone was dropped!");
        void triggerSOSRef.current();
      }
    });
  }, []);

  const stopSensors = useCallback(() => {
    if (accelSubscription.current) {
      accelSubscription.current.remove();
      accelSubscription.current = null;
    }
    if (shakeTimerRef.current) {
      clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = null;
    }
    setShakeCount(0);
  }, []);

  useEffect(() => {
    if (safetyOn) {
      startSensors(); // shake + fall in one listener
    } else {
      stopSensors();
    }

    return () => {
      stopSensors();
    };
  }, [safetyOn, startSensors, stopSensors]);

  // --------------- Real ESP32 MAX3010x Heart Rate + SpO2 Sensor ---------------
  const checkHeartbeatSensor = async () => {
    await fetchIotTelemetry();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const effectiveBpm = liveBpm ?? bleService.latestBpm ?? null;
    const effectiveSpo2 = liveSpo2 ?? bleService.latestSpO2 ?? null;

    if (
      (typeof effectiveBpm === "number" && effectiveBpm > 0) ||
      (typeof effectiveSpo2 === "number" && effectiveSpo2 > 0)
    ) {
      const lines: string[] = [];

      if (typeof effectiveBpm === "number" && effectiveBpm > 0) {
        lines.push(`Heart rate: ${effectiveBpm} BPM`);
      }

      if (typeof effectiveSpo2 === "number" && effectiveSpo2 > 0) {
        lines.push(`SpO₂ estimate: ${effectiveSpo2}%`);
      }

      lines.push("");
      lines.push("Readings come from the physical MAX3010x optical sensor; SpO₂ is a prototype estimate, not a medical diagnosis.");

      Alert.alert("💓 Live Hardware Reading", lines.join("\n"));
      return;
    }

    if (
      hardwareSensorStatus &&
      (hardwareSensorStatus.includes('I2C_ERROR') ||
        hardwareSensorStatus.includes('NOT_READY') ||
        hardwareSensorStatus.includes('CONFIG_ERROR') ||
        hardwareSensorStatus.includes('UNKNOWN_PART'))
    ) {
      Alert.alert(
        "Optical Sensor Not Ready",
        `ESP32 BLE is active, but the optical sensor reported: ${hardwareSensorStatus}. Check 3.3V, GND, SDA GPIO21 and SCL GPIO22.`
      );
      return;
    }

    if (
      bleState === 'ESP32 ONLINE' ||
      bleState === 'RECEIVING SENSOR DATA' ||
      bleState === 'SUBSCRIBED TO SENSOR NOTIFICATIONS'
    ) {
      Alert.alert(
        "Waiting for Sensor Reading",
        "ESP32 is online. Place your finger gently and steadily over the MAX3010x optical sensor while it acquires real red/IR samples."
      );
      return;
    }

    if (bleState === 'CONNECTED - WAITING FOR ESP32 DATA') {
      Alert.alert(
        "Waiting for ESP32 Data",
        "Connected to ESP32. Waiting for 'STATUS:ONLINE' or sensor telemetry..."
      );
      return;
    }

    if (bleState === 'SCANNING FOR ESP32' || bleState === 'CONNECTING' || bleState === 'ESP32 FOUND') {
      Alert.alert("Connecting to Wearable", `Current Status: ${bleState}...`);
      return;
    }

    Alert.alert(
      "Sensor Not Connected",
      "ESP32 wearable is not connected. Ensure the device is powered ON and within Bluetooth range."
    );
  };

  // --------------- Emergency Contacts: Backend MySQL + Offline Cache ---------------
  const loadContacts = async () => {
    try {
      const res = await ApiService.emergency.getContacts();
      const backendContacts = res?.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(backendContacts) && backendContacts.length > 0) {
        setContacts(backendContacts);
        await AsyncStorage.setItem("emergencyContacts", JSON.stringify(backendContacts));
        return;
      }
    } catch (e) {
      console.log("Error loading contacts from API, falling back to cache:", e);
    }

    // Fallback to cache if offline or network failure
    try {
      const saved = await AsyncStorage.getItem("emergencyContacts");
      if (saved) {
        const parsed = JSON.parse(saved);
        const normalized: EmergencyContactRecord[] = parsed.map((item: any) =>
          typeof item === "string" ? { name: "Emergency Contact", phone: item } : item
        );
        setContacts(normalized);
      }
    } catch (e) {
      console.log("Error loading contacts cache", e);
    }
  };

  const addEmergencyContact = async () => {
    if (!newContact.trim()) {
      Alert.alert("Phone Required", "Please enter a valid phone number.");
      return;
    }
    const phone = newContact.trim();
    const name = newContactName.trim() || "Emergency Contact";

    try {
      const res = await ApiService.emergency.addContact({
        name,
        phone,
        is_primary: contacts.length === 0,
      });

      const savedContact: EmergencyContactRecord = res?.data || { name, phone };
      const updated = [...contacts, savedContact];
      setContacts(updated);
      await AsyncStorage.setItem("emergencyContacts", JSON.stringify(updated));
      setNewContact("");
      setNewContactName("");
      setModalVisible(false);
      Alert.alert("Saved", "Emergency contact saved to database.");
    } catch (err: any) {
      console.error("Failed to add emergency contact:", err);
      Alert.alert("Database Error", err.response?.data?.message || "Failed to save contact to database.");
    }
  };

  const deleteContact = async (contact: EmergencyContactRecord, index: number) => {
    try {
      if (contact.id) {
        await ApiService.emergency.deleteContact(contact.id);
      }
      const updated = contacts.filter((_, i) => i !== index);
      setContacts(updated);
      await AsyncStorage.setItem("emergencyContacts", JSON.stringify(updated));
    } catch (err: any) {
      console.error("Failed to delete contact from backend:", err);
      Alert.alert("Error", err.response?.data?.message || "Failed to delete contact from database.");
    }
  };

  // --------------- SOS Logic: Persistent MySQL sos_logs + Phone Dialing ---------------
  const triggerSOS = async () => {
    if (sosCooldownRef.current) return;
    sosCooldownRef.current = true;
    setTimeout(() => {
      sosCooldownRef.current = false;
    }, 8000); // 8s cooldown

    const currentContacts = contactsRef.current;

    if (currentContacts.length === 0) {
      Alert.alert("No Contacts", "Please add emergency contacts first!");
      return;
    }

    // Direct phone dial to all registered contacts
    currentContacts.forEach((c) => {
      const cleaned = (c.phone || "").replace(/\s+/g, "");
      if (cleaned) {
        Linking.openURL(`tel:${cleaned}`);
      }
    });

    // Record persistent SOS in MySQL database with real GPS coordinates
    try {
      let lat = 0;
      let lng = 0;
      let acc = 0;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
          acc = loc.coords.accuracy || 0;
        } catch (locErr) {
          console.warn("Could not retrieve location for SOS record:", locErr);
        }
      }

      await ApiService.sos.triggerSOS({
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        battery_level: 100,
      });

      Alert.alert("🚨 SOS Triggered", "Emergency alert recorded in database & calling contacts!");
    } catch (apiErr: any) {
      console.error("Failed to record SOS in database:", apiErr);
      Alert.alert("🚨 SOS Local Triggered", "Emergency call placed, but server failed to log SOS event.");
    }
  };
  triggerSOSRef.current = triggerSOS;

  // --------------- Nearby Police (Expo Location + Linking) ---------------
  const openNearbyPolice = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Location permission is needed to send your location.");
      return;
    }

    const location = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = location.coords;
    const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
    const policeNumber = "100";
    const body = encodeURIComponent(`Emergency! My location: ${mapsLink}`);

    Alert.alert("Contact Police", "Do you want to call or send your location?", [
      { text: "Call", onPress: () => Linking.openURL(`tel:${policeNumber}`) },
      {
        text: "Send Location",
        onPress: () => Linking.openURL(`sms:${policeNumber}?body=${body}`),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const toggleSafety = (value: boolean) => {
    setSafetyOn(value);
    Alert.alert("Safety " + (value ? "ON" : "OFF"));
  };

  return (
    <AmbientBackground style={styles.container} accentColor="#FCE4EC">
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.header}>🛡️ Safety Hub</Text>
          <Text style={styles.subtext}>
            AI-Powered Personal Safety & Real-Time Monitoring
          </Text>
        </View>

        {/* Master Active Toggle Card */}
        <View
          style={[
            styles.masterToggle,
            safetyOn && { borderColor: "rgba(255, 128, 171, 0.6)" },
          ]}
        >
          <View style={styles.toggleTextGroup}>
            <Text style={styles.masterTitle}>Active Monitoring</Text>
            <Text style={styles.masterSub}>
              {safetyOn
                ? "Sensors active: Shake & Fall Alert ON"
                : "Tap toggle to turn on background protection"}
            </Text>
          </View>
          <Switch
            value={safetyOn}
            onValueChange={toggleSafety}
            trackColor={{ false: "#4a3b5c", true: "#ab47bc" }}
            thumbColor={safetyOn ? "#ff80ab" : "#f4f3f4"}
          />
        </View>

        {/* IoT Wearable Status Card */}
        <IoTStatusCard />

        {/* Feature Cards Grid */}
        <FeatureCard
          icon={<Ionicons name="flash" size={26} color="#fff" />}
          title="Shake SOS Trigger"
          description="Shake phone 3 times strongly to call emergency contacts"
        />

        <FeatureCard
          icon={<Ionicons name="body" size={26} color="#fff" />}
          title="Fall Detection"
          description={
            fallDetected ? "🚨 Fall Detected!" : "Accelerometer monitoring drops"
          }
          onPress={startSensors}
        />

        <FeatureCard
          icon={<MaterialCommunityIcons name="heart-pulse" size={26} color="#fff" />}
          title="Hardware Heart Rate + SpO₂"
          description={
            (liveBpm ?? bleService.latestBpm) || (liveSpo2 ?? bleService.latestSpO2)
              ? `HR: ${liveBpm ?? bleService.latestBpm ?? '--'} BPM • SpO₂: ${liveSpo2 ?? bleService.latestSpO2 ?? '--'}%`
              : hardwareSensorStatus &&
                (hardwareSensorStatus.includes('I2C_ERROR') ||
                  hardwareSensorStatus.includes('NOT_READY') ||
                  hardwareSensorStatus.includes('CONFIG_ERROR') ||
                  hardwareSensorStatus.includes('UNKNOWN_PART'))
              ? "Optical sensor unavailable — tap for details"
              : bleState === 'ESP32 ONLINE' || bleState === 'RECEIVING SENSOR DATA' || bleState === 'SUBSCRIBED TO SENSOR NOTIFICATIONS'
              ? "Waiting for real optical reading..."
              : bleState === 'CONNECTED - WAITING FOR ESP32 DATA'
              ? "CONNECTED - WAITING FOR ESP32 DATA"
              : bleState === 'SCANNING FOR ESP32' || bleState === 'CONNECTING' || bleState === 'ESP32 FOUND'
              ? `${bleState}...`
              : "Sensor not connected"
          }
          onPress={checkHeartbeatSensor}
        />

        <FeatureCard
          icon={<Ionicons name="navigate-circle" size={26} color="#fff" />}
          title="Nearby Police Stations"
          description="Locate nearby police & send GPS coordinates"
          onPress={openNearbyPolice}
        />

        {/* Manage Emergency Contacts */}
        <TouchableOpacity
          style={styles.contactsButton}
          activeOpacity={0.85}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="people" size={20} color="#8e24aa" style={{ marginRight: 8 }} />
          <Text style={styles.contactsText}>Manage Emergency Contacts ({contacts.length})</Text>
        </TouchableOpacity>

        {/* Glowing SOS Alert Button */}
        <TouchableOpacity
          style={styles.sosButtonWrapper}
          activeOpacity={0.85}
          onPress={triggerSOS}
        >
          <LinearGradient
            colors={["#ff1744", "#d50000", "#990000"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sosButton}
          >
            <Ionicons name="alert-circle" size={32} color="#fff" style={{ marginBottom: 2 }} />
            <Text style={styles.sosText}>TRIGGER SOS</Text>
            <Text style={styles.sosSubText}>Calls & Sends Location</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* Contact Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Emergency Contacts</Text>
            <Text style={styles.modalSub}>
              These contacts receive immediate calls/texts during SOS alerts.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Contact Name (e.g. Mom, Doctor)"
              placeholderTextColor="#9c88b0"
              value={newContactName}
              onChangeText={setNewContactName}
            />

            <TextInput
              style={[styles.modalInput, { marginTop: 10 }]}
              placeholder="Enter phone number"
              placeholderTextColor="#9c88b0"
              keyboardType="phone-pad"
              value={newContact}
              onChangeText={setNewContact}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveBtn]}
                onPress={addEmergencyContact}
              >
                <Text style={styles.modalButtonText}>Add Contact</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalCloseBtn]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={contacts}
              style={{ marginTop: 15, maxHeight: 180 }}
              keyExtractor={(item: EmergencyContactRecord, index: number) => (item.id ? item.id.toString() : index.toString())}
              renderItem={({ item, index }: { item: EmergencyContactRecord; index: number }) => (
                <View style={styles.contactItemRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 }}>
                    <Ionicons name="call" size={16} color="#8e24aa" style={{ marginRight: 8 }} />
                    <View>
                      {item.name ? <Text style={[styles.contactPhoneText, { fontWeight: "700" }]}>{item.name}</Text> : null}
                      <Text style={styles.contactPhoneText}>{item.phone}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => deleteContact(item, index)}>
                    <Ionicons name="trash" size={18} color="#e53935" />
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </AmbientBackground>
  );
}

// Reusable feature card
function FeatureCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: any;
  title: string;
  description: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={styles.cardContainer}>
      <LinearGradient
        colors={["rgba(255, 255, 255, 0.96)", "rgba(247, 242, 250, 0.96)"]}
        style={styles.card}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconWrapper}>
            {icon}
          </View>
          <View style={styles.cardTextGroup}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardDesc}>{description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#ab47bc" />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: "900",
    color: "#1C0D2B",
    letterSpacing: 0.5,
  },
  subtext: {
    fontSize: 13,
    color: "#6E5A80",
    marginTop: 4,
    textAlign: "center",
  },
  masterToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 18,
    borderRadius: 22,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    elevation: 3,
    shadowColor: "#0F031D",
    shadowOpacity: 0.05,
    shadowRadius: 14,
  },
  toggleTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  masterTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1C0D2B",
  },
  masterSub: {
    fontSize: 12,
    color: "#6E5A80",
    marginTop: 2,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffebee",
    padding: 12,
    borderRadius: 14,
    marginBottom: 15,
  },
  errorText: {
    color: "#d50000",
    fontSize: 13,
    fontWeight: "600",
  },
  cardContainer: {
    marginBottom: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    elevation: 2,
    shadowColor: "#0F031D",
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#8e24aa",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  cardTextGroup: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#2a0845",
  },
  cardDesc: {
    fontSize: 13,
    color: "#6b5b7b",
    marginTop: 2,
  },
  measuringBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    padding: 12,
    borderRadius: 14,
    marginBottom: 15,
  },
  measuringText: {
    color: "#ff80ab",
    fontWeight: "700",
    marginLeft: 10,
    fontSize: 13,
  },
  contactsButton: {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 20,
    elevation: 4,
  },
  contactsText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#8e24aa",
  },
  sosButtonWrapper: {
    borderRadius: 30,
    overflow: "hidden",
    marginTop: 10,
    shadowColor: "#ff1744",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  sosButton: {
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    borderRadius: 30,
  },
  sosText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  sosSubText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(20, 5, 30, 0.65)",
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    padding: 24,
    borderRadius: 26,
    width: "100%",
    maxWidth: 340,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#2a0845",
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: "#6b5b7b",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: "#f7f2fa",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.2)",
    padding: 14,
    borderRadius: 14,
    fontSize: 15,
    color: "#2a0845",
    marginBottom: 16,
  },
  modalActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    flex: 1,
    alignItems: "center",
  },
  modalSaveBtn: {
    backgroundColor: "#8e24aa",
    marginRight: 8,
  },
  modalButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  modalCloseBtn: {
    backgroundColor: "#eee5f3",
  },
  modalCloseText: {
    color: "#6b5b7b",
    fontWeight: "700",
    fontSize: 14,
  },
  contactItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fcf8fd",
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.1)",
  },
  contactPhoneText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2a0845",
  },
});
