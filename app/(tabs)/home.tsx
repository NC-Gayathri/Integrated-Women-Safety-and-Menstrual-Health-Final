// app/(tabs)/home.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Swiper from "react-native-swiper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { AuthService } from "@/services/AuthService";

const { width } = Dimensions.get("window");

type Challenge = { id: number; text: string; done: boolean };

export default function HomeScreen() {
  const navigation = useNavigation<any>();

  const quotes = [
    "✨ Empowered women empower the world ✨",
    "🌸 Your health is your superpower 🌸",
    "💪 Strong. Confident. Unstoppable 💪",
    "💕 Self-care is not selfish, it’s essential 💕",
    "🌿 Balance your body, mind & soul 🌿",
  ];

  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [newChallenge, setNewChallenge] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [hoorayModalVisible, setHoorayModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // 🔁 Load the *current* logged-in user's name & email whenever Home comes into focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadUser = async () => {
        try {
          const loggedIn = await AuthService.isLoggedIn();
          if (!loggedIn) {
            if (isMounted) router.replace("/login");
            return;
          }

          const storedName = await AsyncStorage.getItem("currentUserName");
          const storedEmail = await AsyncStorage.getItem("currentUserEmail");
          if (isMounted) {
            setUserName(storedName ?? "");
            setUserEmail(storedEmail ?? "");
          }
        } catch (e) {
          console.log("Error loading user info", e);
        }
      };
      loadUser();
      return () => {
        isMounted = false;
      };
    }, [])
  );

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out of Naari Kavach?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            setProfileModalVisible(false);
            await AuthService.logout();
            Alert.alert("Logged Out", "You have been logged out successfully.");
            router.replace("/login");
          },
        },
      ]
    );
  };

  // Load saved challenges once
  useEffect(() => {
    const loadChallenges = async () => {
      const saved = await AsyncStorage.getItem("challenges");
      if (saved) setChallenges(JSON.parse(saved));
      else
        setChallenges([
          { id: 1, text: "Drink 8 cups of water 💧", done: false },
          { id: 2, text: "Take a 20 min walk 🚶‍♀️", done: false },
          { id: 3, text: "Meditate for 10 min 🧘", done: false },
        ]);
    };
    loadChallenges();
  }, []);

  const saveChallenges = async (updated: Challenge[]) => {
    setChallenges(updated);
    await AsyncStorage.setItem("challenges", JSON.stringify(updated));
  };

  const toggleChallenge = (id: number) => {
    const updated = challenges.map((c) =>
      c.id === id ? { ...c, done: !c.done } : c
    );
    saveChallenges(updated);
    if (updated.every((c) => c.done)) setHoorayModalVisible(true);
  };

  const deleteChallenge = (id: number) => {
    const updated = challenges.filter((c) => c.id !== id);
    saveChallenges(updated);
  };

  const addChallenge = () => {
    if (!newChallenge.trim()) return;
    const updated = [
      ...challenges,
      { id: Date.now(), text: newChallenge, done: false },
    ];
    saveChallenges(updated);
    setNewChallenge("");
    setModalVisible(false);
  };

  return (
    <AmbientBackground style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Top App Header */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.greetingTitle}>
              {userName ? `Hello, ${userName} 👋` : "Welcome Back 👋"}
            </Text>
            <Text style={styles.subtext}>
              Your safety & holistic wellness space
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setProfileModalVisible(true)}
            activeOpacity={0.8}
            style={styles.avatarBadge}
          >
            <Text style={styles.avatarInitial}>
              {userName ? userName.charAt(0).toUpperCase() : "👤"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quote Carousel Card */}
        <View style={styles.carouselContainer}>
          <Swiper
            autoplay
            autoplayTimeout={3.5}
            showsPagination
            dotStyle={styles.dot}
            activeDotStyle={styles.activeDot}
          >
            {quotes.map((quote, index) => (
              <View key={index} style={styles.quoteSlide}>
                <MaterialCommunityIcons
                  name="format-quote-open"
                  size={20}
                  color="rgba(255, 128, 171, 0.6)"
                  style={{ marginBottom: 4 }}
                />
                <Text style={styles.quoteText}>{quote}</Text>
              </View>
            ))}
          </Swiper>
        </View>

        {/* Quick Nav Header */}
        <Text style={styles.sectionHeaderTitle}>⚡ Quick Access</Text>

        {/* Feature Cards 2x2 Grid */}
        <View style={styles.cardContainer}>
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.88}
            onPress={() => navigation.navigate("safety")}
          >
            <LinearGradient
              colors={["#ff5252", "#d50000"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              <View style={styles.cardIconWrapper}>
                <Ionicons name="shield-checkmark" size={32} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Safety</Text>
              <Text style={styles.cardText}>SOS, alerts & AI detection 🚨</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.88}
            onPress={() => navigation.navigate("menstrual")}
          >
            <LinearGradient
              colors={["#ec407a", "#ab47bc"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              <View style={styles.cardIconWrapper}>
                <MaterialCommunityIcons name="heart-pulse" size={32} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Menstrual</Text>
              <Text style={styles.cardText}>Cycle, tips & reminders 🌙</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.88}
            onPress={() => navigation.navigate("fitmind")}
          >
            <LinearGradient
              colors={["#00b4d8", "#0077b6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              <View style={styles.cardIconWrapper}>
                <Ionicons name="barbell" size={32} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Fitness</Text>
              <Text style={styles.cardText}>Steps, calories & workouts 💪</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.88}
            onPress={() => navigation.navigate("fitmind")}
          >
            <LinearGradient
              colors={["#2a9d8f", "#118ab2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              <View style={styles.cardIconWrapper}>
                <Ionicons name="leaf" size={32} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Mindfulness</Text>
              <Text style={styles.cardText}>Meditation & calm focus 🌿</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Wellness Challenges Card */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>🌟 Daily Wellness Goals</Text>
            <Text style={styles.challengeCountText}>
              {challenges.filter((c) => c.done).length}/{challenges.length} Done
            </Text>
          </View>

          {challenges.map((c) => (
            <View key={c.id} style={styles.challengeWrapper}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.challengeItem, c.done && styles.challengeDone]}
                onPress={() => toggleChallenge(c.id)}
              >
                <Ionicons
                  name={c.done ? "checkmark-circle" : "ellipse-outline"}
                  size={24}
                  color={c.done ? "#2e7d32" : "#8e24aa"}
                  style={{ marginRight: 10 }}
                />
                <Text
                  style={[
                    styles.challengeText,
                    c.done && styles.challengeTextDone,
                  ]}
                >
                  {c.text}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => deleteChallenge(c.id)}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={20} color="#e53935" />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.85}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.addButtonText}>Add New Goal</Text>
          </TouchableOpacity>
        </View>

        {/* Account & Profile Card */}
        <View style={styles.accountSection}>
          <View style={styles.accountHeaderRow}>
            <View style={styles.accountAvatar}>
              <Text style={styles.accountAvatarText}>
                {userName ? userName.charAt(0).toUpperCase() : "👤"}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.accountNameText}>{userName || "Authenticated User"}</Text>
              <Text style={styles.accountEmailText}>{userEmail || "Active Session"}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.85}
            style={styles.logoutButton}
          >
            <Ionicons name="log-out-outline" size={20} color="#d32f2f" style={{ marginRight: 8 }} />
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Profile & Settings Modal */}
      <Modal transparent visible={profileModalVisible} animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.profileModalContent}>
            <View style={styles.profileModalHeader}>
              <View style={styles.profileBigAvatar}>
                <Text style={styles.profileBigAvatarText}>
                  {userName ? userName.charAt(0).toUpperCase() : "👤"}
                </Text>
              </View>
              <Text style={styles.profileModalName}>{userName || "Member"}</Text>
              <Text style={styles.profileModalEmail}>{userEmail || "Connected"}</Text>
              <View style={styles.protectedBadge}>
                <Ionicons name="shield-checkmark" size={14} color="#2e7d32" style={{ marginRight: 4 }} />
                <Text style={styles.protectedBadgeText}>Naari Kavach Protected</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleLogout}
              activeOpacity={0.85}
              style={styles.modalLogoutBtn}
            >
              <Ionicons name="log-out-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.modalLogoutText}>Log Out</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setProfileModalVisible(false)}
              activeOpacity={0.7}
              style={styles.profileModalCloseBtn}
            >
              <Text style={styles.profileModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Challenge Modal */}
      <Modal transparent visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeaderTitle}>Add Wellness Goal</Text>
            <Text style={styles.modalHeaderSub}>
              Set a daily task for self-care & health
            </Text>
            <TextInput
              placeholder="e.g. Drink 8 cups of water..."
              placeholderTextColor="#9c88b0"
              style={styles.modalInput}
              value={newChallenge}
              onChangeText={setNewChallenge}
            />
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalActionBtn, styles.modalAddBtn]}
                onPress={addChallenge}
              >
                <Text style={styles.modalActionText}>Add Goal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalActionBtn, styles.modalCancelBtn]}
                onPress={() => {
                  setModalVisible(false);
                  setNewChallenge("");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hooray Modal */}
      <Modal transparent visible={hoorayModalVisible} animationType="fade">
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { alignItems: "center" }]}>
            <Text style={{ fontSize: 44, marginBottom: 8 }}>🎉</Text>
            <Text style={styles.hoorayTitle}>Goal Mastery!</Text>
            <Text style={styles.modalText}>
              Amazing job! You have completed all your daily wellness challenges today.
            </Text>
            <TouchableOpacity
              style={[styles.modalAddBtn, { paddingHorizontal: 30, marginTop: 16 }]}
              onPress={() => setHoorayModalVisible(false)}
            >
              <Text style={styles.modalActionText}>Awesome</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greetingTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#1C0D2B",
    letterSpacing: 0.5,
  },
  subtext: {
    fontSize: 13,
    color: "#6E5A80",
    marginTop: 2,
    fontWeight: "500",
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(142, 36, 170, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.12)",
  },
  carouselContainer: {
    height: 125,
    width: "100%",
    marginBottom: 22,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    elevation: 2,
    shadowColor: "#0F031D",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  quoteSlide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  quoteText: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    color: "#2D0B3F",
    lineHeight: 22,
  },
  dot: {
    backgroundColor: "rgba(142, 36, 170, 0.18)",
    width: 7,
    height: 7,
    borderRadius: 4,
    margin: 3,
  },
  activeDot: {
    backgroundColor: "#8e24aa",
    width: 18,
    height: 7,
    borderRadius: 4,
    margin: 3,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C0D2B",
    marginBottom: 14,
    letterSpacing: 0.4,
  },
  cardContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  card: {
    width: "48%",
    height: 150,
    borderRadius: 22,
    marginBottom: 16,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#0F031D",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardGradient: {
    flex: 1,
    padding: 16,
    borderRadius: 22,
    justifyContent: "space-between",
  },
  cardIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 6,
  },
  cardText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "500",
  },
  section: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 24,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    elevation: 3,
    shadowColor: "#0F031D",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    width: "100%",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C0D2B",
  },
  challengeCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8e24aa",
    backgroundColor: "#f3e8f7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  challengeWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  challengeItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.15)",
    backgroundColor: "#fcf8fd",
  },
  challengeDone: {
    backgroundColor: "#e8f5e9",
    borderColor: "rgba(46, 125, 50, 0.3)",
  },
  challengeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2a0845",
    flex: 1,
  },
  challengeTextDone: {
    color: "#2e7d32",
    textDecorationLine: "line-through",
  },
  deleteBtn: {
    padding: 10,
    marginLeft: 4,
  },
  addButton: {
    marginTop: 12,
    backgroundColor: "#8e24aa",
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },
  addButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(20, 5, 30, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    padding: 24,
    borderRadius: 24,
    elevation: 8,
    width: "100%",
    maxWidth: 340,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#3c096c",
    marginBottom: 4,
  },
  modalHeaderSub: {
    fontSize: 13,
    color: "#6b5b7b",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: "#f7f2fa",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.2)",
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: "#2a0845",
    marginBottom: 18,
  },
  modalActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  modalActionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginLeft: 8,
  },
  modalAddBtn: {
    backgroundColor: "#8e24aa",
  },
  modalActionText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  modalCancelBtn: {
    backgroundColor: "#eee5f3",
  },
  modalCancelText: {
    color: "#6b5b7b",
    fontWeight: "700",
    fontSize: 14,
  },
  hoorayTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2e7d32",
    marginBottom: 6,
  },
  modalText: {
    fontSize: 14,
    textAlign: "center",
    color: "#4a148c",
    lineHeight: 20,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "800",
    color: "#8e24aa",
  },
  accountSection: {
    backgroundColor: "#ffffff",
    padding: 18,
    borderRadius: 22,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    elevation: 2,
    shadowColor: "#0F031D",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  accountHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3e5f5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#8e24aa",
  },
  accountAvatarText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#8e24aa",
  },
  accountNameText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1C0D2B",
  },
  accountEmailText: {
    fontSize: 13,
    color: "#6E5A80",
    fontWeight: "500",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffebee",
    borderWidth: 1,
    borderColor: "#ffcdd2",
    borderRadius: 14,
    paddingVertical: 12,
  },
  logoutButtonText: {
    color: "#d32f2f",
    fontSize: 14,
    fontWeight: "800",
  },
  profileModalContent: {
    backgroundColor: "#ffffff",
    padding: 24,
    borderRadius: 28,
    elevation: 8,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
  profileModalHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  profileBigAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#f3e5f5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#8e24aa",
  },
  profileBigAvatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#8e24aa",
  },
  profileModalName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1C0D2B",
    marginBottom: 4,
  },
  profileModalEmail: {
    fontSize: 14,
    color: "#6b5b7b",
    marginBottom: 10,
  },
  protectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f5e9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  protectedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2e7d32",
  },
  modalLogoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d32f2f",
    borderRadius: 14,
    paddingVertical: 13,
    width: "100%",
    marginBottom: 10,
  },
  modalLogoutText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  profileModalCloseBtn: {
    paddingVertical: 10,
    width: "100%",
    alignItems: "center",
  },
  profileModalCloseText: {
    color: "#6b5b7b",
    fontSize: 14,
    fontWeight: "700",
  },
});

