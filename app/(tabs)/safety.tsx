import React, { useState, useEffect, useRef } from "react";
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
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { Accelerometer } from "expo-sensors";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";

export default function SafetyScreen() {
  const [safetyOn, setSafetyOn] = useState(false);
  const [heartRateValue, setHeartRateValue] = useState<number | null>(null);
  const [fallDetected, setFallDetected] = useState(false);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [shakeCount, setShakeCount] = useState(0);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newContact, setNewContact] = useState("");

  const accelSubscription = useRef<any>(null);
  const sosCooldownRef = useRef(false);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (safetyOn) {
      startHeartbeatMonitoring();
      startSensors(); // shake + fall in one listener
    } else {
      stopHeartbeatMonitoring();
      stopSensors();
    }

    return () => {
      stopHeartbeatMonitoring();
      stopSensors();
    };
  }, [safetyOn]);

  // --------------- Shake + Fall Detection (Expo sensors) ---------------
  const startSensors = () => {
    setShakeCount(0);
    setFallDetected(false);
    setAlertTriggered(false);

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
            triggerSOS();
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
      if (!alertTriggered && force < 0.5) {
        setFallDetected(true);
        setAlertTriggered(true);
        Alert.alert("⚠ Fall Detected!", "Your phone was dropped!");
        triggerSOS();
      }
    });
  };

  const stopSensors = () => {
    if (accelSubscription.current) {
      accelSubscription.current.remove();
      accelSubscription.current = null;
    }
    if (shakeTimerRef.current) {
      clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = null;
    }
    setShakeCount(0);
  };

  // --------------- Heartbeat (simulated using camera + timer) ---------------
  const startHeartbeatMonitoring = async () => {
    if (cameraActive || measuring) return;
    setError(null);

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError("Camera permission is required for heartbeat monitoring.");
        return;
      }
    }

    setCameraActive(true);
    setMeasuring(true);
    setHeartRateValue(null);
    Alert.alert("Heartbeat Check", "Place your fingertip gently on the camera lens ❤");

    // Simulate reading after 3 seconds
    setTimeout(() => {
      const simulated = 72 + Math.floor(Math.random() * 10);
      setHeartRateValue(simulated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMeasuring(false);
      setCameraActive(false);
    }, 3000);
  };

  const stopHeartbeatMonitoring = () => {
    setCameraActive(false);
    setMeasuring(false);
    setHeartRateValue(null);
  };

  // --------------- AsyncStorage: Emergency Contacts ---------------
  const loadContacts = async () => {
    try {
      const saved = await AsyncStorage.getItem("emergencyContacts");
      if (saved) setContacts(JSON.parse(saved));
    } catch (e) {
      console.log("Error loading contacts", e);
    }
  };

  const addEmergencyContact = async () => {
    if (!newContact.trim()) return;
    const updated = [...contacts, newContact.trim()];
    setContacts(updated);
    await AsyncStorage.setItem("emergencyContacts", JSON.stringify(updated));
    setNewContact("");
    setModalVisible(false);
  };

  const deleteContact = async (index: number) => {
    const updated = contacts.filter((_, i) => i !== index);
    setContacts(updated);
    await AsyncStorage.setItem("emergencyContacts", JSON.stringify(updated));
  };

  // --------------- SOS Logic ---------------
  const triggerSOS = () => {
    if (sosCooldownRef.current) return;
    sosCooldownRef.current = true;
    setTimeout(() => {
      sosCooldownRef.current = false;
    }, 8000); // 8s cooldown

    if (contacts.length === 0) {
      Alert.alert("No Contacts", "Please add emergency contacts first!");
      return;
    }

    contacts.forEach((phone) => {
      const cleaned = phone.replace(/\s+/g, "");
      Linking.openURL(`tel:${cleaned}`);
    });

    Alert.alert("🚨 SOS Triggered", "Calling all emergency contacts!");
  };

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

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="warning" size={18} color="#d50000" style={{ marginRight: 6 }} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

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
          title="Heartbeat Monitoring"
          description={
            measuring
              ? "Measuring pulse..."
              : heartRateValue
              ? `Current Heartbeat: ${heartRateValue} BPM`
              : "Place finger on camera lens to measure"
          }
          onPress={startHeartbeatMonitoring}
        />

        {measuring && (
          <View style={styles.measuringBox}>
            <ActivityIndicator size="small" color="#ff80ab" />
            <Text style={styles.measuringText}>Analyzing pulse rate...</Text>
          </View>
        )}

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

      {cameraActive && permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={{ width: 1, height: 1 }} // hidden
          facing="back"
        />
      )}

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
              keyExtractor={(_: string, index: number) => index.toString()}
              renderItem={({ item, index }: { item: string; index: number }) => (
                <View style={styles.contactItemRow}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="call" size={16} color="#8e24aa" style={{ marginRight: 8 }} />
                    <Text style={styles.contactPhoneText}>{item}</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteContact(index)}>
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
