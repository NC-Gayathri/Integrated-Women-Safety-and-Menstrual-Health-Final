import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { BarChart, LineChart } from "react-native-chart-kit";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const screenWidth = Dimensions.get("window").width;

/* ---------------- NOTIFICATION HANDLER ---------------- */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/* ---------------- APP ---------------- */
export default function FitMindScreen() {
  const [steps] = useState<number[]>([4000, 6000, 8000, 5000, 9000, 7500, 11000]);
  const [todaySteps] = useState<number>(8500);
  const [water, setWater] = useState<number>(4);
  const [heart] = useState<number>(76);
  const [journal, setJournal] = useState<string>("");
  const [workoutDone, setWorkoutDone] = useState<boolean>(false);

  const calories = (todaySteps * 0.04).toFixed(0);
  const distance = (todaySteps * 0.0008).toFixed(2);
  const active = Math.floor(todaySteps / 100);

  /* -------- ANIMATION -------- */
  const move = useSharedValue(0);

  useEffect(() => {
    move.value = withRepeat(withTiming(1, { duration: 7000 }), -1, true);
  }, []);

  const bgAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: move.value * 40 }],
  }));

  /* -------- PERMISSIONS -------- */
  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Enable notifications for reminders!");
    }
  };

  /* -------- REMINDER -------- */
  const setWorkoutReminder = async () => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Workout Time 💪",
        body: "Don't skip today!",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10,
        repeats: false,
      },
    });

    Alert.alert("Reminder set!");
  };

  /* -------- UI -------- */
  return (
    <View style={{ flex: 1 }}>
      {/* BACKGROUND */}
      <Animated.View style={[styles.bg, bgAnim]}>
        <LinearGradient
          colors={["#F8FAFC", "#F4EFFB", "#FAF7FC", "#F8FAFC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>FitMind Pro</Text>

        {/* HERO */}
        <Animated.View entering={FadeInDown}>
          <View style={styles.hero}>
            <Text style={styles.big}>{todaySteps.toLocaleString()}</Text>
            <Text style={styles.label}>Daily Steps Target (10,000)</Text>

            <View style={styles.progressBar}>
              <LinearGradient
                colors={["#00e676", "#00b0ff"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  width: `${Math.min(100, (todaySteps / 10000) * 100)}%`,
                  height: 12,
                  borderRadius: 10,
                }}
              />
            </View>
          </View>
        </Animated.View>

        {/* STATS GRID */}
        <View style={styles.grid}>
          <Stat icon="🔥" value={calories} label="Calories (kcal)" />
          <Stat icon="❤️" value={heart} label="Heart BPM" />
          <Stat icon="📍" value={distance} label="Distance (KM)" />
          <Stat icon="⏱" value={active} label="Active Min" />
        </View>

        {/* WATER */}
        <Section title="💧 Hydration Tracker">
          <Text style={styles.big}>{water} Glasses</Text>
          <Row>
            <Btn text="+1 Glass" onPress={() => setWater(water + 1)} />
            <Btn text="-1 Glass" onPress={() => setWater(Math.max(0, water - 1))} />
          </Row>
        </Section>

        {/* WORKOUT */}
        <Section title="🏋️ Today's Workout">
          <TouchableOpacity
            style={styles.workoutStatusCard}
            activeOpacity={0.8}
            onPress={() => setWorkoutDone(!workoutDone)}
          >
            <Text style={styles.workoutStatusText}>
              {workoutDone ? "✅ Workout Completed!" : "⬜ Mark Workout Done"}
            </Text>
          </TouchableOpacity>

          <Btn text="⏰ Schedule Workout Reminder" onPress={setWorkoutReminder} />
        </Section>

        {/* JOURNAL */}
        <Section title="📝 Mindfulness Journal">
          <TextInput
            placeholder="How are you feeling today? Write your thoughts..."
            placeholderTextColor="#a090b0"
            style={styles.input}
            value={journal}
            onChangeText={setJournal}
            multiline
          />
        </Section>

        {/* LINE CHART */}
        <Section title="📈 Weekly Step Trend">
          <View style={styles.chartContainer}>
            <LineChart
              data={{
                labels: ["M", "T", "W", "T", "F", "S", "S"],
                datasets: [{ data: steps }],
              }}
              width={screenWidth - 72}
              height={210}
              chartConfig={chartConfig}
              yAxisLabel=""
              yAxisSuffix=""
              bezier
              style={{ borderRadius: 18 }}
            />
          </View>
        </Section>

        {/* BAR CHART */}
        <Section title="📊 Daily Comparison">
          <View style={styles.chartContainer}>
            <BarChart
              data={{
                labels: ["M", "T", "W", "T", "F", "S", "S"],
                datasets: [{ data: steps }],
              }}
              width={screenWidth - 72}
              height={210}
              chartConfig={chartConfig}
              yAxisLabel=""
              yAxisSuffix=""
              style={{ borderRadius: 18 }}
            />
          </View>
        </Section>

        {/* CALENDAR */}
        <Section title="📅 Monthly Activity Heatmap">
          <View style={styles.calendar}>
            {steps.map((s, i) => (
              <View
                key={i}
                style={[
                  styles.day,
                  {
                    backgroundColor:
                      s > 8000 ? "#00e676" : s > 5000 ? "#ffb74d" : "#ff5252",
                  },
                ]}
              >
                <Text style={styles.dayText}>{i + 1}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* INSIGHTS */}
        <Section title="🧠 AI Health Insights">
          <Text style={styles.text}>🔥 Burned {calories} kcal today</Text>
          <Text style={styles.text}>🚶 1,500 more steps to hit goal</Text>
          <Text style={styles.text}>💧 Drink 2 more glasses of water</Text>
        </Section>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

/* ---------------- COMPONENTS ---------------- */
const Stat = ({ icon, value, label }: any) => (
  <View style={styles.card}>
    <Text style={{ fontSize: 24, marginBottom: 4 }}>{icon}</Text>
    <Text style={styles.value}>{value}</Text>
    <Text style={styles.small}>{label}</Text>
  </View>
);

const Section = ({ title, children }: any) => (
  <View style={styles.section}>
    <Text style={styles.title}>{title}</Text>
    {children}
  </View>
);

const Btn = ({ text, onPress }: any) => (
  <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={onPress}>
    <Text style={{ color: "#ffffff", fontWeight: "700", textAlign: "center" }}>{text}</Text>
  </TouchableOpacity>
);

const Row = ({ children }: any) => (
  <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 8 }}>
    {children}
  </View>
);

/* ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  bg: { ...StyleSheet.absoluteFillObject },

  header: {
    fontSize: 32,
    fontWeight: "900",
    color: "#1C0D2B",
    textAlign: "center",
    marginTop: Platform.OS === "ios" ? 56 : 40,
    letterSpacing: 0.8,
  },

  hero: {
    marginHorizontal: 18,
    marginTop: 18,
    marginBottom: 10,
    padding: 24,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#0F031D",
    shadowOpacity: 0.05,
    shadowRadius: 14,
  },

  big: { fontSize: 36, fontWeight: "900", color: "#1C0D2B", textAlign: "center" },
  label: { color: "#6E5A80", fontSize: 13, fontWeight: "600", marginTop: 4 },

  progressBar: {
    width: "100%",
    backgroundColor: "rgba(142, 36, 170, 0.08)",
    height: 12,
    borderRadius: 10,
    marginTop: 14,
    overflow: "hidden",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },

  card: {
    width: "48%",
    marginVertical: 6,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#0F031D",
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },

  value: { color: "#1C0D2B", fontSize: 20, fontWeight: "800" },
  small: { color: "#6E5A80", fontSize: 12, fontWeight: "600", marginTop: 2 },

  section: {
    marginHorizontal: 18,
    marginTop: 14,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    elevation: 2,
    shadowColor: "#0F031D",
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },

  title: { color: "#1C0D2B", fontSize: 18, fontWeight: "800", marginBottom: 10 },

  text: { color: "#2D0B3F", marginTop: 6, fontSize: 14, fontWeight: "600" },

  input: {
    backgroundColor: "#F9F6FC",
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    fontSize: 15,
    color: "#2a0845",
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.12)",
  },

  btn: {
    backgroundColor: "#8e24aa",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    margin: 4,
    elevation: 3,
  },

  workoutStatusCard: {
    backgroundColor: "#F9F6FC",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
  },
  workoutStatusText: {
    color: "#8e24aa",
    fontSize: 15,
    fontWeight: "700",
  },

  chartContainer: {
    alignItems: "center",
    marginTop: 8,
  },

  calendar: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    justifyContent: "flex-start",
  },

  day: {
    width: 38,
    height: 38,
    margin: 4,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
  },
  dayText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
});

/* ---------------- CHART CONFIG ---------------- */
const chartConfig = {
  backgroundGradientFrom: "transparent",
  backgroundGradientTo: "transparent",
  color: (opacity = 1) => `rgba(142, 36, 170, ${opacity})`,
  labelColor: () => "#1C0D2B",
  propsForBackgroundLines: {
    stroke: "rgba(142, 36, 170, 0.1)",
  },
};